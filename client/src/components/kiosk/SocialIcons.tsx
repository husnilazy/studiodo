import type { SocialKey } from "@/lib/socialLinks";

// Small line-style glyphs (24px grid) for the result screen's social row. Simple on purpose: they only need to be
// recognisable next to the handle, not to reproduce each brand's logo.
export function SocialIcon({ name, className = "h-5 w-5" }: { name: SocialKey; className?: string }) {
  const common = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "instagram":
      return <svg {...common}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" /></svg>;
    case "tiktok":
      return <svg {...common}><path d="M14 4v10.2a3.7 3.7 0 11-3.7-3.7" /><path d="M14 4c.3 2.3 1.9 3.9 4.2 4.1" /></svg>;
    case "facebook":
      return <svg {...common}><path d="M14.5 20v-7h2.4l.4-3h-2.8V8.4c0-.9.3-1.4 1.5-1.4h1.4V4.3C17 4.2 16.2 4 15.3 4c-2.2 0-3.7 1.3-3.7 3.8V10H9v3h2.6v7" /></svg>;
    case "youtube":
      return <svg {...common}><rect x="3" y="6" width="18" height="12" rx="3.5" /><path d="M10.5 9.5v5l4.2-2.5-4.2-2.5z" fill="currentColor" /></svg>;
    case "whatsapp":
      return <svg {...common}><path d="M4 20l1.2-4A8 8 0 1112 20a8 8 0 01-4-1.1L4 20z" /><path d="M9 9.2c.2 2.8 2.5 5 5.8 5.8l1-1.4-1.8-.9-.8.7c-1-.4-1.9-1.300-2.300-2.300l.7-.8-.9-1.800L9 9.200z" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.500 2.300 2.500 14.700 0 17M12 3.500c-2.500 2.300-2.500 14.700 0 17" /></svg>;
  }
}
