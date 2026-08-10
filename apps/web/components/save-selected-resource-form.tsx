"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  initialSaveSelectedResourceState,
  saveSelectedResourceAction,
} from "../app/resources/select/actions";

export function SaveSelectedResourceForm({ token, storageId }: { token: string; storageId?: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    saveSelectedResourceAction,
    initialSaveSelectedResourceState,
  );

  useEffect(() => {
    if (state.status !== "queued") return;
    const query = storageId ? `?w=${encodeURIComponent(storageId)}` : "";
    router.push(`/activity${query}`);
  }, [router, state.status, storageId]);

  return (
    <form action={action} className="resource-save-form">
      <input type="hidden" name="token" value={token} />
      <button className="primary-button" type="submit" disabled={pending || state.status === "queued"}>
        {pending ? (
          <LoaderCircle size={15} className="spin" aria-hidden />
        ) : (
          <Check size={15} aria-hidden />
        )}
        {pending ? "正在提交" : state.status === "queued" ? "已加入队列" : "保存此资源"}
      </button>
      {state.status === "error" ? <p className="request-result">{state.message}</p> : null}
    </form>
  );
}
