"use client";

import { Check, ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { isDemoModeClient } from "../lib/demo-mode";
import { DemoAcquirePlayback } from "./demo-acquire-playback";
import type { DemoAcquisitionEntry } from "../lib/demo-session";
import { useDemoAcquiredTmdbIds } from "../lib/use-demo-session";
import { resourcePickerHref } from "../lib/resource-picker-link";

/**
 * Two-step acquisition entry for a tv title: the dropdown only SELECTS a
 * scope (all remaining seasons, or one specific season) and rewrites the
 * pill label; nothing is queued until the pill itself is pressed. Seasons
 * that are already tracked are not offered — `seasonNumbers` must be the
 * untracked ones.
 */
export function SeasonRequestMenu({
  tmdbId,
  seasonNumbers,
  totalSeasonCount,
  allLabel = "获取所有季",
  storageId,
  demoEntry,
}: {
  tmdbId: number;
  /** Seasons still available to request (untracked only). */
  seasonNumbers: number[];
  /** Total seasons the show has — distinguishes a fresh single-season show
   *  (just "获取") from the last remaining season of a multi-season show
   *  ("获取第 N 季"). */
  totalSeasonCount: number;
  /** Pill label for the all-remaining scope. */
  allLabel?: string;
  /** Tree model: the active workspace drive — acquisition lands HERE. REQUIRED
   *  (value may be undefined = primary) so the workspace is always threaded. */
  storageId: string | undefined;
  /** Demo only: recorded to the session library when the scripted playback ends. */
  demoEntry?: DemoAcquisitionEntry | undefined;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | "all">("all");
  // Read-only demo: any acquire trigger plays the scripted, client-only playback
  // (the server actions below are gated server-side anyway).
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

  const submit = () => {
    if (demo) {
      setDemoPlaying(true);
      return;
    }
    setOpen(false);
    router.push(
      resourcePickerHref({
        kind: selected === "all" ? "remaining" : "season",
        tmdbId,
        ...(selected === "all" ? {} : { seasonNumber: selected }),
        ...(storageId ? { storageId } : {}),
      }),
    );
  };

  if (seasonNumbers.length <= 1) {
    const onlySeason = seasonNumbers[0] ?? 1;
    // A show with only one season → plain "获取". One season left over from a
    // multi-season show (the others already tracked) → name it, so it's not an
    // ambiguous bare "获取" sitting next to "第 1 季已获取".
    const isRemainingOfMany = totalSeasonCount > 1;
    return (
      <>
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            if (demo) {
              setDemoPlaying(true);
              return;
            }
            router.push(
              resourcePickerHref({
                kind: "season",
                tmdbId,
                seasonNumber: onlySeason,
                ...(storageId ? { storageId } : {}),
              }),
            );
          }}
        >
          <Plus size={14} aria-hidden />
          {isRemainingOfMany ? `获取第 ${onlySeason} 季` : "获取"}
        </button>
      </>
    );
  }

  return (
    <div className="season-menu">
      <button className="primary-button" type="button" onClick={submit}>
        <Plus size={14} aria-hidden />
        {selected === "all" ? allLabel : `获取第 ${selected} 季`}
      </button>
      <button
        className="season-menu-toggle"
        type="button"
        aria-label="选择获取范围"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown size={14} aria-hidden />
      </button>
      {open ? (
        <ul className="season-menu-list" role="menu">
          <li role="none">
            <button
              role="menuitemradio"
              aria-checked={selected === "all"}
              type="button"
              onClick={() => {
                setSelected("all");
                setOpen(false);
              }}
            >
              {selected === "all" ? <Check size={13} aria-hidden /> : <span className="menu-spacer" />}
              {allLabel}
            </button>
          </li>
          {seasonNumbers.map((seasonNumber) => (
            <li key={seasonNumber} role="none">
              <button
                role="menuitemradio"
                aria-checked={selected === seasonNumber}
                type="button"
                onClick={() => {
                  setSelected(seasonNumber);
                  setOpen(false);
                }}
              >
                {selected === seasonNumber ? (
                  <Check size={13} aria-hidden />
                ) : (
                  <span className="menu-spacer" />
                )}
                第 {seasonNumber} 季
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
