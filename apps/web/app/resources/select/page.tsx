import { AlertTriangle, Database, Filter, HardDriveDownload, Languages } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppSidebar } from "../../../components/app-sidebar";
import { BackLink } from "../../../components/back-link";
import { SaveSelectedResourceForm } from "../../../components/save-selected-resource-form";
import {
  getManualResourcePickerView,
  type ManualResourcePickerInput,
} from "../../../lib/manual-resource-selection-server";

export default function ResourceSelectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<ResourceSelectShell />}>
      <ResourceSelectSurface searchParams={searchParams} />
    </Suspense>
  );
}

function ResourceSelectShell() {
  return (
    <div className="app-shell">
      <AppSidebar active="search" />
      <main className="main product-main" aria-busy="true" />
    </div>
  );
}

async function ResourceSelectSurface({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  const storageId = stringParam(params.w) || undefined;
  const basePath = storageId ? `/w/${storageId}` : "/";

  let view: Awaited<ReturnType<typeof getManualResourcePickerView>> | null = null;
  let error = "";
  try {
    view = await getManualResourcePickerView(parsePickerInput(params, storageId));
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "无法检索资源，请稍后重试。";
  }

  return (
    <div className="app-shell">
      <AppSidebar active="search" basePath={basePath} activeStorageId={storageId} />
      <main className="main product-main resource-picker-main">
        <BackLink label="返回作品" fallbackHref={basePath} />
        {view ? (
          <section className="resource-picker-surface">
            <div className="section-heading library-heading">
              <div>
                <h1>选择要保存的资源</h1>
                <p>
                  {view.title.title} · {view.scopeLabel} · 共 {view.items.length} 条候选
                </p>
              </div>
            </div>

            <div className="resource-picker-summary" aria-label="排序依据">
              <span>
                <Filter size={14} aria-hidden /> 按匹配度排序
              </span>
              <span>
                <Languages size={14} aria-hidden /> 语言：{view.preferredLanguage ?? "不限"}
              </span>
              <span>
                <Database size={14} aria-hidden /> 画质：{qualityLabel(view.qualityPreference)}
              </span>
            </div>

            {view.sourceWarning ? (
              <p className="resource-picker-warning" role="alert">
                <AlertTriangle size={15} aria-hidden /> {view.sourceWarning}
              </p>
            ) : null}

            {view.items.length > 0 ? (
              <div className="resource-result-list">
                {view.items.map((item, index) => (
                  <article className="resource-result-row" key={item.candidate.id}>
                    <div className="resource-rank" aria-label={`排序第 ${index + 1}`}>
                      <strong>{index + 1}</strong>
                      <span>{item.score} 分</span>
                    </div>
                    <div className="resource-result-body">
                      <h2>{item.candidate.title}</h2>
                      <div className="resource-result-meta">
                        <span>{resourceTypeLabel(item.candidate.type)}</span>
                        <span>{item.candidate.source || "未知来源"}</span>
                        {candidateDate(item.candidate.providerPayload["datetime"]) ? (
                          <span>{candidateDate(item.candidate.providerPayload["datetime"])}</span>
                        ) : null}
                      </div>
                      <div className="resource-reasons">
                        {item.reasons.map((reason) => (
                          <span key={reason}>{reason}</span>
                        ))}
                      </div>
                    </div>
                    <SaveSelectedResourceForm
                      token={item.token}
                      {...(storageId ? { storageId } : {})}
                    />
                  </article>
                ))}
              </div>
            ) : (
              <div className="quiet-state compact">
                <HardDriveDownload size={22} aria-hidden />
                <strong>没有可选资源</strong>
                <span>没有检索到可用记录，或检索结果均为已知失效链接。</span>
              </div>
            )}
          </section>
        ) : (
          <div className="quiet-state" role="alert">
            <AlertTriangle size={24} aria-hidden />
            <strong>无法打开资源列表</strong>
            <span>{error}</span>
          </div>
        )}
      </main>
    </div>
  );
}

function parsePickerInput(
  params: Record<string, string | string[] | undefined>,
  storageId?: string,
): ManualResourcePickerInput {
  const kindValue = stringParam(params.kind);
  const kind =
    kindValue === "movie" ||
    kindValue === "season" ||
    kindValue === "remaining" ||
    kindValue === "series"
      ? kindValue
      : "movie";
  const tmdbId = Number(stringParam(params.tmdbId));
  const seasonNumber = Number(stringParam(params.season));
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    throw new Error("作品参数无效。");
  }
  if (kind === "season" && (!Number.isInteger(seasonNumber) || seasonNumber <= 0)) {
    throw new Error("季参数无效。");
  }
  return {
    kind,
    tmdbId,
    ...(kind === "season" ? { seasonNumber } : {}),
    ...(storageId ? { storageId } : {}),
  };
}

function stringParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function qualityLabel(value: "high" | "medium" | undefined): string {
  if (value === "high") return "高（优先 4K）";
  if (value === "medium") return "中（优先 1080P）";
  return "不限";
}

function resourceTypeLabel(type: string): string {
  if (type === "magnet") return "磁力";
  if (type === "115") return "115 分享";
  if (type === "quark") return "夸克分享";
  if (type === "tianyi") return "天翼分享";
  if (type === "123") return "123 分享";
  return type;
}

function candidateDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("zh-CN");
}
