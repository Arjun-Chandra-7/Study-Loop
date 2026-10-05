import type { Tab } from "@/lib/engine";
import { songLoop, vibeEngine } from "@/lib/music/vibe/engine";
import { DEMO_SONGS } from "@/lib/music/vibe/songs";
import { engine } from "@/lib/useStudyLoop";

/** The tour's Loop: three well-known songs, read ahead of time, so it plays with no account. */
export const DEMO_LOOP = songLoop(DEMO_SONGS, 3, { name: "Demo playlist", id: "demo" });

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
    title: "Quick tour",
    line: "Hey, I’m **Arjun** from StudyLoop. This takes **about a minute** — hit Next, or use the arrow keys.",
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
    id: "what",
    title: "What StudyLoop does",
    line: "Ever studied for an hour and realised you were **stressed the whole time**? StudyLoop **feels it for you**: a band reads your body, and your music **eases off** when stress climbs.",
    beats: true,
    tab: "home",
  },
  {
    id: "band",
    title: "Your band, live",
    line: "I’ve connected a **simulated band**, so this is all **live data**. It reads **heart rate** and **skin conductance**, each against **your own baseline** — no scores, just how far from your normal.",
    target: [".top-capsule", ".notch--tr", ".mx-band", ".notch--bl", ".area-c", ".area-d", ".mx-dials"],
    run: () => {
      if (engine.getSnapshot().reading.connection === "disconnected") void engine.connect();
    },
  },
  {
    id: "start",
    title: "Start a session",
    line: "Let’s study. A session opens with a few **still seconds** to learn your baseline. No band? It’s still a **timer**.",
    target: [".main", ".mx-sheet"],
    tab: "session",
    run: () => {
      if (!live()) engine.beginSession();
    },
  },
  {
    id: "stress",
    title: "When stress climbs",
    line: "Watch — I’m **stressing the band**. Heart and skin climb above baseline, the state turns **elevated**, and the moment is **logged** for later.",
    target: [".main", ".notch--bl", ".mx-sheet"],
    tab: "session",
    mood: "extra",
    run: () => engine.demoScenario("elevated"),
  },
  {
    id: "music",
    title: "Loops",
    line: "Paste **any Spotify playlist** and StudyLoop rebuilds it as **beats you know in two bars** — tempo, key and groove, saved to your Library. This is Seven Nation Army, slower and softer: **that’s the stress.**",
    target: [".music"],
    tab: "music",
    run: () => {
      if (!vibeEngine.getSnapshot().playing) void vibeEngine.play(DEMO_LOOP, engine.getSnapshot().physio);
    },
  },
  {
    id: "recover",
    title: "Back to the groove",
    line: "As the band calms, the beat **eases back** to the song’s real tempo, then the **next one** comes in. No song audio is ever used.",
    target: [".music-player"],
    tab: "music",
    run: () => engine.demoScenario("recovery"),
  },
  {
    id: "insights",
    title: "Insights & more",
    line: "Afterwards: **how long you stayed steady**, every elevated moment, your marks — and sessions **survive a crash**. There’s honest, **experimental** brainwave research in-app too; StudyLoop is a study tool, **not a medical device**.",
    target: [".insights"],
    tab: "insights",
  },
  {
    id: "bye",
    title: "That’s StudyLoop",
    line: "**A band that feels stress. Music that answers it.** Thanks for your time — explore on your own, or replay the tour.",
    art: "full",
    tab: "home",
    run: () => engine.demoScenario("normal"),
  },
];
