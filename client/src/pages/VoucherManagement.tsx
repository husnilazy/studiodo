import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { inputClass, sectionClass, panel } from "@/lib/adminUi";
import { pushToast } from "@/lib/toastStore";
import Spinner from "@/components/Spinner";

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm text-fg/60">{label}</span>
      {children}
    </label>
  );
}

const money = (value: number) => `Rp ${Number(value || 0).toLocaleString("id-ID")}`;

// Split out of PaymentSettings.tsx — single-voucher CRUD + the cash-invoice
// generator are a pure relocation (unchanged behavior), "Buat banyak
// sekaligus" and "Laporan penggunaan" below are the genuinely new surfaces
// (see enumerated-finding-pine.md plan for the full reasoning).
export default function VoucherManagement() {
  const { config } = useBoothConfig();

  // --- Single voucher CRUD (relocated, unchanged) ---------------------------
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [voucherDraft, setVoucherDraft] = useState({ code: "", discountType: "percent", discountValue: "10", maxUses: "", startsAt: "", expiresAt: "" });
  const [editingVoucherId, setEditingVoucherId] = useState<string | null>(null);
  const [editingVoucher, setEditingVoucher] = useState<Record<string, string>>({});

  const refreshVouchers = () => api.getVouchers().then((result) => setVouchers(result ?? [])).catch((error) => console.error("Gagal memuat voucher", error));
  useEffect(() => { refreshVouchers(); }, []);

  const createVoucher = async () => {
    if (!voucherDraft.code.trim()) return;
    try {
      await api.createVoucher({ ...voucherDraft, maxUses: voucherDraft.maxUses || null, active: true });
      setVoucherDraft({ code: "", discountType: "percent", discountValue: "10", maxUses: "", startsAt: "", expiresAt: "" });
      refreshVouchers();
      pushToast({ type: "success", title: "Voucher dibuat" });
    } catch (error) {
      pushToast({ type: "error", title: "Gagal membuat voucher", sub: error instanceof Error ? error.message : undefined });
    }
  };

  const beginVoucherEdit = (voucher: any) => {
    setEditingVoucherId(voucher.id);
    setEditingVoucher({
      code: voucher.code,
      discountType: voucher.discountType,
      discountValue: String(voucher.discountValue),
      maxUses: voucher.maxUses == null ? "" : String(voucher.maxUses),
      startsAt: voucher.startsAt ? String(voucher.startsAt).slice(0, 16) : "",
      expiresAt: voucher.expiresAt ? String(voucher.expiresAt).slice(0, 16) : "",
    });
  };

  const saveVoucherEdit = async () => {
    if (!editingVoucherId) return;
    await api.updateVoucher(editingVoucherId, { ...editingVoucher, maxUses: editingVoucher.maxUses || null });
    setEditingVoucherId(null);
    refreshVouchers();
    pushToast({ type: "success", title: "Perubahan voucher tersimpan" });
  };

  // --- Cash invoice generator (relocated, unchanged) ------------------------
  const [cashPaymentEnabled, setCashPaymentEnabled] = useState(false);
  useEffect(() => {
    api.getPaymentConfig().then((result) => { if (result) setCashPaymentEnabled(Boolean(result.cashPaymentEnabled)); }).catch(() => undefined);
  }, []);
  const [cashInvoiceDraft, setCashInvoiceDraft] = useState({ amount: "", customerName: "" });
  const [cashInvoice, setCashInvoice] = useState<any | null>(null);
  const [cashInvoiceError, setCashInvoiceError] = useState<string | null>(null);

  const generateCashInvoice = async () => {
    setCashInvoiceError(null);
    try {
      const invoice = await api.createCashVoucher({ amount: Number(cashInvoiceDraft.amount), customerName: cashInvoiceDraft.customerName });
      setCashInvoice(invoice);
      setCashInvoiceDraft({ amount: "", customerName: "" });
    } catch (error) {
      setCashInvoiceError(error instanceof Error ? error.message : "Gagal membuat invoice cash");
    }
  };

  const printCashInvoice = async () => {
    if (!cashInvoice) return;
    setCashInvoiceError(null);
    if (window.studiodo?.printImage) {
      const canvas = document.createElement("canvas");
      canvas.width = 850;
      canvas.height = 1417;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#111111";
      ctx.textAlign = "center";
      ctx.font = "bold 56px sans-serif";
      ctx.fillText("STUDIODO", canvas.width / 2, 100);
      ctx.font = "28px sans-serif";
      ctx.fillText("Invoice Pembayaran Cash", canvas.width / 2, 150);
      ctx.textAlign = "left";
      ctx.font = "26px sans-serif";
      ctx.fillText(`No: ${cashInvoice.invoiceNumber}`, 60, 230);
      ctx.fillText(`Customer: ${cashInvoice.customerName || "-"}`, 60, 274);
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(60, 320);
      ctx.lineTo(canvas.width - 60, 320);
      ctx.stroke();
      ctx.font = "bold 40px sans-serif";
      ctx.fillText(`Total: Rp ${Number(cashInvoice.cashAmount).toLocaleString("id-ID")}`, 60, 380);
      const boxTop = 440;
      const boxHeight = 140;
      ctx.setLineDash([10, 8]);
      ctx.strokeRect(60, boxTop, canvas.width - 120, boxHeight);
      ctx.setLineDash([]);
      ctx.textAlign = "center";
      ctx.font = "bold 52px monospace";
      ctx.fillText(cashInvoice.code, canvas.width / 2, boxTop + boxHeight / 2 + 18);
      ctx.font = "24px sans-serif";
      ctx.fillText("Berikan kode ini ke customer", canvas.width / 2, boxTop + boxHeight + 60);
      ctx.fillText("untuk memulai sesi.", canvas.width / 2, boxTop + boxHeight + 94);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
      const result = await window.studiodo.printImage({ dataUrl, printerName: config.printerName, copies: 1, pageSize: "receipt" });
      if (!result.ok) setCashInvoiceError(result.error ?? "Print gagal");
      return;
    }
    const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character] ?? character));
    const printWindow = window.open("", "studiodo-cash-invoice", "width=420,height=620");
    if (!printWindow) return;
    printWindow.document.write(`<html><head><title>${escapeHtml(cashInvoice.invoiceNumber)}</title><style>@page{size:72mm 120mm;margin:0}body{font-family:Arial,sans-serif;width:72mm;margin:0 auto;padding:8mm 4mm;color:#111}h1{text-align:center;font-size:18px;margin:0 0 8px}p{margin:5px 0;font-size:12px}.code{font-size:20px;font-weight:bold;letter-spacing:2px;text-align:center;border:1px dashed #111;padding:10px 4px;margin:14px 0}.total{font-size:16px;font-weight:bold;border-top:1px solid #111;padding-top:8px}</style></head><body><h1>STUDIODO</h1><p style="text-align:center">Invoice Pembayaran Cash</p><p>No: ${escapeHtml(cashInvoice.invoiceNumber)}</p><p>Customer: ${escapeHtml(cashInvoice.customerName || "-")}</p><p class="total">Total: Rp ${Number(cashInvoice.cashAmount).toLocaleString("id-ID")}</p><div class="code">${escapeHtml(cashInvoice.code)}</div><p style="text-align:center">Berikan kode ini ke customer untuk memulai sesi.</p></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  // --- Bulk generation (new) -------------------------------------------------
  const [bulkDraft, setBulkDraft] = useState({ count: "10", codePrefix: "PROMO", discountType: "percent", discountValue: "10", maxUses: "1", startsAt: "", expiresAt: "" });
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkResult, setBulkResult] = useState<any[] | null>(null);

  const generateBulkVouchers = async () => {
    const count = Number(bulkDraft.count);
    if (!count || count < 1) return;
    setBulkGenerating(true);
    setBulkResult(null);
    try {
      const result = await api.createVouchersBulk({ ...bulkDraft, count, maxUses: bulkDraft.maxUses || null });
      const codes = result?.codes ?? [];
      setBulkResult(codes);
      refreshVouchers();
      pushToast({ type: "success", title: `${codes.length} voucher dibuat`, sub: codes.length < count ? `Diminta ${count}, sebagian gagal dibuat.` : undefined });
    } catch (error) {
      pushToast({ type: "error", title: "Gagal generate voucher massal", sub: error instanceof Error ? error.message : undefined });
    } finally {
      setBulkGenerating(false);
    }
  };

  const copyBulkCodes = () => {
    if (!bulkResult?.length) return;
    navigator.clipboard?.writeText(bulkResult.map((v) => v.code).join("\n"));
    pushToast({ type: "success", title: "Semua kode disalin" });
  };

  const downloadBulkCodes = () => {
    if (!bulkResult?.length) return;
    const csv = ["code,discount_type,discount_value,max_uses,starts_at,expires_at", ...bulkResult.map((v) => [v.code, v.discountType, v.discountValue, v.maxUses ?? "", v.startsAt ?? "", v.expiresAt ?? ""].join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `voucher-${bulkDraft.codePrefix || "PROMO"}-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // --- Usage report (new) -----------------------------------------------------
  const REPORT_PAGE_SIZE = 20;
  const [report, setReport] = useState<{ summary: { totalRedemptions: number; totalDiscountGiven: number; totalRevenueAfterDiscount: number }; items: any[]; total: number } | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportOffset, setReportOffset] = useState(0);

  const loadReport = async (offset: number) => {
    setReportLoading(true);
    try {
      const result = await api.getVoucherReport({ limit: REPORT_PAGE_SIZE, offset });
      if (result) setReport(result);
      setReportOffset(offset);
    } catch (error) {
      console.error("Gagal memuat laporan voucher", error);
    } finally {
      setReportLoading(false);
    }
  };
  useEffect(() => { loadReport(0); }, []);

  return (
    <div className="flex flex-col items-stretch gap-5">
      <section className={sectionClass}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">PROMO CONTROL</p>
            <h2 className="font-display text-xl font-semibold">Voucher & Diskon</h2>
            <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Kelola kode, nilai diskon, kuota, periode aktif, dan penggunaan.</p>
          </div>
          <span className="rounded-full border border-accent/30 px-3 py-1 text-xs text-accent">{vouchers.length} voucher</span>
        </div>
        <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/[0.04] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Buat voucher baru</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Kode voucher"><input className={inputClass} placeholder="HEMAT50" value={voucherDraft.code} onChange={(e) => setVoucherDraft({ ...voucherDraft, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Jenis diskon"><select className={inputClass} value={voucherDraft.discountType} onChange={(e) => setVoucherDraft({ ...voucherDraft, discountType: e.target.value })}><option value="percent">Persen (%)</option><option value="fixed">Potongan Rp</option><option value="free">Gratis</option></select></Field>
            <Field label="Nilai diskon"><input className={inputClass} type="number" min={0} placeholder="10" value={voucherDraft.discountValue} onChange={(e) => setVoucherDraft({ ...voucherDraft, discountValue: e.target.value })} /></Field>
            <Field label="Kuota penggunaan"><input className={inputClass} type="number" min={1} placeholder="Tanpa batas" value={voucherDraft.maxUses} onChange={(e) => setVoucherDraft({ ...voucherDraft, maxUses: e.target.value })} /></Field>
            <Field label="Mulai aktif"><input className={inputClass} type="datetime-local" value={voucherDraft.startsAt} onChange={(e) => setVoucherDraft({ ...voucherDraft, startsAt: e.target.value })} /></Field>
            <Field label="Berakhir"><input className={inputClass} type="datetime-local" value={voucherDraft.expiresAt} onChange={(e) => setVoucherDraft({ ...voucherDraft, expiresAt: e.target.value })} /></Field>
          </div>
          <button onClick={createVoucher} disabled={!voucherDraft.code.trim()} className="mt-4 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">+ Tambah voucher</button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {vouchers.map((voucher) => (
            <div key={voucher.id} className="rounded-2xl border border-fg/10 bg-fg/5 p-4">
              {editingVoucherId === voucher.id ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Kode"><input className={inputClass} value={editingVoucher.code ?? ""} onChange={(e) => setEditingVoucher({ ...editingVoucher, code: e.target.value.toUpperCase() })} /></Field>
                  <Field label="Jenis"><select className={inputClass} value={editingVoucher.discountType ?? "percent"} onChange={(e) => setEditingVoucher({ ...editingVoucher, discountType: e.target.value })}><option value="percent">Persen</option><option value="fixed">Nominal</option><option value="free">Gratis</option></select></Field>
                  <Field label="Nilai"><input className={inputClass} type="number" value={editingVoucher.discountValue ?? "0"} onChange={(e) => setEditingVoucher({ ...editingVoucher, discountValue: e.target.value })} /></Field>
                  <Field label="Kuota"><input className={inputClass} type="number" placeholder="Tanpa batas" value={editingVoucher.maxUses ?? ""} onChange={(e) => setEditingVoucher({ ...editingVoucher, maxUses: e.target.value })} /></Field>
                  <Field label="Mulai aktif"><input className={inputClass} type="datetime-local" value={editingVoucher.startsAt ?? ""} onChange={(e) => setEditingVoucher({ ...editingVoucher, startsAt: e.target.value })} /></Field>
                  <Field label="Berakhir"><input className={inputClass} type="datetime-local" value={editingVoucher.expiresAt ?? ""} onChange={(e) => setEditingVoucher({ ...editingVoucher, expiresAt: e.target.value })} /></Field>
                  <div className="flex gap-2 sm:col-span-2"><button onClick={saveVoucherEdit} className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold">Simpan perubahan</button><button onClick={() => setEditingVoucherId(null)} className="rounded-xl border border-fg/15 px-4 py-2 text-xs">Batal</button></div>
                </div>
              ) : <div className="flex items-start justify-between gap-3">
                <div><p className="font-semibold tracking-[0.16em] text-accent">{voucher.code}</p><p className="mt-1 text-lg font-semibold">{voucher.discountType === "percent" ? `${voucher.discountValue}%` : voucher.discountType === "free" ? "Gratis" : `Rp ${Number(voucher.discountValue).toLocaleString("id-ID")}`}</p><p className="mt-1 text-xs text-fg/45">Dipakai {voucher.usedCount}{voucher.maxUses === null ? " · Tanpa batas" : ` dari ${voucher.maxUses}`} · {voucher.startsAt ? new Date(voucher.startsAt).toLocaleDateString("id-ID") : "Mulai sekarang"}</p></div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${voucher.active ? "bg-emerald-400/15 text-emerald-200" : "bg-fg/10 text-fg/50"}`}>{voucher.active ? "Aktif" : "Nonaktif"}</span>
              </div>}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-fg/10 pt-3">
                <button onClick={() => beginVoucherEdit(voucher)} className="rounded-full border border-fg/15 px-3 py-1 text-xs">Edit</button>
                <button onClick={async () => { await api.updateVoucher(voucher.id, { active: !voucher.active }); refreshVouchers(); }} className="rounded-full border border-fg/15 px-3 py-1 text-xs">{voucher.active ? "Nonaktifkan" : "Aktifkan"}</button>
                <button onClick={async () => { await api.deleteVoucher(voucher.id); refreshVouchers(); }} className="text-xs text-red-300">Hapus</button>
              </div>
            </div>
          ))}
          {vouchers.length === 0 && <p className="text-sm text-fg/40">Belum ada voucher. Buat promo pertama untuk customer.</p>}
        </div>
      </section>

      <section className={sectionClass}>
        <p className="eyebrow">BULK PROMO</p>
        <h2 className="font-display text-xl font-semibold">Buat banyak sekaligus</h2>
        <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Generate banyak kode unik dengan aturan diskon/kuota/periode yang sama — misalnya 50 kode 20% off untuk dibagikan di sebuah event.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Jumlah kode"><input className={inputClass} type="number" min={1} max={500} value={bulkDraft.count} onChange={(e) => setBulkDraft({ ...bulkDraft, count: e.target.value })} /></Field>
          <Field label="Prefix kode"><input className={inputClass} placeholder="PROMO" value={bulkDraft.codePrefix} onChange={(e) => setBulkDraft({ ...bulkDraft, codePrefix: e.target.value.toUpperCase() })} /></Field>
          <Field label="Jenis diskon"><select className={inputClass} value={bulkDraft.discountType} onChange={(e) => setBulkDraft({ ...bulkDraft, discountType: e.target.value })}><option value="percent">Persen (%)</option><option value="fixed">Potongan Rp</option><option value="free">Gratis</option></select></Field>
          <Field label="Nilai diskon"><input className={inputClass} type="number" min={0} value={bulkDraft.discountValue} onChange={(e) => setBulkDraft({ ...bulkDraft, discountValue: e.target.value })} /></Field>
          <Field label="Kuota per kode"><input className={inputClass} type="number" min={1} placeholder="Tanpa batas" value={bulkDraft.maxUses} onChange={(e) => setBulkDraft({ ...bulkDraft, maxUses: e.target.value })} /></Field>
          <Field label="Mulai aktif"><input className={inputClass} type="datetime-local" value={bulkDraft.startsAt} onChange={(e) => setBulkDraft({ ...bulkDraft, startsAt: e.target.value })} /></Field>
          <Field label="Berakhir"><input className={inputClass} type="datetime-local" value={bulkDraft.expiresAt} onChange={(e) => setBulkDraft({ ...bulkDraft, expiresAt: e.target.value })} /></Field>
        </div>
        <button onClick={generateBulkVouchers} disabled={bulkGenerating || !Number(bulkDraft.count)} className="mt-4 flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
          {bulkGenerating && <Spinner size="sm" />}
          {bulkGenerating ? "Membuat…" : "Generate voucher"}
        </button>
        {bulkResult && (
          <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-emerald-200">{bulkResult.length} kode berhasil dibuat</p>
              <div className="flex gap-2">
                <button type="button" onClick={copyBulkCodes} className="rounded-lg border border-fg/15 px-3 py-1.5 text-xs text-fg/70 hover:border-accent hover:text-fg">Salin semua kode</button>
                <button type="button" onClick={downloadBulkCodes} className="rounded-lg border border-fg/15 px-3 py-1.5 text-xs text-fg/70 hover:border-accent hover:text-fg">Download CSV</button>
              </div>
            </div>
            <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-fg/10 bg-fg/5 p-2">
              <p className="font-mono text-xs leading-relaxed text-fg/70">{bulkResult.map((v) => v.code).join(", ")}</p>
            </div>
          </div>
        )}
      </section>

      <section className={sectionClass}>
        <p className="eyebrow">LAPORAN</p>
        <h2 className="font-display text-xl font-semibold">Penggunaan voucher</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className={panel}><p className="text-xs uppercase tracking-[.16em] text-fg/45">Total dipakai</p><p className="mt-3 font-display text-3xl font-semibold">{report?.summary.totalRedemptions ?? 0}</p></div>
          <div className={panel}><p className="text-xs uppercase tracking-[.16em] text-fg/45">Diskon diberikan</p><p className="mt-3 font-display text-3xl font-semibold">{money(report?.summary.totalDiscountGiven ?? 0)}</p></div>
          <div className={panel}><p className="text-xs uppercase tracking-[.16em] text-fg/45">Revenue setelah diskon</p><p className="mt-3 font-display text-3xl font-semibold text-accent">{money(report?.summary.totalRevenueAfterDiscount ?? 0)}</p></div>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-fg/45"><tr><th className="p-3">Waktu</th><th className="p-3">Kode</th><th className="p-3">Tujuan</th><th className="p-3">Diskon</th><th className="p-3">Dibayar</th></tr></thead>
            <tbody>
              {(report?.items ?? []).map((item) => (
                <tr key={item.id} className="border-t border-fg/10">
                  <td className="p-3 text-fg/60">{new Date(item.redeemedAt).toLocaleString("id-ID")}</td>
                  <td className="p-3 font-semibold text-accent">{item.code}</td>
                  <td className="p-3">{item.redemptionPurpose === "additional_print" ? "Print tambahan" : "Sesi"}</td>
                  <td className="p-3">{money(Number(item.discountAmount))}</td>
                  <td className="p-3">{money(Number(item.finalAmount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {reportLoading && <p className="py-6 text-center text-sm text-fg/40">Memuat…</p>}
          {!reportLoading && (report?.items.length ?? 0) === 0 && <p className="py-6 text-center text-sm text-fg/40">Belum ada voucher yang dipakai.</p>}
        </div>
        {report && report.total > REPORT_PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between text-sm text-fg/50">
            <button type="button" disabled={reportOffset === 0} onClick={() => loadReport(Math.max(0, reportOffset - REPORT_PAGE_SIZE))} className="rounded-lg border border-fg/15 px-3 py-1.5 disabled:opacity-30">← Sebelumnya</button>
            <span>{reportOffset + 1}–{Math.min(reportOffset + REPORT_PAGE_SIZE, report.total)} dari {report.total}</span>
            <button type="button" disabled={reportOffset + REPORT_PAGE_SIZE >= report.total} onClick={() => loadReport(reportOffset + REPORT_PAGE_SIZE)} className="rounded-lg border border-fg/15 px-3 py-1.5 disabled:opacity-30">Berikutnya →</button>
          </div>
        )}
      </section>

      {cashPaymentEnabled && (
        <section className={sectionClass}>
          <p className="eyebrow">PROMO CONTROL</p>
          <h2 className="font-display text-xl font-semibold">Invoice Cash</h2>
          <p className="mt-1 text-xs text-fg/45">Admin menerima uang cash, lalu membuat invoice dan kode sekali pakai.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Field label="Nominal diterima"><input className={inputClass} type="number" min={1} placeholder="50000" value={cashInvoiceDraft.amount} onChange={(event) => setCashInvoiceDraft({ ...cashInvoiceDraft, amount: event.target.value })} /></Field>
            <Field label="Nama customer (opsional)"><input className={inputClass} placeholder="Nama customer" value={cashInvoiceDraft.customerName} onChange={(event) => setCashInvoiceDraft({ ...cashInvoiceDraft, customerName: event.target.value })} /></Field>
            <button type="button" onClick={generateCashInvoice} disabled={!cashInvoiceDraft.amount} className="mt-1 self-end rounded-xl bg-accent px-4 py-2 text-sm font-semibold disabled:opacity-40">Generate invoice</button>
          </div>
          {cashInvoiceError && <p className="mt-3 text-xs text-red-300">{cashInvoiceError}</p>}
          {cashInvoice && <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4"><div><p className="text-xs text-fg/45">{cashInvoice.invoiceNumber}</p><p className="mt-1 text-2xl font-bold tracking-[0.16em] text-emerald-200">{cashInvoice.code}</p><p className="mt-1 text-sm">Rp {Number(cashInvoice.cashAmount).toLocaleString("id-ID")} · {cashInvoice.customerName || "Tanpa nama"}</p></div><button type="button" onClick={printCashInvoice} className="rounded-xl border border-fg/20 px-4 py-2 text-sm hover:border-accent">Print struk kecil</button></div>}
        </section>
      )}
    </div>
  );
}
