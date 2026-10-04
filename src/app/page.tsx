import { AuthGate } from "@/components/auth/AuthGate";
import { AppLayout } from "@/components/cockpit/AppLayout";
import { Anatomy } from "@/components/landing/Anatomy";
import { Finale, FinePrint } from "@/components/landing/Finale";
import { Flow } from "@/components/landing/Flow";
import { Frequencies } from "@/components/landing/Frequencies";
import { Night } from "@/components/landing/Night";
import { ProductStory } from "@/components/landing/ProductStory";
import { Intro } from "@/components/intro/Intro";
import { MotionPrefs } from "@/components/motion/MotionPrefs";
import { MusicReturn } from "@/components/music/MusicReturn";
import { QuietLock } from "@/components/motion/QuietLock";
import { SessionPrompts } from "@/components/session/SessionPrompts";
import { SessionRecovery } from "@/components/session/SessionRecovery";
import { DemoTour } from "@/components/demo/DemoTour";
import { FirstRun } from "@/components/onboarding/FirstRun";
import { ScrollFX } from "@/components/motion/ScrollFX";
import "@/components/landing/campaign.css";
import { SmoothScroll } from "@/components/motion/SmoothScroll";

export default function Home() {
  return (
    <AuthGate>
      <MotionPrefs>
        <MusicReturn />
        <SmoothScroll />
        <QuietLock />
        <Intro />
        <a className="skip" href="#cockpit">
          Skip to session controls
        </a>
        <main>
          <div id="cockpit">
            <AppLayout />
          </div>
          <ProductStory />
          <Anatomy />
          <Frequencies />
          <Flow />
          <Night />
          <Finale />
        </main>
        <FinePrint />
        <ScrollFX />
        <SessionPrompts />
        <SessionRecovery />
        <DemoTour />
        <FirstRun />
      </MotionPrefs>
    </AuthGate>
  );
}
