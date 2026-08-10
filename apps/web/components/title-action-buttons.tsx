"use client";

import { Check, DownloadCloud, Layers } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
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
}) {
  const router = useRouter();
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
      <button
        className="season-request-button"
        type="button"
        title={titleAcquiring ? "该剧正在获取中，请稍候" : `检索第 ${seasonNumber} 季资源`}
        disabled={titleAcquiring}
        onClick={() => {
          if (demo) {
            setDemoPlaying(true);
            return;
          }
          router.push(
            resourcePickerHref({
              kind: "season",
              tmdbId,
              seasonNumber,
              ...(storageId ? { storageId } : {}),
            }),
          );
        }}
      >
        <DownloadCloud size={13} aria-hidden />
        获取本季
      </button>
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
          router.push(
            resourcePickerHref({ kind: "remaining", tmdbId, ...(storageId ? { storageId } : {}) }),
          );
        }}
      >
        <Layers size={14} aria-hidden />
        {label}
      </button>
  );
}
