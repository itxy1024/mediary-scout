"use client";

import { ArrowDownWideNarrow, Database, Funnel, Languages, LoaderCircle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { candidateSourceLabel } from "../lib/resource-candidate-view";

type LanguageFilter = "all" | "zh";
type QualityFilter = "all" | "high" | "medium";
type ResourceSort = "match" | "newest" | "size_desc" | "size_asc";

export function ResourceCandidateFilters({
  sourceFilter,
  languageFilter,
  qualityFilter,
  sort,
  sources,
}: {
  sourceFilter?: string;
  languageFilter: LanguageFilter;
  qualityFilter: QualityFilter;
  sort: ResourceSort;
  sources: Array<{ value: string; count: number }>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function update(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set(key, value);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  return (
    <div className="resource-filter-bar" aria-label="资源筛选">
      <label className="resource-filter-control">
        <ArrowDownWideNarrow size={14} aria-hidden />
        <span>排序</span>
        <select value={sort} onChange={(event) => update("sort", event.target.value)}>
          <option value="match">匹配度</option>
          <option value="newest">最新发布</option>
          <option value="size_desc">体积从大到小</option>
          <option value="size_asc">体积从小到大</option>
        </select>
      </label>
      <label className="resource-filter-control">
        <Funnel size={14} aria-hidden />
        <span>来源</span>
        <select value={sourceFilter ?? "all"} onChange={(event) => update("source", event.target.value)}>
          <option value="all">全部</option>
          {sources.map((source) => (
            <option value={source.value} key={source.value}>
              {candidateSourceLabel(source.value, "")}（{source.count}）
            </option>
          ))}
        </select>
      </label>
      <label className="resource-filter-control">
        <Languages size={14} aria-hidden />
        <span>语言</span>
        <select value={languageFilter} onChange={(event) => update("language", event.target.value)}>
          <option value="all">不限</option>
          <option value="zh">中文音轨/字幕</option>
        </select>
      </label>
      <label className="resource-filter-control">
        <Database size={14} aria-hidden />
        <span>画质</span>
        <select value={qualityFilter} onChange={(event) => update("quality", event.target.value)}>
          <option value="all">不限</option>
          <option value="high">4K / 2160P</option>
          <option value="medium">1080P</option>
        </select>
      </label>
      {isPending ? <LoaderCircle className="spin resource-filter-pending" size={16} aria-label="正在筛选" /> : null}
    </div>
  );
}
