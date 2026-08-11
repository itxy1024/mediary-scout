import { AppSidebar } from "../../../components/app-sidebar";
import { ResourceSearchLoading } from "../../../components/resource-search-loading";

export default function ResourceSelectLoading() {
  return (
    <div className="app-shell">
      <AppSidebar active="search" />
      <main className="main product-main resource-picker-main" aria-busy="true">
        <ResourceSearchLoading />
      </main>
    </div>
  );
}
