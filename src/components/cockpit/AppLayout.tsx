"use client";

import { PHONE_QUERY, useMedia } from "@/lib/useMedia";
import { MobileApp } from "../mobile/MobileApp";
import { Cockpit } from "./Cockpit";

/**
 * Desktop and tablet get the cockpit, phones their own vertical composition.
 * Only one is mounted: hiding the other with CSS still ran its renders, canvases and timers.
 */
export function AppLayout() {
  const phone = useMedia(PHONE_QUERY);
  return phone ? (
    <div className="only-phone">
      <MobileApp />
    </div>
  ) : (
    <div className="only-wide">
      <Cockpit />
    </div>
  );
}
