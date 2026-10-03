"use client";

import { useState } from "react";
import { CreateLoop } from "./loops/CreateLoop";
import { NowPlaying } from "./loops/NowPlaying";
import { Library } from "./loops/Library";

const TABS = [
  { id: "create", label: "Create" },
  { id: "library", label: "Library" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/**
 * Loops: music that breathes with you. Paste a Spotify playlist; StudyLoop rebuilds it as beats,
 * one per song, saved to the Library, that calm down when the band reads stress.
 */
export function MusicView() {
  const [view, setView] = useState<TabId>("create");
  const [savedVersion, setSavedVersion] = useState(0);

  return (
    <div className="music">
      <div className="music__lib">
        <h2 className="music__intro">
          <span className="eyebrow">
            <span className="eyebrow__rule" aria-hidden />
            Loops
          </span>
          <span className="music__headline">
            Music that <span className="serif">breathes with you.</span>
          </span>
        </h2>
        <div className="music__bar">
          <div className="seg music__tabs" role="tablist" aria-label="Loops">
            {TABS.map((t) => (
              <button key={t.id} id={`loops-tab-${t.id}`} type="button" role="tab" aria-selected={view === t.id} aria-controls="loops-panel" onClick={() => setView(t.id)}>
                {view === t.id && <span className="seg__thumb" aria-hidden />}
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div id="loops-panel" className="music__panel" role="tabpanel" aria-labelledby={`loops-tab-${view}`}>
          {view === "create" ? (
            <CreateLoop onSaved={() => setSavedVersion((v) => v + 1)} />
          ) : (
            <Library version={savedVersion} onCreate={() => setView("create")} />
          )}
        </div>
      </div>
      <NowPlaying />
    </div>
  );
}

export function MusicFoot() {
  return (
    <div className="foot foot--legend">
      <p>
        <span className="legend__swatch legend__swatch--measured" aria-hidden />
        <b>Made live</b> every Loop is original music, made just for you
      </p>
      <p>
        <span className="legend__swatch legend__swatch--action" aria-hidden />
        <b>Follows your band</b> calmer the moment stress starts to climb
      </p>
    </div>
  );
}
