export function candidateSourceLabel(source: string, type: string): string {
  const value = source.trim();
  if (value.startsWith("plugin:")) {
    return `插件 · ${value.slice("plugin:".length)}`;
  }
  if (value) return value;
  return type === "magnet" ? "PanSou 磁力检索" : "PanSou";
}

export function candidateDateLabel(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  const raw = value.trim();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 10);
  if (date.getUTCFullYear() <= 1) return null;
  return date.toLocaleDateString("zh-CN");
}

export function candidateTextLabel(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
