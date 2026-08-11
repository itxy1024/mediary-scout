import { ListFilter, LoaderCircle, Search } from "lucide-react";

export function ResourceSearchLoading() {
  return (
    <section className="resource-search-loading" role="status" aria-live="polite">
      <div className="resource-search-loading-head">
        <LoaderCircle className="spin" size={24} aria-hidden />
        <div>
          <h1>正在检索可用资源</h1>
          <p>正在汇总来源并读取原始资源信息...</p>
        </div>
      </div>
      <div className="resource-search-progress" aria-hidden>
        <span />
      </div>
      <div className="resource-search-stages" aria-hidden>
        <span><Search size={14} /> 检索来源</span>
        <span><ListFilter size={14} /> 整理候选</span>
      </div>
    </section>
  );
}
