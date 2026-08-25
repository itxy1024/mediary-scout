import { AlertTriangle, HardDriveDownload } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppSidebar } from "../../../components/app-sidebar";
import { BackLink } from "../../../components/back-link";
import { SaveSelectedResourceForm } from "../../../components/save-selected-resource-form";
import { ResourceCandidateFilters } from "../../../components/resource-candidate-filters";
import { ResourceSearchLoading } from "../../../components/resource-search-loading";
import {
  getManualResourcePickerView,
  type ManualResourcePickerInput,
} from "../../../lib/manual-resource-selection-server";
import {
  candidateDateLabel,
  candidateSourceLabel,
  candidateTextLabel,
} from "../../../lib/resource-candidate-view";

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
      <main className="main product-main resource-picker-main" aria-busy="true">
        <ResourceSearchLoading />
      </main>
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
                  {view.title.title} · {view.scopeLabel} · 共 {view.items.length} / {view.totalCandidateCount} 条候选
                </p>
                {view.target.replaceExisting ? (
                  <p className="resource-picker-overwrite-note">覆盖模式：选择后将替换当前季已有的视频和字幕。</p>
                ) : null}
              </div>
            </div>

            <ResourceCandidateFilters
              {...(view.sourceFilter ? { sourceFilter: view.sourceFilter } : {})}
              languageFilter={view.languageFilter}
              qualityFilter={view.qualityFilter}
              sort={view.sort}
              sources={view.sources}
            />

            {view.duplicateCount > 0 ? (
              <p className="resource-dedupe-note">已合并 {view.duplicateCount} 条名称和大小完全相同的重复发布。</p>
            ) : null}

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
                        <span>{candidateSourceLabel(item.candidate.source, item.candidate.type)}</span>
                        {candidateTextLabel(item.candidate.providerPayload["quality"]) ? (
                          <span>{candidateTextLabel(item.candidate.providerPayload["quality"])}</span>
                        ) : null}
                        {candidateTextLabel(item.candidate.providerPayload["sizeText"]) ? (
                          <span className="resource-size">{candidateTextLabel(item.candidate.providerPayload["sizeText"])}</span>
                        ) : null}
                        {candidateDateLabel(item.candidate.providerPayload["datetime"]) ? (
                          <span>{candidateDateLabel(item.candidate.providerPayload["datetime"])}</span>
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
                      replaceExisting={view.target.replaceExisting === true}
                    />
                  </article>
                ))}
              </div>
            ) : (
              <div className="quiet-state compact">
                <HardDriveDownload size={22} aria-hidden />
                <strong>{view.totalCandidateCount > 0 ? "没有符合筛选的资源" : "没有可选资源"}</strong>
                <span>
                  {view.totalCandidateCount > 0
                    ? "请调整来源、语言或画质条件。"
                    : "没有检索到可用记录，或检索结果均为已知失效链接。"}
                </span>
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
  const parsedSourceFilter = sourceFilter(params.source);
  const parsedLanguageFilter = languageFilter(params.language);
  const parsedQualityFilter = qualityFilter(params.quality);
  const parsedSort = sortValue(params.sort);
  const replaceExisting = stringParam(params.replace) === "1";
  return {
    kind,
    tmdbId,
    ...(kind === "season" ? { seasonNumber } : {}),
    ...(storageId ? { storageId } : {}),
    ...(parsedSourceFilter ? { sourceFilter: parsedSourceFilter } : {}),
    ...(parsedLanguageFilter ? { languageFilter: parsedLanguageFilter } : {}),
    ...(parsedQualityFilter ? { qualityFilter: parsedQualityFilter } : {}),
    ...(parsedSort ? { sort: parsedSort } : {}),
    ...(replaceExisting ? { replaceExisting: true } : {}),
  };
}

function stringParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function sourceFilter(value: string | string[] | undefined): string | undefined {
  const source = stringParam(value).trim();
  return source && source !== "all" && source.length <= 512 ? source : undefined;
}

function languageFilter(value: string | string[] | undefined): "all" | "zh" | undefined {
  const language = stringParam(value);
  return language === "all" || language === "zh" ? language : undefined;
}

function qualityFilter(value: string | string[] | undefined): "all" | "high" | "medium" | undefined {
  const quality = stringParam(value);
  return quality === "all" || quality === "high" || quality === "medium" ? quality : undefined;
}

function sortValue(value: string | string[] | undefined): "match" | "newest" | "size_desc" | "size_asc" | undefined {
  const sort = stringParam(value);
  return sort === "match" || sort === "newest" || sort === "size_desc" || sort === "size_asc"
    ? sort
    : undefined;
}

function resourceTypeLabel(type: string): string {
  if (type === "magnet") return "磁力";
  if (type === "115") return "115 分享";
  if (type === "quark") return "夸克分享";
  if (type === "tianyi") return "天翼分享";
  if (type === "123") return "123 分享";
  return type;
}
