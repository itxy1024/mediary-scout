export type ResourcePickerKind = "movie" | "season" | "remaining" | "series";

export function resourcePickerHref(input: {
  kind: ResourcePickerKind;
  tmdbId: number;
  seasonNumber?: number;
  storageId?: string;
  replaceExisting?: boolean;
}): string {
  const params = new URLSearchParams({
    kind: input.kind,
    tmdbId: String(input.tmdbId),
  });
  if (input.seasonNumber !== undefined) params.set("season", String(input.seasonNumber));
  if (input.storageId) params.set("w", input.storageId);
  if (input.replaceExisting) params.set("replace", "1");
  return `/resources/select?${params.toString()}`;
}

export function manualSelectionResourcePickerHref(
  resourceSnapshots: Array<{
    provider: string;
    candidates: Array<{ providerPayload: Record<string, unknown> }>;
  }>,
  storageId?: string | null,
): string | null {
  const payload = resourceSnapshots
    .find((snapshot) => snapshot.provider === "manual_selection")
    ?.candidates[0]?.providerPayload["__manualSelectionTarget"];
  if (!payload || typeof payload !== "object") return null;
  const target = payload as Record<string, unknown>;
  const kind = target["kind"];
  const tmdbId = target["tmdbId"];
  const seasonNumber = target["seasonNumber"];
  if (
    (kind !== "movie" && kind !== "season" && kind !== "remaining" && kind !== "series") ||
    typeof tmdbId !== "number"
  ) {
    return null;
  }
  return resourcePickerHref({
    kind,
    tmdbId,
    ...(typeof seasonNumber === "number" ? { seasonNumber } : {}),
    ...(target["replaceExisting"] === true ? { replaceExisting: true } : {}),
    ...(storageId ? { storageId } : {}),
  });
}
