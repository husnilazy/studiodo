import { Component, type ErrorInfo, type ReactNode } from "react";

// Without a boundary one failing component unmounts the WHOLE app and leaves a blank white window. This keeps the rest of the
// dashboard (sidebar, other sections) alive and shows what actually broke, so it can be reported and fixed.

interface Props { children: ReactNode; /** Shown in the title, e.g. the section name. */ label?: string; /** Changing this value clears a previous error (e.g. when the user opens another section). */ resetKey?: string }
interface State { error: Error | null; stack: string; copied: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: "", copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ stack: (info.componentStack ?? "").split("\n").slice(0, 8).join("\n") });
    console.error("[ErrorBoundary]", this.props.label ?? "", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null, stack: "", copied: false });
  }

  render() {
    const { error, stack, copied } = this.state;
    if (!error) return this.props.children;
    const report = `${this.props.label ?? "Bagian"}: ${error.name}: ${error.message}\n${stack}`.trim();
    return (
      <div role="alert" className="rounded-3xl border border-red-500/40 bg-red-500/10 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-500">Terjadi kesalahan</p>
        <h2 className="mt-2 font-display text-xl font-semibold">{this.props.label ? `Bagian “${this.props.label}” tidak bisa ditampilkan` : "Bagian ini tidak bisa ditampilkan"}</h2>
        <p className="mt-2 text-sm text-fg/70">Bagian lain aplikasi tetap berfungsi. Coba muat ulang; kalau berulang, salin laporan di bawah dan kirim ke tim pengembang.</p>
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-black/25 p-3 text-xs text-red-100">{report}</pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => this.setState({ error: null, stack: "", copied: false })} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white">Coba lagi</button>
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(report).then(() => this.setState({ copied: true })).catch(() => undefined); }} className="rounded-lg border border-fg/20 px-4 py-2 text-xs font-semibold">{copied ? "Tersalin ✓" : "Salin laporan"}</button>
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-fg/20 px-4 py-2 text-xs font-semibold">Muat ulang aplikasi</button>
        </div>
      </div>
    );
  }
}
