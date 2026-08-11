import type { ResourceCandidate } from "@media-track/workflow";

const LINGJI_API_BASE = "https://web5.mukaku.com/prod/api/v1/";
const LINGJI_APP_ID = "83768d9ad4";
const LINGJI_IDENTITY = "23734adac0301bccdcb107c4aa21f96c";
const CACHE_TTL_MS = 30 * 60 * 1000;

interface LingjiResourceMetadata {
  title: string;
  sizeText: string;
  sizeBytes: number | null;
  quality: string;
  datetime: string;
}

interface CacheEntry {
  expiresAt: number;
  byUrl: Map<string, LingjiResourceMetadata>;
}

export type LingjiFetchJson = (url: string) => Promise<unknown>;

const detailCache = new Map<number, Promise<CacheEntry>>();

export async function enrichLingjiResourceCandidates(
  candidates: ResourceCandidate[],
  options: { fetchJson?: LingjiFetchJson; now?: () => number } = {},
): Promise<ResourceCandidate[]> {
  const fetchJson = options.fetchJson ?? defaultFetchJson;
  const now = options.now ?? Date.now;
  const ids = new Set<number>();

  for (const candidate of candidates) {
    const id = lingjiDetailId(candidate);
    if (id !== null) ids.add(id);
  }
  if (ids.size === 0) return candidates;

  const metadataById = new Map<number, Map<string, LingjiResourceMetadata>>();
  await Promise.all(
    [...ids].map(async (id) => {
      try {
        metadataById.set(id, (await getLingjiDetail(id, fetchJson, now)).byUrl);
      } catch {
        metadataById.set(id, new Map());
      }
    }),
  );

  return candidates.map((candidate) => {
    const id = lingjiDetailId(candidate);
    const url = stringValue(candidate.providerPayload["url"]);
    const metadata = id === null ? undefined : metadataById.get(id)?.get(url);
    if (!metadata) return candidate;

    return {
      ...candidate,
      title: metadata.title || candidate.title,
      providerPayload: {
        ...candidate.providerPayload,
        ...(metadata.title ? { originalTitle: metadata.title } : {}),
        ...(metadata.sizeText ? { sizeText: metadata.sizeText } : {}),
        ...(metadata.sizeBytes !== null ? { sizeBytes: metadata.sizeBytes } : {}),
        ...(metadata.quality ? { quality: metadata.quality } : {}),
        ...(metadata.datetime ? { datetime: metadata.datetime } : {}),
      },
    };
  });
}

function lingjiDetailId(candidate: ResourceCandidate): number | null {
  if (candidate.source !== "plugin:lingjisp") return null;
  const sourceId = stringValue(candidate.providerPayload["sourceId"]);
  const match = /^lingjisp-(\d+)$/.exec(sourceId);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function getLingjiDetail(
  id: number,
  fetchJson: LingjiFetchJson,
  now: () => number,
): Promise<CacheEntry> {
  const cached = detailCache.get(id);
  if (cached) {
    const entry = await cached;
    if (entry.expiresAt > now()) return entry;
    detailCache.delete(id);
  }

  const pending = fetchLingjiDetail(id, fetchJson, now);
  detailCache.set(id, pending);
  try {
    return await pending;
  } catch (error) {
    detailCache.delete(id);
    throw error;
  }
}

async function fetchLingjiDetail(
  id: number,
  fetchJson: LingjiFetchJson,
  now: () => number,
): Promise<CacheEntry> {
  const url = new URL("getVideoDetail", LINGJI_API_BASE);
  url.searchParams.set("app_id", LINGJI_APP_ID);
  url.searchParams.set("identity", LINGJI_IDENTITY);
  url.searchParams.set("id", String(id));
  const response = await fetchJson(url.toString());
  const root = recordValue(response);
  const data = recordValue(root["data"]);
  const byUrl = new Map<string, LingjiResourceMetadata>();

  collectSeedGroups(data["ecca"], byUrl);
  collectSeeds(data["all_seeds"], byUrl);
  collectSeedGroups(data["movies_online_seed"], byUrl);

  return { expiresAt: now() + CACHE_TTL_MS, byUrl };
}

function collectSeedGroups(
  value: unknown,
  target: Map<string, LingjiResourceMetadata>,
): void {
  for (const group of Object.values(recordValue(value))) {
    collectSeeds(group, target);
  }
}

function collectSeeds(
  value: unknown,
  target: Map<string, LingjiResourceMetadata>,
): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    const seed = recordValue(item);
    const url = firstString(seed["zlink"], seed["link"]);
    if (!url || target.has(url)) continue;
    const title = firstString(seed["zname"], seed["seed_name"]);
    const sizeText = firstString(seed["zsize"], sizeFromTitle(title));
    target.set(url, {
      title,
      sizeText,
      sizeBytes: sizeTextToBytes(sizeText),
      quality: firstString(seed["definition_group"], seed["zqxd"]),
      datetime: firstString(seed["ezt"], seed["updated_at"], seed["created_at"]),
    });
  }
}

function sizeFromTitle(title: string): string {
  return /(?:^|[\s\[(])([\d.]+\s*(?:TB|GB|MB))(?:[\s\])]|$)/i.exec(title)?.[1]?.trim() ?? "";
}

function sizeTextToBytes(value: string): number | null {
  const match = /([\d.]+)\s*(TB|GB|MB)/i.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = match[2]?.toUpperCase();
  const multiplier = unit === "TB" ? 1024 ** 4 : unit === "GB" ? 1024 ** 3 : 1024 ** 2;
  return Math.round(amount * multiplier);
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const text = stringValue(value).trim();
    if (text) return text;
  }
  return "";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      Referer: LINGJI_API_BASE,
      "User-Agent": "Mozilla/5.0",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Lingji detail failed with HTTP ${response.status}`);
  return response.json();
}
