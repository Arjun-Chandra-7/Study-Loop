import type { Tab } from "@/lib/engine";
import { songLoop, vibeEngine } from "@/lib/music/vibe/engine";
import { DEMO_SONGS } from "@/lib/music/vibe/songs";
import { engine } from "@/lib/useStudyLoop";

/** The tour's Loop: three well-known songs, read ahead of time, so it plays with no account. */
export const DEMO_LOOP = songLoop(DEMO_SONGS, 0);

export interface TourStep {
  id: string;
  /** Shown above the line, like a chapter name. */
  title: string;
  /** What Arjun says. **Key words** are bolded, so a skimming judge still gets the point. */
  line: string;
  /** Element(s) to spotlight; several are joined into one highlight. None = whole screen dimmed. */
  target?: string[];
  /** Switch the app to this tab first. */
  tab?: Tab;
  /** Something to do live when the step opens (runs inside the Next click, so audio may start). */
  run?: () => void;
  /** Full-body Arjun for the opening and closing; a portrait otherwise. */
  art?: "full" | "bust";
  /** The pose he settles into once he's done talking. Default: relaxed. */
  mood?: Pose;
  /** Show StudyLoop's three beats (wear, study, it adapts) under the line. */
  beats?: boolean;
}

/** Arjun's poses: relaxed, mid-sentence, and a sheepish hand-in-hair. */
export type Pose = "normal" | "talking" | "extra";

const live = () => ["baseline", "active", "paused"].includes(engine.getSnapshot().session.phase);

export const STEPS: TourStep[] = [
  {
    id: "hello",
    title: "Hackathon tour",
    line: "Hey, I’m **Arjun**, the software and research dev on StudyLoop. You’ve got a lot of teams to see, so this takes **about two minutes**. Hit Next, or use the arrow keys.",
    art: "full",
    mood: "extra",
    tab: "home",
    run: () => {
      if (live()) engine.end();
      engine.newSession();
      engine.demoScenario("normal");
      vibeEngine.stop();
    },
  },
  {
    id: "why",
    title: "The problem",
    line: "Ever studied for an hour and realised you were **stressed the whole time**? You can’t feel it while it’s happening, and by the time you do, the hour’s gone.",
    tab: "home",
  },
  {
    id: "what",
    title: "StudyLoop, in three beats",
    line: "So we built something that **feels it for you**. A wristband reads your body, the app learns **your calm**, and your music **eases off** when stress climbs.",
    beats: true,
    tab: "home",
  },
  {
    id: "pair",
    title: "Pair the band",
    line: "Normally you’d pair your band from up here. I’ve connected a **simulated band**, so everything from now on is **live data**.",
    target: [".top-capsule", ".notch--tr", ".mx-band"],
    run: () => {
      if (engine.getSnapshot().reading.connection === "disconnected") void engine.connect();
    },
  },
  {
    id: "signals",
    title: "Live signals",
    line: "**Heart rate** from the pulse sensor, **skin conductance** from two electrodes. Both are compared with **your own baseline**: no scores, just how far you are from your normal.",
    target: [".notch--bl", ".area-c", ".area-d", ".mx-dials"],
  },
  {
    id: "start",
    title: "Start a session",
    line: "Let’s study. A session opens with a few **still seconds** so StudyLoop learns your baseline. No band? It still works as a **plain timer**.",
    target: [".main", ".mx-sheet"],
    tab: "session",
    run: () => {
      if (!live()) engine.beginSession();
    },
  },
  {
    id: "controls",
    title: "While you study",
    line: "**Pause**, **mark** a moment to remember, or switch on **40 Hz beats**. Start in silence and StudyLoop offers to put music on.",
    target: [".main-foot", ".mx-sheet .m-sheet__foot"],
    tab: "session",
  },
  {
    id: "stress",
    title: "When stress climbs",
    line: "Watch: I’m **stressing the band** on purpose. Heart and skin climb above baseline, the state turns **elevated**, and the moment is logged for later.",
    target: [".main", ".notch--bl", ".mx-sheet"],
    tab: "session",
    mood: "extra",
    run: () => engine.demoScenario("elevated"),
  },
  {
    id: "music",
    title: "Loops",
    line: "My favourite part. Type **any songs you love**, AI reads each one’s **tempo, key, chords and groove**, and StudyLoop plays a lyric-free beat that **sounds like it**. This is Get Lucky. Hear how it’s slower and softer? **That’s the stress.**",
    target: [".music"],
    tab: "music",
    run: () => {
      if (!vibeEngine.getSnapshot().playing) void vibeEngine.play(DEMO_LOOP, engine.getSnapshot().physio);
    },
  },
  {
    id: "recover",
    title: "Back to the groove",
    line: "Now the band calms down, and the beat **eases back** to the song’s real tempo. Every song gets its turn, then the **next one** comes in. No song audio is ever used.",
    target: [".music-player"],
    tab: "music",
    run: () => engine.demoScenario("recovery"),
  },
  {
    id: "insights",
    title: "Insights",
    line: "After a session: **how long you stayed steady**, every elevated moment, and your marks. Sessions even **survive a crash**: StudyLoop asks to continue.",
    target: [".insights"],
    tab: "insights",
  },
  {
    id: "research",
    title: "Honest science",
    line: "Brainwave research lives here, clearly **labelled experimental**, with peer-reviewed papers for every band. StudyLoop is a study tool, **not a medical device**.",
    target: [".research"],
    tab: "research",
  },
  {
    id: "profile",
    title: "Make it yours",
    line: "The band itself, **colour palettes**, **quiet mode** for deep focus, and every prompt can be switched off.",
    target: [".profile"],
    tab: "profile",
  },
  {
    id: "bye",
    title: "That’s StudyLoop",
    line: "**A band that feels stress. Music that answers it.** That’s StudyLoop. Thanks so much for your time! Explore on your own, or replay the tour.",
    art: "full",
    tab: "home",
    run: () => engine.demoScenario("normal"),
  },
];
