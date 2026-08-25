"use client";

import { Check, Layers, ListChecks, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { isDemoModeClient } from "../lib/demo-mode";
import { DemoAcquirePlayback } from "./demo-acquire-playback";
import type { DemoAcquisitionEntry } from "../lib/demo-session";
import { useDemoAcquiredTmdbIds } from "../lib/use-demo-session";
import { useRouter } from "next/navigation";
import { resourcePickerHref } from "../lib/resource-picker-link";
import { requestSeriesAction } from "../app/actions";
import { runAction } from "../lib/run-action";

export function RequestSeriesButton({
  candidateId,
  storageId,
  demoEntry,
}: {
  candidateId: string;
  /** Tree model: the active workspace drive — acquisition lands HERE. REQUIRED
   *  (value may be undefined = primary) so the workspace is always threaded. */
  storageId: string | undefined;
  /** Demo only: recorded to the session library when the scripted playback ends. */
  demoEntry?: DemoAcquisitionEntry | undefined;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  // Read-only demo: clicking plays the scripted playback (the server action is gated).
  const demo = isDemoModeClient();
  const [demoPlaying, setDemoPlaying] = useState(false);
  const acquiredIds = useDemoAcquiredTmdbIds();

  if (demo && demoPlaying) {
    return <DemoAcquirePlayback entry={demoEntry} />;
  }

  if (demo && demoEntry && acquiredIds.has(demoEntry.tmdbId)) {
    return (
      <span className="hub-badge tone-green">
        <Check size={14} aria-hidden />
        已获取
      </span>
    );
  }

  const tmdbId = Number(/^tmdb_tv_(\d+)/.exec(candidateId)?.[1]);
  return (
    <div className="season-action-group">
      <button
        className="primary-button"
        type="button"
        title="检索全剧资源"
        disabled={isPending}
        onClick={() => {
          if (demo) {
            setDemoPlaying(true);
            return;
          }
          if (Number.isInteger(tmdbId) && tmdbId > 0) {
            startTransition(async () => {
              const result = await runAction(
                () => requestSeriesAction({ candidateId, storageId }),
                (message) => setResultMessage(message),
              );
              if (result.ok) {
                setResultMessage(result.value.message);
                router.refresh();
              }
            });
          }
        }}
      >
        {isPending ? <LoaderCircle size={15} className="spin" aria-hidden /> : <Layers size={14} aria-hidden />}
        {isPending ? "请求中" : "获取全剧"}
      </button>
      <button
        className="primary-button manual-acquire-button"
        type="button"
        disabled={isPending}
        onClick={() => {
          if (Number.isInteger(tmdbId) && tmdbId > 0) {
            router.push(resourcePickerHref({ kind: "series", tmdbId, ...(storageId ? { storageId } : {}) }));
          }
        }}
      >
        <ListChecks size={15} aria-hidden />
        手动获取
      </button>
      {resultMessage ? <p className="request-result">{resultMessage}</p> : null}
    </div>
  );
}
