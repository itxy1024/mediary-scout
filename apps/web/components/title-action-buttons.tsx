"use client";

import { Check, DownloadCloud, Layers, ListChecks, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestRemainingAction, requestSeasonAction } from "../app/actions";
import { runAction } from "../lib/run-action";
import { isDemoModeClient } from "../lib/demo-mode";
import { DemoAcquirePlayback } from "./demo-acquire-playback";
import type { DemoAcquisitionEntry } from "../lib/demo-session";
import { useDemoAcquiredTmdbIds } from "../lib/use-demo-session";
import { resourcePickerHref } from "../lib/resource-picker-link";

export function RequestSeasonButton({
  tmdbId,
  seasonNumber,
  storageId,
  titleAcquiring = false,
  demoEntry,
  replaceExisting = false,
}: {
  tmdbId: number;
  seasonNumber: number;
  /** Tree model: the active workspace drive — acquisition lands HERE. REQUIRED
   *  (value may be undefined = primary) so the workspace is always threaded. */
  storageId: string | undefined;
  /** Server truth: this title already has an acquisition run in flight. */
  titleAcquiring?: boolean;
  /** Demo only: recorded to the session library when the scripted playback ends. */
  demoEntry?: DemoAcquisitionEntry | undefined;
  /** 手动选择整季新包时，覆盖当前季已有视频/字幕。 */
  replaceExisting?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const demo = isDemoModeClient();
  const [demoPlaying, setDemoPlaying] = useState(false);
  const acquiredIds = useDemoAcquiredTmdbIds();

  if (demo && demoPlaying) {
    return <DemoAcquirePlayback entry={demoEntry} />;
  }

  if (demo && acquiredIds.has(tmdbId)) {
    return (
      <span className="hub-badge tone-green">
        <Check size={13} aria-hidden />
        已获取
      </span>
    );
  }

  return (
    <div className="season-action-group">
      <button
        className="primary-button"
        type="button"
        title={titleAcquiring ? "该剧正在获取中，请稍候" : `检索第 ${seasonNumber} 季资源`}
        disabled={titleAcquiring}
        onClick={() => {
          if (demo) {
            setDemoPlaying(true);
            return;
          }
          startTransition(async () => {
            const result = await runAction(
              () => requestSeasonAction({ tmdbId, seasonNumber, storageId }),
              (message) => setResultMessage(message),
            );
            if (result.ok) {
              setResultMessage(result.value.message);
              router.refresh();
            }
          });
        }}
      >
        {isPending ? <LoaderCircle size={15} className="spin" aria-hidden /> : <DownloadCloud size={13} aria-hidden />}
        {isPending ? "请求中" : "获取本季"}
      </button>
      <button
        className="primary-button manual-acquire-button"
        type="button"
        disabled={isPending}
        onClick={() =>
          router.push(
            resourcePickerHref({
              kind: "season",
              tmdbId,
              seasonNumber,
              ...(replaceExisting ? { replaceExisting: true } : {}),
              ...(storageId ? { storageId } : {}),
            }),
          )
        }
      >
        <ListChecks size={15} aria-hidden />
        {replaceExisting ? "重新检索本季" : "手动获取"}
      </button>
      {resultMessage ? <p className="request-result">{resultMessage}</p> : null}
    </div>
  );
}

export function RequestRemainingButton({
  tmdbId,
  label,
  storageId,
  titleAcquiring = false,
  demoEntry,
}: {
  tmdbId: number;
  label: string;
  /** Tree model: the active workspace drive — acquisition lands HERE. REQUIRED
   *  (value may be undefined = primary) so the workspace is always threaded. */
  storageId: string | undefined;
  /** Server truth: this title already has an acquisition run in flight. */
  titleAcquiring?: boolean;
  /** Demo only: recorded to the session library when the scripted playback ends. */
  demoEntry?: DemoAcquisitionEntry | undefined;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const demo = isDemoModeClient();
  const [demoPlaying, setDemoPlaying] = useState(false);
  const acquiredIds = useDemoAcquiredTmdbIds();

  if (demo && demoPlaying) {
    return <DemoAcquirePlayback entry={demoEntry} />;
  }

  if (demo && acquiredIds.has(tmdbId)) {
    return (
      <span className="hub-badge tone-green">
        <Check size={13} aria-hidden />
        已获取
      </span>
    );
  }

  return (
    <div className="season-action-group">
      <button
        className="primary-button"
        type="button"
        title={titleAcquiring ? "该剧正在获取中，请稍候" : "检索剩余季资源"}
        disabled={titleAcquiring}
        onClick={() => {
          if (demo) {
            setDemoPlaying(true);
            return;
          }
          startTransition(async () => {
            const result = await runAction(
              () => requestRemainingAction({ tmdbId, storageId }),
              (message) => setResultMessage(message),
            );
            if (result.ok) {
              setResultMessage(result.value.message);
              router.refresh();
            }
          });
        }}
      >
        {isPending ? <LoaderCircle size={15} className="spin" aria-hidden /> : <Layers size={14} aria-hidden />}
        {isPending ? "请求中" : label}
      </button>
      <button
        className="primary-button manual-acquire-button"
        type="button"
        disabled={isPending}
        onClick={() =>
          router.push(resourcePickerHref({ kind: "remaining", tmdbId, ...(storageId ? { storageId } : {}) }))
        }
      >
        <ListChecks size={15} aria-hidden />
        手动获取
      </button>
      {resultMessage ? <p className="request-result">{resultMessage}</p> : null}
    </div>
  );
}
