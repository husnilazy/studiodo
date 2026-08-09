import { useEffect } from "react";
import { useBoothConfig, applyThemeToDocument } from "@/lib/boothConfigStore";

export default function KioskShell({ children }: { children: React.ReactNode }) {
  const config = useBoothConfig((s) => s.config);

  useEffect(() => {
    applyThemeToDocument(config);
  }, [config]);

  return (
    <div
      className="kinetic-shell relative h-full w-full overflow-hidden font-body antialiased"
      style={{ backgroundColor: "var(--kiosk-background)", color: "var(--kiosk-text)" }}
    >
      <div className="kinetic-orb kinetic-orb-a" />
      <div className="kinetic-orb kinetic-orb-b" />
      <div className="kinetic-noise" />
      {children}
    </div>
  );
}
