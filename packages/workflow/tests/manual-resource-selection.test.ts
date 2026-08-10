import { describe, expect, it, vi } from "vitest";
import {
  createManualSelectionEvidence,
  rankManualResources,
  resourceProviderForManualSelection,
  type ResourceCandidate,
} from "../src/index.js";

function candidate(id: string, title: string, type: ResourceCandidate["type"] = "115"): ResourceCandidate {
  return {
    id,
    snapshotId: "source_snapshot",
    index: 0,
    title,
    type,
    source: "test",
    providerPayload: { url: `https://example.test/${id}` },
  };
}

describe("手动资源候选排序", () => {
  it("保留全部记录，并把片名、季数、画质和语言更符合偏好的资源排在前面", () => {
    const candidates = [
      candidate("low", "示例剧 S02 720P RAW"),
      candidate("best", "示例剧 S01 1080P WEB-DL 简繁中字"),
      candidate("wrong", "另一部剧 S01 1080P 中字"),
    ];
    const ranked = rankManualResources({
      candidates,
      target: { title: "示例剧", aliases: ["Example Show"], year: 2026, seasonNumbers: [1] },
      qualityPreference: "medium",
      preferredLanguage: "中文",
    });

    expect(ranked).toHaveLength(3);
    expect(ranked[0]?.candidate.id).toBe("best");
    expect(ranked[0]?.reasons).toEqual(
      expect.arrayContaining(["片名匹配", "第 1 季匹配", "符合 1080P 偏好", "符合中文偏好"]),
    );
    expect(ranked.at(-1)?.candidate.id).toBe("wrong");
  });
});

describe("手动资源工作流约束", () => {
  it("把选择复制为运行专属快照，并记录重新选择所需的目标范围", () => {
    const evidence = createManualSelectionEvidence({
      workflowRunId: "run_1",
      keyword: "示例剧",
      selection: {
        target: { kind: "season", tmdbId: 42, seasonNumber: 1 },
        candidate: candidate("source_1", "示例剧 S01 1080P"),
      },
      now: "2026-08-10T00:00:00.000Z",
    });

    expect(evidence.snapshot.id).toBe("manual_run_1");
    expect(evidence.snapshot.candidates[0]?.id).toBe("manual_run_1_candidate_1");
    expect(evidence.snapshot.candidates[0]?.providerPayload["__manualSelectionTarget"]).toEqual({
      kind: "season",
      tmdbId: 42,
      seasonNumber: 1,
    });
  });

  it("无论 Agent 使用什么关键词，都只返回用户选中的唯一资源", async () => {
    const evidence = createManualSelectionEvidence({
      workflowRunId: "run_2",
      keyword: "示例电影",
      selection: {
        target: { kind: "movie", tmdbId: 9 },
        candidate: candidate("chosen", "示例电影 2160P 中字"),
      },
      now: "2026-08-10T00:00:00.000Z",
    });
    const fallbackSearch = vi.fn();
    const provider = resourceProviderForManualSelection({
      snapshots: [evidence.snapshot],
      auditEvents: [evidence.auditEvent],
      fallback: { search: fallbackSearch },
    });

    const first = await provider.search({ keyword: "示例电影" });
    const second = await provider.search({ keyword: "Example Movie 4K" });

    expect(first.candidates.map((item) => item.id)).toEqual(["manual_run_2_candidate_1"]);
    expect(second.candidates.map((item) => item.id)).toEqual(["manual_run_2_candidate_1"]);
    expect(fallbackSearch).not.toHaveBeenCalled();
  });
});
