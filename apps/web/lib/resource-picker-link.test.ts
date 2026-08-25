import { describe, expect, it } from "vitest";
import { manualSelectionResourcePickerHref, resourcePickerHref } from "./resource-picker-link";

describe("resourcePickerHref", () => {
  it("保留季范围和当前网盘", () => {
    expect(resourcePickerHref({ kind: "season", tmdbId: 42, seasonNumber: 3, storageId: "cs_q" })).toBe(
      "/resources/select?kind=season&tmdbId=42&season=3&w=cs_q",
    );
  });

  it("覆盖模式会保留在资源选择地址中", () => {
    expect(
      resourcePickerHref({ kind: "season", tmdbId: 42, seasonNumber: 1, replaceExisting: true }),
    ).toBe("/resources/select?kind=season&tmdbId=42&season=1&replace=1");
  });

  it("从手选快照恢复失败后的重新选择地址", () => {
    expect(
      manualSelectionResourcePickerHref(
        [
          {
            provider: "manual_selection",
            candidates: [
              {
                providerPayload: {
                  __manualSelectionTarget: { kind: "movie", tmdbId: 9 },
                },
              },
            ],
          },
        ],
        "cs_115",
      ),
    ).toBe("/resources/select?kind=movie&tmdbId=9&w=cs_115");
  });
});
