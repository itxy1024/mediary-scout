import { describe, expect, it, vi } from "vitest";
import type { ResourceCandidate } from "@media-track/workflow";
import { enrichLingjiResourceCandidates } from "./lingji-resource-metadata";

function candidate(id: string, url: string): ResourceCandidate {
  return {
    id,
    snapshotId: "snapshot",
    index: 0,
    title: "星际穿越",
    type: "magnet",
    source: "plugin:lingjisp",
    providerPayload: { url, sourceId: "lingjisp-1889243" },
  };
}

describe("Lingji resource metadata", () => {
  it("restores each resource's original title, size, quality, and date with one detail request", async () => {
    const fetchJson = vi.fn(async () => ({
      data: {
        ecca: {
          "4K蓝光": [
            {
              zname: "星际穿越.Interstellar.2014.2160p.DreamHD",
              zsize: "35.66 GB",
              zqxd: "4K蓝光",
              ezt: "2026-06-26",
              zlink: "magnet:?xt=urn:btih:first",
            },
          ],
          "1080P蓝光": [
            {
              zname: "星际穿越.Interstellar.2014.1080p.DreamHD",
              zsize: "17.24 GB",
              definition_group: "1080P蓝光",
              ezt: "2026-05-29",
              zlink: "magnet:?xt=urn:btih:second",
            },
          ],
        },
      },
    }));

    const result = await enrichLingjiResourceCandidates(
      [
        candidate("first", "magnet:?xt=urn:btih:first"),
        candidate("second", "magnet:?xt=urn:btih:second"),
      ],
      { fetchJson, now: () => 1_000 },
    );

    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(result[0]).toMatchObject({
      title: "星际穿越.Interstellar.2014.2160p.DreamHD",
      providerPayload: {
        sizeText: "35.66 GB",
        quality: "4K蓝光",
        datetime: "2026-06-26",
      },
    });
    expect(result[0]?.providerPayload["sizeBytes"]).toBeGreaterThan(35 * 1024 ** 3);
    expect(result[1]).toMatchObject({
      title: "星际穿越.Interstellar.2014.1080p.DreamHD",
      providerPayload: { sizeText: "17.24 GB", quality: "1080P蓝光" },
    });
  });
});
