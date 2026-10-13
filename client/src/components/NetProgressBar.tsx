import { useEffect, useState } from "react";
import { useNetBusy } from "@/lib/netActivity";

/** Thin sweeping bar at the top of the screen while any API call is in flight. Appears only after a short delay so quick calls don't flicker. */
export default function NetProgressBar() {
  const busy = useNetBusy();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!busy) { const t = setTimeout(() => setVisible(false), 250); return () => clearTimeout(t); }
    const t = setTimeout(() => setVisible(true), 180);
    return () => clearTimeout(t);
  }, [busy]);
  if (!visible) return null;
  return (
    <div role="progressbar" aria-label="Memuat" aria-busy="true" className="pointer-events-none fixed inset-x-0 top-0 z-[90] h-[3px] overflow-hidden">
      <div className="net-progress-bar h-full w-1/3 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />
    </div>
  );
}
