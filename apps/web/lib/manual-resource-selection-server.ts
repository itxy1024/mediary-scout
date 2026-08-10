import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  deadLinkKey,
  rankManualResources,
  type ManualResourceSelection,
  type ManualResourceTarget,
  type MediaTitle,
  type RankedManualResource,
  type ResourceCandidate,
} from "@media-track/workflow";
import { seriesTargetFor } from "./title-hub";
import {
  getAccountScopedSettings,
  getActiveWorkspaceScope,
  getCurrentAccountId,
  ensureDemoSeeded,
  getPreferredLanguage,
  getQualityPreference,
  getSessionSecret,
  getWorkerResourceProvider,
  getWorkflowRepository,
  movieTargetFromTmdbId,
  requireAuthenticatedAccountId,
  trackingTargetFromCandidateId,
} from "./workflow-runtime";

const TOKEN_TTL_MS = 30 * 60 * 1000;

export interface ManualResourcePickerInput extends ManualResourceTarget {
  storageId?: string;
}

export interface ManualResourcePickerItem extends RankedManualResource {
  token: string;
}

export interface ManualResourcePickerView {
  target: ManualResourceTarget;
  title: MediaTitle;
  scopeLabel: string;
  storageId?: string;
  preferredLanguage?: string;
  qualityPreference?: "high" | "medium";
  items: ManualResourcePickerItem[];
  sourceWarning?: string;
}

const targetSchema = z.object({
  kind: z.enum(["movie", "season", "remaining", "series"]),
  tmdbId: z.number().int().positive(),
  seasonNumber: z.number().int().positive().optional(),
});

const candidateSchema = z.object({
  id: z.string().min(1).max(512),
  snapshotId: z.string().min(1).max(512),
  index: z.number().int().nonnegative(),
  title: z.string().min(1).max(2000),
  type: z.enum(["115", "magnet", "manual", "quark", "tianyi", "123"]),
  source: z.string().max(512),
  providerPayload: z.record(z.string(), z.unknown()),
});

const tokenPayloadSchema = z.object({
  version: z.literal(1),
  accountId: z.string().min(1),
  connectedStorageId: z.string().nullable(),
  expiresAt: z.number().int().positive(),
  target: targetSchema,
  candidate: candidateSchema,
});

type SelectionTokenPayload = z.infer<typeof tokenPayloadSchema>;

/** 检索完整的裸标题结果，过滤已知死链，再按匹配度和当前账号偏好排序。 */
export async function getManualResourcePickerView(
  input: ManualResourcePickerInput,
): Promise<ManualResourcePickerView> {
  const accountId = await requireAuthenticatedAccountId();
  const scope = await getActiveWorkspaceScope(input.storageId);
  if (scope.accountId !== accountId) {
    throw new Error("当前账号无权访问该资源选择页。");
  }
  const resolved = await resolvePickerTarget(input);
  const repository = getWorkflowRepository();
  await ensureDemoSeeded(repository);
  const settings = getAccountScopedSettings(accountId);
  const drives = await repository.listConnectedStorages(accountId);
  const drive = scope.connectedStorageId
    ? drives.find((item) => item.id === scope.connectedStorageId)
    : drives[0];
  if (!drive) {
    throw new Error("请先绑定一个网盘，再检索可保存的资源。");
  }

  const provider = await getWorkerResourceProvider(settings, drive.provider, accountId);
  const snapshot = await provider.search({ keyword: resolved.title.title });
  const deadKeys = new Set(await repository.listDeadLinkKeys());
  const candidates = snapshot.candidates.filter((candidate) => {
    const identity = deadLinkKey(String(candidate.providerPayload["url"] ?? ""));
    return !(identity && deadKeys.has(identity.key));
  });
  const [preferredLanguage, qualityPreference] = await Promise.all([
    getPreferredLanguage(settings),
    getQualityPreference(settings),
  ]);
  const ranked = rankManualResources({
    candidates,
    target: {
      title: resolved.title.title,
      aliases: [resolved.title.originalTitle, ...resolved.title.aliases].filter(Boolean),
      year: resolved.title.year,
      seasonNumbers: resolved.seasonNumbers,
    },
    ...(preferredLanguage ? { preferredLanguage } : {}),
    ...(qualityPreference ? { qualityPreference } : {}),
  });

  const items = await Promise.all(
    ranked.map(async (item) => ({
      ...item,
      token: await signSelection({
        version: 1,
        accountId,
        connectedStorageId: scope.connectedStorageId,
        expiresAt: Date.now() + TOKEN_TTL_MS,
        target: resolved.target,
        candidate: item.candidate,
      }),
    })),
  );

  const health = snapshot.sourceHealth?.status;
  const sourceWarning =
    health && health !== "healthy"
      ? health === "degraded"
        ? "部分资源源暂时不可用，当前列表可能不完整。"
        : "资源源当前不可用，未能取得完整候选。"
      : undefined;
  return {
    target: resolved.target,
    title: resolved.title,
    scopeLabel: resolved.scopeLabel,
    ...(input.storageId ? { storageId: input.storageId } : {}),
    ...(preferredLanguage ? { preferredLanguage } : {}),
    ...(qualityPreference ? { qualityPreference } : {}),
    items,
    ...(sourceWarning ? { sourceWarning } : {}),
  };
}

