"use client";

import { Check, LoaderCircle } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { SaveSelectedResourceResult } from "../lib/save-selected-resource";

export function SaveSelectedResourceForm({
  token,
  storageId,
  replaceExisting = false,
}: {
  token: string;
  storageId?: string;
  replaceExisting?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<SaveSelectedResourceResult | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (replaceExisting && !window.confirm("确认用这条整季资源覆盖当前季已有的视频和字幕吗？旧文件将被删除。")) {
      return;
    }
    setPending(true);
    setState(null);
    try {
      const response = await fetch("/api/resources/select", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = (await response.json().catch(() => null)) as SaveSelectedResourceResult | null;
      if (!result || (result.status !== "queued" && result.status !== "error")) {
        throw new Error("服务器返回了无法识别的结果，请稍后重试。");
      }
      setState(result);
      if (result.status === "queued") {
        const query = storageId ? `?w=${encodeURIComponent(storageId)}` : "";
        router.push(`/activity${query}`);
      }
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "保存失败，请稍后重试。",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="resource-save-form">
      <button className="primary-button" type="submit" disabled={pending || state?.status === "queued"}>
        {pending ? (
          <LoaderCircle size={15} className="spin" aria-hidden />
        ) : (
          <Check size={15} aria-hidden />
        )}
        {pending
          ? "正在提交"
          : state?.status === "queued"
            ? "已加入队列"
            : replaceExisting
              ? "覆盖并保存"
              : "保存此资源"}
      </button>
      {state?.status === "error" ? <p className="request-result">{state.message}</p> : null}
    </form>
  );
}
