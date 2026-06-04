"use client";
import { useState, useEffect, useRef } from "react";

// ============ 型 ============
export type SignalType = "drop" | "surge" | "reversal";

export type Sig = {
  id: string | number;
  raceId: string;
  venue: string;
  raceNumber: number;
  type: SignalType;
  horseNumber: number;
  currOdds: number | null;
  prevOdds: number | null;
  changePct: number | null;
  notifiedAt: number; // ms epoch
  oldFav?: number | null;
  newFav?: number | null;
  horseName: string;
  grade: string;
  popularity?: number | null;
  jockey: string;
  postTime: number | null; // ms epoch or null(未取得)
  spark?: number[] | null;
};

export type RaceHorse = {
  num: number;
  name: string;
  jockey: string;
  popularity: number;
  currOdds: number;
  series: number[];
};
export type Race = {
  raceId: string;
  venue: string;
  raceNumber: number;
  grade: string;
  raceName: string;
  surface: string;
  distance: number;
  nHorses: number;
  postTime: number | null;
  snapTimes: number[];
  horses: RaceHorse[];
  signals: Sig[];
};

const S = (o: Record<string, unknown>) => o as React.CSSProperties;

// ①〜⑳
const CIRCLED_BASE = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳".split("");
export const circled = (n: number) => CIRCLED_BASE[n - 1] || String(n);

export const SIGNAL_META: Record<SignalType, { label: string; varc: string; arrow: string; word: string; desc: string }> = {
  drop: { label: "急落", varc: "var(--drop)", arrow: "▼", word: "資金流入", desc: "オッズ下降＝買われている" },
  surge: { label: "急騰", varc: "var(--surge)", arrow: "▲", word: "資金流出", desc: "オッズ上昇＝抜けた" },
  reversal: { label: "逆転", varc: "var(--reversal)", arrow: "⇄", word: "人気交代", desc: "1番人気が入れ替わった" },
};

export function fmtOdds(o: number | null | undefined) { return o == null || o <= 0 ? "—" : o.toFixed(1); }
export function fmtPct(p: number | null | undefined) { if (p == null) return ""; return (p > 0 ? "+" : "") + p.toFixed(1) + "%"; }
export function fmtClock(ms: number) {
  const d = new Date(ms);
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}
export function postState(postTime: number | null, now: number) {
  if (postTime == null) return { txt: "", soon: false, done: false };
  const diff = postTime - now;
  const min = Math.round(diff / 60000);
  if (min < -1) return { txt: "発走済み", soon: false, done: true };
  if (min <= 0) return { txt: "まもなく", soon: true, done: false };
  if (min <= 15) return { txt: `発走まで${min}分`, soon: true, done: false };
  return { txt: `発走まで${min}分`, soon: false, done: false };
}

// --- CountUp ---
export function CountUp({ value, decimals = 1, dur = 600, className, style }:
  { value: number; decimals?: number; dur?: number; className?: string; style?: React.CSSProperties }) {
  const [disp, setDisp] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) { setDisp(to); return; }
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setDisp(from + (to - from) * e);
      if (k < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, dur]);
  return <span className={className} style={style}>{disp.toFixed(decimals)}</span>;
}

// --- Sparkline (Y反転: 低オッズ=上) ---
export function Sparkline({ data, color, w = 78, h = 30, strokeW = 2 }:
  { data?: number[] | null; color: string; w?: number; h?: number; strokeW?: number }) {
  const uid = useRef("s" + Math.random().toString(36).slice(2, 7)).current;
  if (!data || data.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...data), max = Math.max(...data);
  const pad = 3;
  const span = max - min || 1;
  const xs = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const ys = (v: number) => pad + ((v - min) / span) * (h - pad * 2);
  const pts = data.map((v, i) => `${xs(i).toFixed(1)},${ys(v).toFixed(1)}`);
  const linePath = "M" + pts.join(" L");
  const areaPath = `${linePath} L${xs(data.length - 1).toFixed(1)},${h - pad} L${xs(0).toFixed(1)},${h - pad} Z`;
  const lastX = xs(data.length - 1), lastY = ys(data[data.length - 1]);
  return (
    <svg width={w} height={h} className="ky-spark" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`${uid}-f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${uid}-f)`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={strokeW} strokeLinejoin="round" strokeLinecap="round" className="ky-spark-line" pathLength={1} />
      <circle cx={lastX} cy={lastY} r="3" fill={color} className="ky-spark-dot" />
      <circle cx={lastX} cy={lastY} r="3" fill="none" stroke={color} strokeWidth="2" className="ky-spark-ping" />
    </svg>
  );
}

