import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./workflow-runtime", () => ({
  acquireLlmPreflightError: vi.fn(),
  getCurrentAccountId: vi.fn(),
  queueCandidateSeries: vi.fn(),
  queueCandidateTracking: vi.fn(),
}));

vi.mock("./manual-resource-selection-server", () => ({
  verifyManualResourceSelectionToken: vi.fn(),
}));

import { verifyManualResourceSelectionToken } from "./manual-resource-selection-server";
import {
  acquireLlmPreflightError,
  getCurrentAccountId,
  queueCandidateTracking,
} from "./workflow-runtime";
import { saveSelectedResource } from "./save-selected-resource";

const selection = {
  target: { kind: "movie" as const, tmdbId: 157336 },
  candidate: {
    id: "lingjisp-1889243",
    snapshotId: "lingji-search",
    index: 0,
    title: "星际穿越[国英多音轨+特效中文字幕] 2160P",
    type: "magnet" as const,
    source: "lingjisp",
    providerPayload: {
      url: "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567",
      sourceId: "lingjisp-1889243",
      originalTitle: "星际穿越[国英多音轨+特效中文字幕] 2160P",
      sizeText: "35.66 GB",
      sizeBytes: 38_289_600_000,
      quality: "4K蓝光",
      datetime: "2026-06-26",
    },
  },
};

describe("保存手选资源", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentAccountId).mockResolvedValue("acct_1");
    vi.mocked(acquireLlmPreflightError).mockResolvedValue(null);
    vi.mocked(verifyManualResourceSelectionToken).mockResolvedValue({
      selection,
      connectedStorageId: "drive_1",
    });
    vi.mocked(queueCandidateTracking).mockResolvedValue({
      status: "queued",
      workflowRunId: "run_1",
      trackedSeasonId: "tmdb_movie_157336_movie",
    });
  });

  it("保留候选原始名称和大小，并只把选中记录加入任务", async () => {
    const result = await saveSelectedResource("signed-token");

    expect(result.status).toBe("queued");
    expect(queueCandidateTracking).toHaveBeenCalledWith(
      "tmdb_movie_157336",
      "drive_1",
      selection,
    );
    expect(vi.mocked(queueCandidateTracking).mock.calls[0]?.[2]?.candidate.providerPayload).toMatchObject({
      originalTitle: selection.candidate.providerPayload.originalTitle,
      sizeText: "35.66 GB",
      sizeBytes: 38_289_600_000,
      quality: "4K蓝光",
    });
  });

  it("校验失败时返回可展示错误，不向外抛出整页异常", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(verifyManualResourceSelectionToken).mockRejectedValue(new Error("候选列表已过期，请重新检索。"));

    await expect(saveSelectedResource("expired-token")).resolves.toEqual({
      status: "error",
      message: "候选列表已过期，请重新检索。",
    });
    expect(queueCandidateTracking).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "[media-track] 保存手选资源失败（校验资源选择）",
      expect.any(Error),
    );
    log.mockRestore();
  });
});
