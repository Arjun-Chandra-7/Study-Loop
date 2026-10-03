import type { Tab } from "@/lib/engine";
import type { LoopMeta } from "@/lib/music/vibe/engine";
import { vibeEngine } from "@/lib/music/vibe/engine";
import { engine } from "@/lib/useStudyLoop";

/** A Loop the tour can play with no account and no server: a warm lo-fi profile. */
export const DEMO_LOOP: LoopMeta = {
  name: "Late Night Lo-fi",
  playlistName: "Demo playlist",
  profile: {
    summary: "Warm lo-fi with soft keys and guitar",
    moods: ["calm", "warm"],
    tempoBpm: 80,
    key: "D",
    mode: "minor",
    progression: [1, 6, 4, 5],
    drumFeel: "lofi",
    palette: ["rhodes", "acoustic_guitar"],
    energy: 0.4,
    warmth: 0.75,
    swing: 0.3,
  },
};

export interface TourStep {
  id: string;
  /** Shown above the line, like a chapter name. */
  title: string;
  /** What Arjun says. */
  line: string;
  /** Element(s) to spotlight; several are joined into one highlight. None = whole screen dimmed. */
  target?: string[];
  /** Switch the app to this tab first. */
  tab?: Tab;
  /** Something to do live when the step opens (runs inside the Next click, so audio may start). */
  run?: () => void;
  /** Full-body Arjun for the opening and closing; a portrait otherwise. */
  art?: "full" | "bust";
}

const live = () => ["baseline", "active", "paused"].includes(engine.getSnapshot().session.phase);

export const STEPS: TourStep[] = [
  {
    id: "hello",
    title: "Hackathon tour",
    line: "Hey! I’m Arjun, the software and research dev on StudyLoop. I know you’ve got a lot of teams to see, so I’ll walk you through everything in about two minutes. Hit Next, or use the arrow keys.",
    art: "full",
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
    title: "What StudyLoop is",
    line: "StudyLoop is a study wristband plus this app. The band reads your heart rate and skin conductance while you study, and the app shows how your body is responding, always against your own baseline and never as a score.",
    target: [".main", ".mx-hero"],
    tab: "home",
  },
  {
    id: "pair",
    title: "Pair the band",
    line: "Normally you’d pair your band from up here. For this demo I’ve connected a simulated SL-01, so everything you see from now on is live data.",
    target: [".top-capsule", ".notch--tr", ".mx-band"],
    run: () => {
      if (engine.getSnapshot().reading.connection === "disconnected") void engine.connect();
    },
  },
  {
    id: "signals",
    title: "Live signals",
    line: "Heart rate comes from the pulse sensor, skin conductance from two electrodes on the underside. Signal quality tells you if the band is sitting right, and the baseline is your resting level for today.",
    target: [".notch--bl", ".area-c", ".area-d", ".mx-dials"],
  },
  {
    id: "start",
    title: "Start a session",
    line: "Let’s study. A session starts with a short stillness so StudyLoop learns your baseline: 20 seconds normally, 5 for this demo. No band? You can still run a plain timed session.",
    target: [".main", ".mx-sheet"],
    tab: "session",
    run: () => {
      if (!live()) engine.beginSession();
    },
  },
  {
    id: "controls",
    title: "While you study",
    line: "Pause, mark a moment you want to remember, or switch on 40 Hz beats. If nothing’s playing when you start, StudyLoop offers to put some music on.",
    target: [".main-foot", ".mx-sheet .m-sheet__foot"],
    tab: "session",
  },
  {
    id: "stress",
    title: "When stress climbs",
    line: "Watch this: I’m making the simulated band stressed. Heart rate and skin conductance climb above baseline, the state turns elevated, and that moment gets logged for your review.",
    target: [".main", ".notch--bl", ".mx-sheet"],
    tab: "session",
    run: () => engine.demoScenario("elevated"),
  },
  {
    id: "music",
    title: "Loops",
    line: "This is my favourite part. Paste any Spotify playlist, AI reads its style, and StudyLoop composes original, lyric-free beats in that vibe, live in your browser. I’ve started one. Hear how it’s slower and softer right now? That’s the stress.",
    target: [".music"],
    tab: "music",
    run: () => {
      if (!vibeEngine.getSnapshot().playing) void vibeEngine.play(DEMO_LOOP, engine.getSnapshot().physio);
    },
  },
  {
    id: "recover",
    title: "Back to the groove",
    line: "Now I’ll let the band calm down. As you recover, the beat eases back to its normal tempo. No song audio is ever used, so it works with any playlist.",
    target: [".music-player"],
    tab: "music",
    run: () => engine.demoScenario("recovery"),
  },
  {
    id: "insights",
    title: "Insights",
    line: "After a session, Insights shows how long you stayed steady, every elevated moment, your marks and the full signal trace. Sessions survive a reload or crash too: StudyLoop asks if you want to continue.",
    target: [".insights"],
    tab: "insights",
  },
  {
    id: "research",
    title: "Honest science",
    line: "We’re careful with the science. Brainwave research lives here, clearly labelled experimental, with peer-reviewed papers for every band. StudyLoop is a study tool, not a medical device.",
    target: [".research"],
    tab: "research",
  },
  {
    id: "profile",
    title: "Make it yours",
    line: "Here’s the band itself, colour palettes, quiet mode for deep focus, and prompts you can switch off.",
    target: [".profile"],
    tab: "profile",
  },
  {
    id: "bye",
    title: "That’s StudyLoop",
    line: "A band that reads how you study, and music that studies with you. Thanks so much for your time! Explore on your own, or run the tour again.",
    art: "full",
    tab: "home",
    run: () => engine.demoScenario("normal"),
  },
];