// --- LiveDot ---
export function LiveDot({ label = "LIVE", color = "var(--drop)" }: { label?: string; color?: string }) {
  return (
    <span className="ky-live" style={{ color }}>
      <span className="ky-live-dot" style={{ background: color }} />
      <span className="ky-live-ring" style={{ borderColor: color }} />
      {label}
    </span>
  );
}

// --- 種別バッジ ---
export function TypeBadge({ type, size = "md" }: { type: SignalType; size?: "sm" | "md" }) {
  const m = SIGNAL_META[type];
  const pad = size === "sm" ? "2px 7px" : "3px 10px";
  const fs = size === "sm" ? 11 : 12.5;
  return (
    <span className="ky-badge" style={{ color: m.varc, background: `color-mix(in srgb, ${m.varc} 15%, transparent)`, borderColor: `color-mix(in srgb, ${m.varc} 40%, transparent)`, padding: pad, fontSize: fs }}>
      <span className="ky-badge-arrow">{m.arrow}</span>{m.label}
    </span>
  );
}

// --- グレードチップ(空なら非表示) ---
export function GradeChip({ grade }: { grade: string }) {
  if (!grade) return null;
  const isG = /^G/.test(grade);
  return <span className="ky-grade" style={{ background: isG ? "var(--cta)" : "var(--surface-2)", color: isG ? "#0A0E17" : "var(--muted)", borderColor: isG ? "transparent" : "var(--line)" }}>{grade}</span>;
}

