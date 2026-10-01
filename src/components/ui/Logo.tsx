import Image from "next/image";

/** Brand lockup: cinder STUDY, sage LOOP on warm carbon, slanted forward. Transparent background. */
export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <Image
      src="/media/studyloop-logo.png"
      alt="StudyLoop"
      width={1951}
      height={782}
      preload
      className={`logo logo--${size}`}
    />
  );
}
