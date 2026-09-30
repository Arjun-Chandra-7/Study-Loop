import Image from "next/image";

/** Brand lockup. Source: studyloop-rec.png, cropped with a transparent background. */
export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <Image
      src="/media/studyloop-logo.png"
      alt="StudyLoop"
      width={1951}
      height={797}
      preload
      className={`logo logo--${size}`}
    />
  );
}
