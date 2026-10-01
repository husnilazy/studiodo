// Shared Tailwind class constants for the admin surface (AdminDashboard,
// FrameManagement, Camera/Printer/Kiosk settings, etc.) — pulled out of
// AdminDashboard.tsx/CameraSettings.tsx/PrinterSettings.tsx/AdminPlaceholder.tsx/
// PaymentSettings.tsx, which had all independently hand-copied the same strings.
//
// Everything here uses the theme tokens (fg / surface / accent, see tailwind.config.ts), so the admin looks right
// in both the light and the dark theme — the old values were hard-coded for a dark background only.
export const panel = "rounded-[1.75rem] border border-fg/10 bg-surface/80 p-5 shadow-glass backdrop-blur-xl";
// Same as `panel` but with an accent border, for a card that should read as
// "currently active/in-progress" (e.g. FrameManagement's batch queue / edit panel).
export const panelAccent = "rounded-[1.75rem] border border-accent/40 bg-surface/80 p-5 shadow-glass backdrop-blur-xl";
export const sectionClass = "rounded-2xl border border-fg/10 bg-fg/[0.03] p-5";
export const inputClass = "mt-1 w-full rounded-xl border border-fg/15 bg-surface px-3.5 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
