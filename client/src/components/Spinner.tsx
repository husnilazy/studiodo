// The h-*/w-* animate-spin idiom already used throughout kiosk-facing pages
// (Hasil.tsx, SesiFoto.tsx) — admin pages had no spinner at all, only text
// like "Menyimpan...". One shared component instead of four hand-rolled copies.
const SIZES = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
} as const;

export default function Spinner({ size = "sm", className = "" }: { size?: keyof typeof SIZES; className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-fg/20 border-t-accent ${SIZES[size]} ${className}`} />;
}
