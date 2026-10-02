import { useAdminPrefs, type AdminThemeMode } from "@/lib/adminTheme";
import { Icon } from "@/components/kiosk/Icons";

const MODES: { mode: AdminThemeMode; label: string; icon: string }[] = [
  { mode: "light", label: "Terang", icon: "sun" },
  { mode: "dark", label: "Gelap", icon: "moon" },
  { mode: "system", label: "Otomatis", icon: "monitor" },
];

/** Terang / Gelap / Otomatis switch for the admin's own look (independent of the customer kiosk design). */
export function AdminThemeToggle({ showLabels = false }: { showLabels?: boolean }) {
  const mode = useAdminPrefs((state) => state.mode);
  const setMode = useAdminPrefs((state) => state.setMode);
  return (
    <div role="radiogroup" aria-label="Tema admin" className="inline-flex rounded-full border border-fg/10 bg-fg/[0.05] p-1">
      {MODES.map((item) => (
        <button
          key={item.mode}
          type="button"
          role="radio"
          aria-checked={mode === item.mode}
          title={item.label}
          onClick={() => setMode(item.mode)}
          className={`flex h-8 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition ${mode === item.mode ? "bg-fg text-canvas shadow-sm" : "text-fg/55 hover:text-fg"}`}
        >
          <Icon name={item.icon} className="h-4 w-4" />
          {showLabels && item.label}
        </button>
      ))}
    </div>
  );
}

/** Turns the automatic on-screen keyboard on/off (it pops up on its own whenever a field is tapped). */
export function AdminKeyboardToggle({ showLabel = false }: { showLabel?: boolean }) {
  const keyboardAuto = useAdminPrefs((state) => state.keyboardAuto);
  const setKeyboardAuto = useAdminPrefs((state) => state.setKeyboardAuto);
  return (
    <button
      type="button"
      onClick={() => setKeyboardAuto(!keyboardAuto)}
      aria-pressed={keyboardAuto}
      title={keyboardAuto ? "Keyboard layar: otomatis (ketuk untuk matikan)" : "Keyboard layar: mati (ketuk untuk aktifkan)"}
      className={`flex h-10 items-center justify-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${keyboardAuto ? "border-accent/40 bg-accent/10 text-accent" : "border-fg/10 bg-fg/[0.05] text-fg/55 hover:text-fg"}`}
    >
      <Icon name="keyboard" className="h-4 w-4" />
      {showLabel && (keyboardAuto ? "Keyboard layar: Otomatis" : "Keyboard layar: Mati")}
    </button>
  );
}
