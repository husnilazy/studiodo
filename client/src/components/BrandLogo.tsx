import inkLogo from "@/assets/studiodo-wordmark-ink.png";
import whiteLogo from "@/assets/studiodo-wordmark-white.png";

/**
 * The STUDIODO wordmark for the admin screens. Both versions are rendered and CSS (see `.brand-logo-*` in index.css)
 * shows the one that fits the admin's current light/dark theme, so it also follows the "system" setting live.
 */
export function BrandLogo({ className = "h-8" }: { className?: string }) {
  return (
    <span className="inline-flex" aria-label="STUDIODO" role="img">
      <img src={inkLogo} alt="" draggable={false} className={`brand-logo-ink w-auto select-none ${className}`} />
      <img src={whiteLogo} alt="" draggable={false} className={`brand-logo-white w-auto select-none ${className}`} />
    </span>
  );
}
