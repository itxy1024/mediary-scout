import type {
  AuditEvent,
  ResourceCandidate,
  ResourceSnapshot,
} from "./domain.js";
import type { ResourceProvider } from "./ports.js";

export type ManualResourceTargetKind = "movie" | "season" | "remaining" | "series";

export interface ManualResourceTarget {
  kind: ManualResourceTargetKind;
  tmdbId: number;
  seasonNumber?: number;
}

export interface ManualResourceSelection {
  target: ManualResourceTarget;
  candidate: ResourceCandidate;
}

export interface ManualResourceRankingTarget {
  title: string;
  aliases: string[];
  year: number;
  seasonNumbers: number[];
}

export interface RankedManualResource {
  candidate: ResourceCandidate;
  score: number;
  reasons: string[];
}

/**
 * 对资源标题做可解释的确定性排序。分数只影响展示顺序，绝不会替用户自动选择。
 */
export function rankManualResources(input: {
  candidates: ResourceCandidate[];
  target: ManualResourceRankingTarget;
  qualityPreference?: "high" | "medium";
  preferredLanguage?: string;
}): RankedManualResource[] {
  return input.candidates
    .map((candidate, ordinal) => ({
      ...scoreCandidate(candidate, input),
      ordinal,
    }))
    .sort((left, right) => right.score - left.score || left.ordinal - right.ordinal)
    .map(({ ordinal: _ordinal, ...ranked }) => ranked);
}

export function createManualSelectionEvidence(input: {
  workflowRunId: string;
  keyword: string;
  selection: ManualResourceSelection;
  now: string;
}): { snapshot: ResourceSnapshot; auditEvent: AuditEvent } {
  const snapshotId = `manual_${input.workflowRunId}`;
  const candidateId = `${snapshotId}_candidate_1`;
  const candidate: ResourceCandidate = {
    ...structuredClone(input.selection.candidate),
    id: candidateId,
    snapshotId,
    index: 0,
    providerPayload: {
      ...structuredClone(input.selection.candidate.providerPayload),
      __manualSelectionTarget: structuredClone(input.selection.target),
    },
  };
  return {
    snapshot: {
      id: snapshotId,
      provider: "manual_selection",
      keyword: input.keyword,
      candidates: [candidate],
      createdAt: input.now,
    },
    auditEvent: {
      type: "manual_resource_selected",
      message: "User selected the only resource allowed for this workflow",
      data: {
        kind: input.selection.target.kind,
        tmdbId: input.selection.target.tmdbId,
        seasonNumber: input.selection.target.seasonNumber ?? null,
        candidateId,
        candidateTitle: candidate.title,
      },
    },
  };
}

/**
 * 手选任务的资源提供器只返回已签名并持久化的那一条资源。Agent 即使再次搜索，
 * 也看不到其他候选，因此失效时只能结束并等待用户重新选择。
 */
export function resourceProviderForManualSelection(input: {
  snapshots: ResourceSnapshot[];
  auditEvents: AuditEvent[];
  fallback: ResourceProvider;
}): ResourceProvider {
  const event = input.auditEvents.find((item) => item.type === "manual_resource_selected");
  if (!event) return input.fallback;

  const candidateId = event.data?.["candidateId"];
  const snapshot = input.snapshots.find((item) =>
    item.candidates.some((candidate) => candidate.id === candidateId),
  );
  if (!snapshot) {
    throw new Error("MANUAL_RESOURCE_SELECTION_MISSING: selected resource evidence is unavailable");
  }
  const selected = snapshot.candidates.find((candidate) => candidate.id === candidateId);
  if (!selected) {
    throw new Error("MANUAL_RESOURCE_SELECTION_MISSING: selected candidate is unavailable");
  }

  return {
    async search({ keyword }) {
      return {
        ...structuredClone(snapshot),
        keyword,
        candidates: [structuredClone(selected)],
      };
    },
  };
}

