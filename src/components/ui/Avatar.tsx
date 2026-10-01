"use client";

import { useState } from "react";
import { initials, useAuth } from "@/lib/auth";

/** The person's photo (their pick, else Google's); their initials only if there's no photo at all. */
export function Avatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const { user, photo } = useAuth();
  const [broken, setBroken] = useState<string | null>(null);
  const cls = `avatar${size === "md" ? "" : ` avatar--${size}`}`;
  if (photo && broken !== photo) {
    return (
      <span className={`${cls} avatar--photo`} aria-hidden>
        {/* Google-hosted or our own photo URL; next/image would need every host whitelisted. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="" referrerPolicy="no-referrer" onError={() => setBroken(photo)} />
      </span>
    );
  }
  return (
    <span className={cls} aria-hidden>
      {initials(user)}
    </span>
  );
}