/** 验证选择令牌，并把账号、网盘与候选重新收敛为服务端可信输入。 */
export async function verifyManualResourceSelectionToken(token: string): Promise<{
  selection: ManualResourceSelection;
  connectedStorageId: string | null;
}> {
  if (!token || token.length > 32_000) throw new Error("资源选择已失效，请重新检索。");
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) throw new Error("资源选择令牌格式无效。");
  const expected = signatureFor(body, await getSessionSecret());
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    throw new Error("资源选择令牌校验失败。");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new Error("资源选择令牌无法解析。");
  }
  const payload = tokenPayloadSchema.parse(decoded);
  if (payload.expiresAt < Date.now()) throw new Error("候选列表已过期，请重新检索。");
  const accountId = await getCurrentAccountId();
  if (payload.accountId !== accountId) throw new Error("该资源选择不属于当前账号。");
  if (payload.connectedStorageId) {
    const owned = (await getWorkflowRepository().listConnectedStorages(accountId)).some(
      (drive) => drive.id === payload.connectedStorageId,
    );
    if (!owned) throw new Error("目标网盘已不可用，请返回后重新选择。");
  }
  return {
    selection: {
      target: {
        kind: payload.target.kind,
        tmdbId: payload.target.tmdbId,
        ...(payload.target.seasonNumber !== undefined
          ? { seasonNumber: payload.target.seasonNumber }
          : {}),
      },
      candidate: payload.candidate as ResourceCandidate,
    },
    connectedStorageId: payload.connectedStorageId,
  };
}

function signatureFor(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

async function signSelection(payload: SelectionTokenPayload): Promise<string> {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${signatureFor(body, await getSessionSecret())}`;
}

async function resolvePickerTarget(input: ManualResourcePickerInput): Promise<{
  target: ManualResourceTarget;
  title: MediaTitle;
  seasonNumbers: number[];
  scopeLabel: string;
}> {
  if (input.kind === "movie") {
    const movie = await movieTargetFromTmdbId(input.tmdbId);
    if (!movie) throw new Error("无法读取该电影的信息。");
    return {
      target: { kind: "movie", tmdbId: input.tmdbId },
      title: movie.title,
      seasonNumbers: [],
      scopeLabel: "电影",
    };
  }

  if (input.kind === "season") {
    if (!input.seasonNumber) throw new Error("缺少要获取的季数。");
    const season = await trackingTargetFromCandidateId(
      `tmdb_tv_${input.tmdbId}_s${input.seasonNumber}`,
    );
    if (!season) throw new Error("无法读取该季的信息。");
    return {
      target: { kind: "season", tmdbId: input.tmdbId, seasonNumber: input.seasonNumber },
      title: season.title,
      seasonNumbers: [input.seasonNumber],
      scopeLabel: `第 ${input.seasonNumber} 季`,
    };
  }

  const series = await seriesTargetFor(input.tmdbId);
  if (!series) throw new Error("无法读取该剧的季信息。");
  let seasonNumbers = series.seasons.map((season) => season.seasonNumber);
  if (input.kind === "remaining") {
    const scope = await getActiveWorkspaceScope(input.storageId);
    const tracked = new Set(
      (await getWorkflowRepository().listTrackedSeasonStates(scope))
        .filter((state) => state.title.tmdbId === input.tmdbId && state.title.type !== "movie")
        .map((state) => state.season.seasonNumber),
    );
    seasonNumbers = seasonNumbers.filter((season) => !tracked.has(season));
  }
  if (seasonNumbers.length === 0) throw new Error("当前没有需要获取的季。");
  return {
    target: { kind: input.kind, tmdbId: input.tmdbId },
    title: series.title,
    seasonNumbers,
    scopeLabel: input.kind === "remaining" ? `剩余 ${seasonNumbers.length} 季` : `全 ${seasonNumbers.length} 季`,
  };
}
