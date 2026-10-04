import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  visits: number;
  revenue?: number;
}

type Metric = "visits" | "revenue";
const RANGES = [7, 14, 30, 90] as const;

const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const compactMoney = (value: number) => (value >= 1_000_000 ? `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)} jt` : value >= 1_000 ? `${Math.round(value / 1_000)} rb` : String(Math.round(value)));
const dayLabel = (date: string, long = false) => new Date(`${date}T00:00:00`).toLocaleDateString("id-ID", long ? { weekday: "short", day: "numeric", month: "long" } : { day: "2-digit", month: "short" });
const isoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Every day in the range gets a point (days with no sessions are 0) so the line reads as a true timeline. */
function fillDays(points: TrendPoint[], days: number) {
  const byDate = new Map(points.map((point) => [point.date, point]));
  const result: Required<TrendPoint>[] = [];
  const today = new Date();
  for (let offset = days - 1; offset >= 0; offset--) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const key = isoDay(day);
    const found = byDate.get(key);
    result.push({ date: key, visits: found?.visits ?? 0, revenue: found?.revenue ?? 0 });
  }
  return result;
}

/** Monotone cubic interpolation (Fritsch–Carlson): smooth like a spline but never overshoots below zero or above a peak. */
function smoothPath(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n === 0) return "";
  if (n === 1) return `M${xs[0]},${ys[0]}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(xs[i + 1] - xs[i]);
    slope.push((ys[i + 1] - ys[i]) / dx[i]);
  }
  const tangent = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  tangent.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
    } else {
      const a = tangent[i] / slope[i];
      const b = tangent[i + 1] / slope[i];
      const h = Math.hypot(a, b);
      if (h > 3) {
        const t = 3 / h;
        tangent[i] = t * a * slope[i];
        tangent[i + 1] = t * b * slope[i];
      }
    }
  }
  let path = `M${xs[0]},${ys[0]}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = xs[i] + dx[i] / 3;
    const c1y = ys[i] + (tangent[i] * dx[i]) / 3;
    const c2x = xs[i + 1] - dx[i] / 3;
    const c2y = ys[i + 1] - (tangent[i + 1] * dx[i]) / 3;
    path += ` C${c1x},${c1y} ${c2x},${c2y} ${xs[i + 1]},${ys[i + 1]}`;
  }
  return path;
}

