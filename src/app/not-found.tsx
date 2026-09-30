import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export default function NotFound() {
  return (
    <main className="nf">
      <Link href="/" aria-label="StudyLoop home">
        <Logo />
      </Link>
      <div className="nf__body">
        <p className="eyebrow">
          <span className="eyebrow__rule" aria-hidden />
          Error 404
        </p>
        <h1 className="display display--md">No signal at this address.</h1>
        <p className="body muted">
          The link may be old or mistyped. Sessions, insights and the band all start from the home page.
        </p>
        <Link href="/" className="btn btn--primary">
          Back to StudyLoop
        </Link>
      </div>
    </main>
  );
}
