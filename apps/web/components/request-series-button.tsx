"use client";

import { Check, Layers } from "lucide-react";
import { useState } from "react";
import { isDemoModeClient } from "../lib/demo-mode";
import { DemoAcquirePlayback } from "./demo-acquire-playback";
import type { DemoAcquisitionEntry } from "../lib/demo-session";
import { useDemoAcquiredTmdbIds } from "../lib/use-demo-session";
import { useRouter } from "next/navigation";
import { resourcePickerHref } from "../lib/resource-picker-link";

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

  return (
      <button
        className="primary-button series-button"
        type="button"
        title="检索全剧资源"
        onClick={() => {
          if (demo) {
            setDemoPlaying(true);
            return;
          }
          const tmdbId = Number(/^tmdb_tv_(\d+)/.exec(candidateId)?.[1]);
          if (Number.isInteger(tmdbId) && tmdbId > 0) {
            router.push(resourcePickerHref({ kind: "series", tmdbId, ...(storageId ? { storageId } : {}) }));
          }
        }}
      >
        <Layers size={14} aria-hidden />
        获取全剧
      </button>
  );
}
