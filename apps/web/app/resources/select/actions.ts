"use server";

import { revalidatePath } from "next/cache";
import { acquireLlmPreflightError, getCurrentAccountId } from "../../../lib/workflow-runtime";
import { verifyManualResourceSelectionToken } from "../../../lib/manual-resource-selection-server";

export interface SaveSelectedResourceState {
  status: "idle" | "queued" | "error";
  message: string;
  workflowRunId?: string;
}

export const initialSaveSelectedResourceState: SaveSelectedResourceState = {
  status: "idle",
  message: "",
};

export async function saveSelectedResourceAction(
  _previous: SaveSelectedResourceState,
  formData: FormData,
): Promise<SaveSelectedResourceState> {
  const token = String(formData.get("token") ?? "");
  try {
    const preflight = await acquireLlmPreflightError(await getCurrentAccountId());
    if (preflight) return { status: "error", message: preflight };

    const { selection, connectedStorageId } = await verifyManualResourceSelectionToken(token);
    let result:
      | Awaited<ReturnType<typeof import("../../../lib/workflow-runtime").queueCandidateTracking>>
      | Awaited<ReturnType<typeof import("../../../lib/workflow-runtime").queueCandidateSeries>>;

    if (selection.target.kind === "movie") {
      const { queueCandidateTracking } = await import("../../../lib/workflow-runtime");
      result = await queueCandidateTracking(
        `tmdb_movie_${selection.target.tmdbId}`,
        connectedStorageId,
        selection,
      );
    } else if (selection.target.kind === "season") {
      const { queueCandidateTracking } = await import("../../../lib/workflow-runtime");
      result = await queueCandidateTracking(
        `tmdb_tv_${selection.target.tmdbId}_s${selection.target.seasonNumber}`,
        connectedStorageId,
        selection,
      );
    } else if (selection.target.kind === "series") {
      const { queueCandidateSeries } = await import("../../../lib/workflow-runtime");
      result = await queueCandidateSeries(
        `tmdb_tv_${selection.target.tmdbId}_s1`,
        connectedStorageId,
        selection,
      );
    } else {
      const { queueRemainingSeasons } = await import("../../../lib/title-hub");
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

    revalidatePath("/");
    revalidatePath(`/show/${selection.target.tmdbId}`);
    revalidatePath("/activity");
    return {
      status: "queued",
      message: "已锁定这条资源并加入后台队列。若保存失败，系统不会自动改选其他资源。",
      ...(result.workflowRunId ? { workflowRunId: result.workflowRunId } : {}),
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "资源选择已失效，请重新检索。",
    };
  }
}
