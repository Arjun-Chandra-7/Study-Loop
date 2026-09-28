import { PHYSIO_LABEL, type PhysioState } from "@/lib/sensors/classify";
import { Icon, type IconName } from "./Icon";

export const PHYSIO_ICON: Record<PhysioState, IconName> = {
  stable: "baseline",
  changing: "wave",
  elevated: "rise",
  recovering: "recover",
  poor: "alert",
  none: "unlink",
};

/** State = icon + word + tone. Never colour alone. */
export function StateBadge({ state, size = "sm" }: { state: PhysioState; size?: "sm" | "lg" }) {
  return (
    <span className={`state state--${state} state--${size}`}>
      <Icon name={PHYSIO_ICON[state]} size={size === "lg" ? 20 : 14} />
      <span>{PHYSIO_LABEL[state]}</span>
    </span>
  );
}
