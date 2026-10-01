import { AuthGate } from "@/components/auth/AuthGate";
import { Cockpit } from "@/components/cockpit/Cockpit";
import { Anatomy } from "@/components/landing/Anatomy";
import { Finale, FinePrint } from "@/components/landing/Finale";
import { Flow } from "@/components/landing/Flow";
import { Frequencies } from "@/components/landing/Frequencies";
import { ProductStory } from "@/components/landing/ProductStory";
import { Intro } from "@/components/intro/Intro";
import { MobileApp } from "@/components/mobile/MobileApp";
import { MotionPrefs } from "@/components/motion/MotionPrefs";
import { MusicReturn } from "@/components/music/MusicReturn";
import { QuietLock } from "@/components/motion/QuietLock";
import { ScrollFX } from "@/components/motion/ScrollFX";
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
            {/* Desktop + tablet: the cockpit. Phone: its own vertical composition. */}
            <div className="only-wide">
              <Cockpit />
            </div>
            <div className="only-phone">
              <MobileApp />
            </div>
          </div>
          <ProductStory />
          <Anatomy />
          <Frequencies />
          <Flow />
          <Finale />
        </main>
        <FinePrint />
        <ScrollFX />
      </MotionPrefs>
    </AuthGate>
  );
}
