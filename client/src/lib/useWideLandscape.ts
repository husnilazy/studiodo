import { useEffect, useState } from "react";

const QUERY = "(orientation: landscape) and (min-width: 1280px)";

/** True on a wide landscape screen (a 1920x1080 kiosk) — screens use it to switch to a side-by-side layout. */
export function useWideLandscape() {
  const [wide, setWide] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const onChange = () => setWide(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return wide;
}
