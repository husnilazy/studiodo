// Shared Tailwind class constants for the admin surface (AdminDashboard,
// FrameManagement, Camera/Printer/Kiosk settings, etc.) — pulled out of
// AdminDashboard.tsx/CameraSettings.tsx/PrinterSettings.tsx/AdminPlaceholder.tsx/
// PaymentSettings.tsx, which had all independently hand-copied the same strings.
export const panel = "rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/10 backdrop-blur-xl";
// Same as `panel` but with an accent border, for a card that should read as
// "currently active/in-progress" (e.g. FrameManagement's batch queue / edit panel).
export const panelAccent = "rounded-[2rem] border border-accent/30 bg-white/[0.045] p-5 shadow-2xl shadow-black/10 backdrop-blur-xl";
export const sectionClass = "rounded-2xl border border-white/10 bg-ink-900/70 p-5";
export const inputClass = "mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none focus:border-accent";
