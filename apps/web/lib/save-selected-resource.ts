import { acquireLlmPreflightError, getCurrentAccountId } from "./workflow-runtime";
import { verifyManualResourceSelectionToken } from "./manual-resource-selection-server";

export interface SaveSelectedResourceResult {
  status: "queued" | "error";
  message: string;
  workflowRunId?: string;
}

/** 校验用户选中的候选，并把这一条候选作为唯一资源加入后台队列。 */
export async function saveSelectedResource(token: string): Promise<SaveSelectedResourceResult> {
  let stage = "检查模型配置";
  try {
    const preflight = await acquireLlmPreflightError(await getCurrentAccountId());
    if (preflight) return { status: "error", message: preflight };

    stage = "校验资源选择";
    const { selection, connectedStorageId } = await verifyManualResourceSelectionToken(token);
    let result:
      | Awaited<ReturnType<typeof import("./workflow-runtime").queueCandidateTracking>>
      | Awaited<ReturnType<typeof import("./workflow-runtime").queueCandidateSeries>>;

    stage = "创建后台任务";
    if (selection.target.kind === "movie") {
      const { queueCandidateTracking } = await import("./workflow-runtime");
      result = await queueCandidateTracking(
        `tmdb_movie_${selection.target.tmdbId}`,
        connectedStorageId,
        selection,
      );
    } else if (selection.target.kind === "season") {
      const { queueCandidateTracking } = await import("./workflow-runtime");
      result = await queueCandidateTracking(
        `tmdb_tv_${selection.target.tmdbId}_s${selection.target.seasonNumber}`,
        connectedStorageId,
        selection,
      );
    } else if (selection.target.kind === "series") {
      const { queueCandidateSeries } = await import("./workflow-runtime");
      result = await queueCandidateSeries(
        `tmdb_tv_${selection.target.tmdbId}_s1`,
        connectedStorageId,
        selection,
      );
    } else {
      const { queueRemainingSeasons } = await import("./title-hub");
      result = await queueRemainingSeasons(
        selection.target.tmdbId,
        connectedStorageId ?? undefined,
        selection,
      );
    }

    if (result.status === "unsupported") {
      return { status: "error", message: result.message };
    }
    if (result.status === "already_running") {
      return { status: "error", message: "该作品已有任务正在处理，请完成或取消后再选择。" };
    }
    if (result.status === "already_tracked") {
      return { status: "error", message: "该范围已经完整获取，无需重复保存。" };
    }

    return {
      status: "queued",
      message: "已锁定这条资源并加入后台队列。若保存失败，系统不会自动改选其他资源。",
      ...(result.workflowRunId ? { workflowRunId: result.workflowRunId } : {}),
    };
  } catch (error) {
    console.error(`[media-track] 保存手选资源失败（${stage}）`, error);
    return {
      status: "error",
      message: error instanceof Error ? error.message : "资源选择已失效，请重新检索。",
    };
  }
}
