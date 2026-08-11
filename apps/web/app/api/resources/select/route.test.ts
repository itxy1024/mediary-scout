import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, connection: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("../../../../lib/save-selected-resource", () => ({
  saveSelectedResource: vi.fn(),
}));

import { saveSelectedResource } from "../../../../lib/save-selected-resource";
import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/resources/select", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/resources/select", () => {
  beforeEach(() => vi.clearAllMocks());

  it("拒绝缺少令牌的请求，不进入保存流程", async () => {
    const response = await POST(request({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      message: "资源选择已失效，请重新检索。",
    });
    expect(saveSelectedResource).not.toHaveBeenCalled();
  });

  it("返回已加入队列的结果", async () => {
    vi.mocked(saveSelectedResource).mockResolvedValue({
      status: "queued",
      message: "已加入队列",
      workflowRunId: "run_1",
    });

    const response = await POST(request({ token: "signed-token" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "queued",
      message: "已加入队列",
      workflowRunId: "run_1",
    });
    expect(saveSelectedResource).toHaveBeenCalledWith("signed-token");
  });

  it("把可恢复的保存失败作为 JSON 返回", async () => {
    vi.mocked(saveSelectedResource).mockResolvedValue({
      status: "error",
      message: "目标网盘已不可用，请返回后重新选择。",
    });

    const response = await POST(request({ token: "signed-token" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      message: "目标网盘已不可用，请返回后重新选择。",
    });
  });
});