function scoreCandidate(
  candidate: ResourceCandidate,
  input: {
    target: ManualResourceRankingTarget;
    qualityPreference?: "high" | "medium";
    preferredLanguage?: string;
  },
): RankedManualResource {
  const raw = candidate.title;
  const text = normalize(raw);
  const compact = compactText(raw);
  const reasons: string[] = [];
  let score = 0;

  const titleTerms = [input.target.title, ...input.target.aliases]
    .map((term) => ({ raw: term, compact: compactText(term) }))
    .filter((term) => term.compact.length >= 2);
  const matched = titleTerms.find((term) => compact.includes(term.compact));
  if (matched) {
    score += matched.raw === input.target.title ? 100 : 82;
    reasons.push(matched.raw === input.target.title ? "片名匹配" : "别名匹配");
  } else {
    score -= 90;
    reasons.push("片名匹配较弱");
  }

  const years = [...raw.matchAll(/(?:19|20)\d{2}/g)].map((match) => Number(match[0]));
  if (years.includes(input.target.year)) {
    score += 12;
    reasons.push("年份匹配");
  } else if (years.length > 0) {
    score -= 14;
    reasons.push("年份可能不符");
  }

  const explicitSeasons = seasonNumbersIn(raw);
  if (input.target.seasonNumbers.length === 1) {
    const desired = input.target.seasonNumbers[0]!;
    if (explicitSeasons.has(desired)) {
      score += 32;
      reasons.push(`第 ${desired} 季匹配`);
    } else if (explicitSeasons.size > 0) {
      score -= 28;
      reasons.push("季范围可能不符");
    }
  } else if (input.target.seasonNumbers.length > 1) {
    const covered = input.target.seasonNumbers.filter((season) => explicitSeasons.has(season)).length;
    if (/全集|全季|全\s*\d+\s*季|complete|collection|season\s*1\s*[-~至]/i.test(raw)) {
      score += 28;
      reasons.push("整季/全集候选");
    } else if (covered > 0) {
      score += Math.min(24, covered * 8);
      reasons.push(`覆盖 ${covered} 个目标季`);
    }
  }

  const high = /\b(?:2160p|4k|uhd|remux)\b/i.test(text);
  const medium = /\b(?:1080p|1080i|bluray|blu-ray|bdrip|web-?dl)\b/i.test(text);
  const low = /\b(?:720p|cam|ts|tc)\b/i.test(text);
  const disc = /\b(?:bdmv|iso)\b|蓝光原盘|整盘/i.test(text);
  if (input.qualityPreference === "high") {
    if (high && !disc) {
      score += 24;
      reasons.push("符合高画质偏好");
    } else if (medium) {
      score += 10;
      reasons.push("画质可接受");
    }
    if (disc) {
      score -= 18;
      reasons.push("整盘格式体积较大");
    }
  } else if (input.qualityPreference === "medium") {
    if (medium && !high) {
      score += 24;
      reasons.push("符合 1080P 偏好");
    }
    if (high || disc) {
      score -= 24;
      reasons.push("高于画质上限");
    }
  }
  if (low) score -= 8;

  if (input.preferredLanguage?.includes("中文")) {
    if (/中字|中文字幕|简体|繁体|简繁|国英|双语|chs|cht/i.test(raw)) {
      score += 18;
      reasons.push("符合中文偏好");
    } else if (/\braw\b|无字|无字幕/i.test(raw)) {
      score -= 14;
      reasons.push("可能无中文字幕");
    }
  }

  if (candidate.type !== "magnet") {
    score += 4;
    reasons.push("网盘分享");
  }

  return { candidate, score, reasons: [...new Set(reasons)] };
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

function compactText(value: string): string {
  return normalize(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

function seasonNumbersIn(value: string): Set<number> {
  const numbers = new Set<number>();
  for (const match of value.matchAll(/\bS(?:eason)?\s*0?(\d{1,2})\b/gi)) {
    numbers.add(Number(match[1]));
  }
  for (const match of value.matchAll(/第\s*(\d{1,2})\s*季/g)) {
    numbers.add(Number(match[1]));
  }
  for (const match of value.matchAll(/\bSeason\s*0?(\d{1,2})\b/gi)) {
    numbers.add(Number(match[1]));
  }
  return numbers;
}