// --- SignalRow ---
export function SignalRow({ s, layout = "card", now, onOpen, fresh }:
  { s: Sig; layout?: "card" | "list" | "heat"; now: number; onOpen: (id: string) => void; fresh?: boolean }) {
  const m = SIGNAL_META[s.type];
  const ps = postState(s.postTime, now);
  const isRev = s.type === "reversal";
  const cls = `ky-row ky-row-${layout} ${ps.done ? "is-done" : ""} ${fresh ? "is-fresh" : ""}`;

  if (layout === "heat") {
    const intensity = Math.min(1, Math.abs(s.changePct || 0) / 55);
    return (
      <button className={cls} onClick={() => onOpen(s.raceId)} style={S({ "--accent": m.varc, "--heat": intensity })}>
        <div className="ky-heat-top">
          <span className="ky-heat-arrow" style={{ color: m.varc }}>{m.arrow}</span>
          <span className="ky-heat-venue">{s.venue}{s.raceNumber}R</span>
        </div>
        <div className="ky-heat-num" style={{ color: m.varc }}>{circled(s.horseNumber)}</div>
        <div className="ky-heat-pct nums" style={{ color: m.varc }}>{fmtPct(s.changePct)}</div>
        <div className="ky-heat-spark"><Sparkline data={s.spark} color={m.varc} w={64} h={20} strokeW={1.6} /></div>
      </button>
    );
  }

  if (layout === "list") {
    return (
      <button className={cls} onClick={() => onOpen(s.raceId)} style={S({ "--accent": m.varc })}>
        <span className="ky-list-bar" style={{ background: m.varc }} />
        <span className="ky-list-type" style={{ color: m.varc }}>{m.arrow}<span className="ky-list-type-t">{m.label}</span></span>
        <span className="ky-list-race">{s.venue}<b>{s.raceNumber}R</b></span>
        <span className="ky-list-horse">
          <span className="nums ky-list-numchip" style={{ color: m.varc, borderColor: `color-mix(in srgb, ${m.varc} 45%, transparent)` }}>{s.horseNumber}</span>
          {isRev ? <span className="ky-rev">1番人気交代 <b className="nums">{s.newFav}</b><span className="ky-muted"> ← {s.oldFav}</span></span> : <span className="ky-list-name">{s.horseName}</span>}
        </span>
        {!isRev && <span className="ky-list-odds nums"><span className="ky-muted">{fmtOdds(s.prevOdds)}</span><span className="ky-arrowto">→</span>{s.currOdds != null ? <CountUp value={s.currOdds} /> : "—"}</span>}
        {!isRev && <span className="ky-list-spark"><Sparkline data={s.spark} color={m.varc} w={56} h={18} strokeW={1.6} /></span>}
        <span className="ky-list-pct nums" style={{ color: m.varc }}>{fmtPct(s.changePct)}</span>
        <span className={`ky-list-post nums ${ps.soon ? "is-soon" : ""}`}>{ps.txt}</span>
      </button>
    );
  }

  // card
  return (
    <button className={cls} onClick={() => onOpen(s.raceId)} style={S({ "--accent": m.varc })}>
      <span className="ky-row-bar" style={{ background: m.varc }} />
      <div className="ky-card-head">
        <div className="ky-card-head-l">
          <TypeBadge type={s.type} />
          <span className="ky-card-race">{s.venue}<b>{s.raceNumber}R</b></span>
          <GradeChip grade={s.grade} />
        </div>
        <span className={`ky-card-post nums ${ps.soon ? "is-soon" : ""} ${ps.done ? "is-done" : ""}`}>
          {ps.soon && !ps.done && <span className="ky-post-dot" />}{ps.txt}
        </span>
      </div>
      <div className="ky-card-body">
        {isRev ? (
          <div className="ky-card-rev">
            <div className="ky-rev-big">
              <span className="nums ky-numchip-lg" style={{ color: m.varc, borderColor: m.varc }}>{circled(s.newFav || 0)}</span>
              <span className="ky-rev-arrow" style={{ color: m.varc }}>⇄</span>
              <span className="nums ky-numchip-lg is-old">{circled(s.oldFav || 0)}</span>
            </div>
            <div className="ky-rev-label">1番人気が交代<br /><span className="ky-muted">{s.horseName}</span></div>
          </div>
        ) : (
          <>
            <div className="ky-card-horse">
              <span className="nums ky-numchip-lg" style={{ color: m.varc, borderColor: `color-mix(in srgb, ${m.varc} 50%, transparent)` }}>{s.horseNumber}</span>
              <div className="ky-card-horse-meta">
                <div className="ky-card-name">{s.horseName}</div>
                <div className="ky-card-sub nums">{s.popularity ? `${s.popularity}番人気` : ""}{s.jockey ? ` · ${s.jockey}` : ""}</div>
              </div>
            </div>
            <div className="ky-card-num">
              <div className="ky-odds-row nums">
                <span className="ky-odds-prev">{fmtOdds(s.prevOdds)}</span>
                <span className="ky-arrowto" style={{ color: m.varc }}>→</span>
                <span className="ky-odds-curr" style={{ color: m.varc }}>{s.currOdds != null ? <CountUp value={s.currOdds} /> : "—"}<span className="ky-odds-unit">倍</span></span>
              </div>
              <div className="ky-pct-row">
                <Sparkline data={s.spark} color={m.varc} w={84} h={30} />
                <span className="ky-pct nums" style={{ color: m.varc }}>{fmtPct(s.changePct)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </button>
  );
}

// --- Ticker ---
export function Ticker({ signals }: { signals: Sig[] }) {
  const items = signals.slice(0, 14);
  const row = (s: Sig, i: number) => {
    const m = SIGNAL_META[s.type];
    return (
      <span className="ky-tick-item" key={s.id + "-" + i}>
        <span style={{ color: m.varc }} className="ky-tick-arrow">{m.arrow}</span>
        <span className="ky-tick-venue">{s.venue}{s.raceNumber}R</span>
        <span className="nums ky-tick-num" style={{ color: m.varc }}>{s.type === "reversal" ? `${s.newFav}番` : circled(s.horseNumber)}</span>
        {s.type !== "reversal" && <span className="nums ky-tick-pct" style={{ color: m.varc }}>{fmtPct(s.changePct)}</span>}
        <span className="ky-tick-sep">/</span>
      </span>
    );
  };
  if (!items.length) return null;
  return (
    <div className="ky-ticker">
      <div className="ky-ticker-track">
        {items.map(row)}{items.map((s, i) => row(s, i + 100))}
      </div>
    </div>
  );
}

// --- OddsTrendChart (対数・Y反転) ---
export function OddsTrendChart({ race, highlight }: { race: Race; highlight: number[] }) {
  const W = 680, H = 320, padL = 44, padR = 64, padT = 22, padB = 30;
  const N = race.snapTimes.length;
  if (N < 2) return <div className="ky-muted" style={{ padding: 24 }}>推移データがまだありません。</div>;
  const byPop = race.horses.slice().sort((a, b) => a.popularity - b.popularity);
  const hi = new Set(highlight || []);
  const show: RaceHorse[] = [];
  byPop.forEach((h) => { if (hi.has(h.num) && show.length < 6) show.push(h); });
  byPop.forEach((h) => { if (!hi.has(h.num) && show.length < 5) show.push(h); });
  let lo = Infinity, htop = -Infinity;
  show.forEach((h) => h.series.forEach((v) => { if (v > 0) { lo = Math.min(lo, v); htop = Math.max(htop, v); } }));
  if (!isFinite(lo) || !isFinite(htop)) return <div className="ky-muted" style={{ padding: 24 }}>推移データがまだありません。</div>;
  lo = Math.max(1, lo * 0.92); htop = htop * 1.05;
  const lLo = Math.log(lo), lHi = Math.log(htop);
  const xs = (i: number) => padL + (i / (N - 1)) * (W - padL - padR);
  const ys = (v: number) => padT + ((Math.log(Math.max(1, v)) - lLo) / (lHi - lLo)) * (H - padT - padB);
  const palette = ["var(--drop)", "var(--surge)", "var(--reversal)", "var(--brand)", "var(--cta)", "#5EEAD4"];
  const colorFor = (h: RaceHorse, idx: number) => hi.has(h.num) ? (h.num === highlight[0] ? "var(--drop)" : palette[idx % palette.length]) : "var(--line)";

  const ticks: number[] = [];
  [1.5, 2, 3, 5, 8, 13, 20, 35, 60, 100].forEach((v) => { if (v >= lo && v <= htop) ticks.push(v); });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="ky-chart" style={{ display: "block" }}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={padL} y1={ys(v)} x2={W - padR} y2={ys(v)} stroke="var(--line)" strokeWidth="1" strokeDasharray="2 4" opacity="0.5" />
          <text x={padL - 8} y={ys(v) + 4} textAnchor="end" className="ky-chart-axis nums">{v}</text>
        </g>
      ))}
      {[0, Math.floor(N / 2), N - 1].map((i) => (
        <text key={i} x={xs(i)} y={H - padB + 18} textAnchor="middle" className="ky-chart-axis nums">{fmtClock(race.snapTimes[i])}</text>
      ))}
      <text x={padL - 8} y={padT - 8} textAnchor="end" className="ky-chart-axis-lbl">人気</text>
      {show.map((h, idx) => {
        const isHi = hi.has(h.num);
        const c = colorFor(h, idx);
        const pts = h.series.map((v, i) => `${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(" L");
        const lastX = xs(N - 1), lastY = ys(h.series[N - 1]);
        return (
          <g key={h.num} opacity={isHi ? 1 : 0.45}>
            <path d={"M" + pts} fill="none" stroke={c} strokeWidth={isHi ? 3 : 1.6} strokeLinejoin="round" strokeLinecap="round" className="ky-chart-line" pathLength={1} style={{ filter: isHi ? `drop-shadow(0 0 5px ${c})` : "none" }} />
            <circle cx={lastX} cy={lastY} r={isHi ? 4.5 : 3} fill={c} />
            {isHi && <circle cx={lastX} cy={lastY} r="4.5" fill="none" stroke={c} strokeWidth="2" className="ky-spark-ping" />}
            <text x={lastX + 8} y={lastY + 4} className="ky-chart-lbl nums" fill={c}>{h.num} {fmtOdds(h.series[N - 1])}</text>
          </g>
        );
      })}
    </svg>
  );
}