function niceMax(value: number) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export default function TrendChart({ data, showRevenue = true }: { data: TrendPoint[]; showRevenue?: boolean }) {
  const gradientId = useId().replace(/:/g, "");
  const [metric, setMetric] = useState<Metric>("visits");
  const [range, setRange] = useState<(typeof RANGES)[number]>(14);
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => setWidth(Math.max(280, entries[0].contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const series = useMemo(() => fillDays(data, range), [data, range]);
  const previous = useMemo(() => {
    // the same number of days immediately before this window — to say "up/down vs. before"
    const all = fillDays(data, range * 2);
    return all.slice(0, range);
  }, [data, range]);

  const value = (point: Required<TrendPoint>) => (metric === "visits" ? point.visits : point.revenue);
  const total = series.reduce((sum, point) => sum + value(point), 0);
  const previousTotal = previous.reduce((sum, point) => sum + value(point), 0);
  const delta = previousTotal > 0 ? Math.round(((total - previousTotal) / previousTotal) * 100) : null;
  const peak = series.reduce((best, point) => (value(point) > value(best) ? point : best), series[0]);

  const height = 280;
  const pad = { top: 18, right: 14, bottom: 30, left: metric === "revenue" ? 52 : 36 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxValue = niceMax(Math.max(...series.map(value), 1));
  const xs = series.map((_, index) => pad.left + (series.length === 1 ? innerW / 2 : (index / (series.length - 1)) * innerW));
  const ys = series.map((point) => pad.top + innerH - (value(point) / maxValue) * innerH);
  const linePath = smoothPath(xs, ys);
  const areaPath = `${linePath} L${xs[xs.length - 1]},${pad.top + innerH} L${xs[0]},${pad.top + innerH} Z`;
  const ticks = [0, 1, 2, 3, 4].map((step) => (maxValue / 4) * step);
  const labelEvery = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor(innerW / 64))));

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left;
    let nearest = 0;
    let best = Infinity;
    xs.forEach((px, index) => {
      const distance = Math.abs(px - x);
      if (distance < best) { best = distance; nearest = index; }
    });
    setHover(nearest);
  };

  const active = hover !== null ? series[hover] : null;
  const tooltipLeft = hover !== null ? Math.min(Math.max(xs[hover] - 78, 4), width - 160) : 0;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[.16em] text-accent">TREN</p>
          <div className="mt-1.5 flex items-baseline gap-3">
            <h3 className="font-display text-3xl font-semibold tracking-tight">{metric === "visits" ? total.toLocaleString("id-ID") : money(total)}</h3>
            {delta !== null && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${delta >= 0 ? "bg-emerald-400/15 text-emerald-600" : "bg-red-400/15 text-red-500"}`}>
                {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-fg/50">{metric === "visits" ? "sesi" : "pendapatan"} dalam {range} hari terakhir{delta !== null ? ` · dibanding ${range} hari sebelumnya` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showRevenue && (
            <div className="inline-flex rounded-xl border border-fg/10 bg-fg/[0.04] p-1 text-xs font-semibold">
              {([["visits", "Sesi"], ["revenue", "Pendapatan"]] as const).map(([key, label]) => (
                <button key={key} type="button" onClick={() => { setMetric(key); setHover(null); }} className={`rounded-lg px-3 py-1.5 transition ${metric === key ? "bg-surface text-fg shadow-sm" : "text-fg/50 hover:text-fg"}`}>{label}</button>
              ))}
            </div>
          )}
          <div className="inline-flex rounded-xl border border-fg/10 bg-fg/[0.04] p-1 text-xs font-semibold">
            {RANGES.map((days) => (
              <button key={days} type="button" onClick={() => { setRange(days); setHover(null); }} className={`rounded-lg px-3 py-1.5 transition ${range === days ? "bg-surface text-fg shadow-sm" : "text-fg/50 hover:text-fg"}`}>{days}H</button>
            ))}
          </div>
        </div>
      </div>

      <div ref={wrapRef} className="relative mt-4 select-none">
        <svg width={width} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)} className="block touch-none overflow-visible" role="img" aria-label="Grafik tren">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((tick) => {
            const y = pad.top + innerH - (tick / maxValue) * innerH;
            return (
              <g key={tick}>
                <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="currentColor" strokeOpacity={tick === 0 ? 0.18 : 0.07} strokeDasharray={tick === 0 ? undefined : "3 5"} />
                <text x={pad.left - 8} y={y + 4} textAnchor="end" className="fill-current text-[10px]" fillOpacity={0.4}>{metric === "visits" ? Math.round(tick) : compactMoney(tick)}</text>
              </g>
            );
          })}
          <AnimatePresence mode="wait">
            <motion.g key={`${metric}-${range}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <motion.path d={areaPath} fill={`url(#${gradientId})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9, delay: 0.2 }} />
              <motion.path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
              {series.length <= 31 && series.map((point, index) => (
                <motion.circle key={point.date} cx={xs[index]} cy={ys[index]} r={hover === index ? 5.5 : value(point) > 0 ? 3 : 0} fill="var(--kiosk-surface, #fff)" stroke="var(--accent)" strokeWidth={2} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + index * 0.012 }} />
              ))}
            </motion.g>
          </AnimatePresence>
          {series.map((point, index) => (index % labelEvery === 0 || index === series.length - 1) && (
            <text key={point.date} x={xs[index]} y={height - 8} textAnchor={index === 0 ? "start" : index === series.length - 1 ? "end" : "middle"} className="fill-current text-[10px]" fillOpacity={0.4}>{dayLabel(point.date)}</text>
          ))}
          {hover !== null && (
            <g pointerEvents="none">
              <line x1={xs[hover]} x2={xs[hover]} y1={pad.top} y2={pad.top + innerH} stroke="var(--accent)" strokeOpacity={0.35} strokeDasharray="4 4" />
              <circle cx={xs[hover]} cy={ys[hover]} r={6} fill="var(--accent)" fillOpacity={0.2} />
              <circle cx={xs[hover]} cy={ys[hover]} r={4} fill="var(--accent)" />
            </g>
          )}
        </svg>
        {active && (
          <div className="pointer-events-none absolute top-0 z-10 w-[156px] rounded-xl border border-fg/10 bg-surface px-3 py-2 shadow-glass" style={{ left: tooltipLeft }}>
            <p className="text-[11px] font-semibold text-fg/55">{dayLabel(active.date, true)}</p>
            <p className="mt-1 text-sm font-semibold">{active.visits} sesi</p>
            {showRevenue && <p className="text-xs text-accent">{money(active.revenue)}</p>}
          </div>
        )}
      </div>
      <p className="mt-1 text-xs text-fg/40">Puncak: {dayLabel(peak.date)} · {metric === "visits" ? `${peak.visits} sesi` : money(peak.revenue)}</p>
    </div>
  );
}
