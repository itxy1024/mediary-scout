import { describe, expect, it } from "vitest";
import { candidateDateLabel, candidateSourceLabel } from "./resource-candidate-view";

describe("resource candidate view", () => {
  it("shows the PanSou plugin name and uses a truthful fallback source", () => {
    expect(candidateSourceLabel("plugin:thepiratebay", "magnet")).toBe("插件 · thepiratebay");
    expect(candidateSourceLabel("", "magnet")).toBe("PanSou 磁力检索");
    expect(candidateSourceLabel("", "115")).toBe("PanSou");
  });

  it("hides Go zero dates", () => {
    expect(candidateDateLabel("0001-01-01T00:00:00Z")).toBeNull();
    expect(candidateDateLabel("")).toBeNull();
  });
});
