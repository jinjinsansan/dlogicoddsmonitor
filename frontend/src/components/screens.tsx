"use client";
import { useState, useEffect, useMemo } from "react";
import { Mascot, MascotMark } from "./Mascot";
import {
  SIGNAL_META, fmtOdds, fmtPct, fmtClock, postState,
  CountUp, Sparkline, LiveDot, TypeBadge, GradeChip, SignalRow, Ticker, OddsTrendChart,
  type Sig, type Race,
} from "./ui";

const MASCOT_COLOR = "#00E5FF"; // neon drop
const MASCOT_SCALE = 1.28; // big
const S = (o: Record<string, unknown>) => o as React.CSSProperties;

export type Route = { screen: "lp" | "board" | "race"; raceId?: string };
type Nav = (r: Route) => void;

// ============ ヘッダ ============
function AppHeader({ now, nav, children }: { now: number; nav: Nav; children?: React.ReactNode }) {
  return (
    <header className="ky-appbar">
      <div className="ky-appbar-in">
        <button className="ky-brand" onClick={() => nav({ screen: "lp" })}>
          <MascotMark size={30} color={MASCOT_COLOR} />
          <span className="ky-wordmark"><span className="ky-wm-accent">急騰急落</span>オッズくん</span>
        </button>
        <div className="ky-appbar-r">
          <span className="nums ky-clock">{fmtClock(now)}</span>
          <LiveDot />
        </div>
      </div>
      {children}
    </header>
  );
}

// ============ LINE 登録ゲート ============
function makeQR(seed: number, n: number) {
  let a = seed;
  const rnd = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const g = Array.from({ length: n }, () => Array.from({ length: n }, () => rnd() > 0.52));
  const finder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) { const edge = r === 0 || r === 6 || c === 0 || c === 6; const core = r >= 2 && r <= 4 && c >= 2 && c <= 4; g[r0 + r][c0 + c] = edge || core; }
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) { const rr = r0 + r, cc = c0 + c; if (rr >= 0 && rr < n && cc >= 0 && cc < n && (r === -1 || r === 7 || c === -1 || c === 7)) g[rr][cc] = false; }
  };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
  return g;
}

// LINE友だち追加URL(未設定ならデモ用 # )
const LINE_ADD_URL = process.env.NEXT_PUBLIC_LINE_ADD_URL || "";

function LineGate({ open, onClose, onEnter }: { open: boolean; onClose: () => void; onEnter: () => void }) {
  const [done, setDone] = useState(false);
  useEffect(() => { if (!open) setDone(false); }, [open]);
  const N = 21;
  const grid = useMemo(() => makeQR(987654, N), []);
  if (!open) return null;
  const addFriend = () => { if (LINE_ADD_URL) window.open(LINE_ADD_URL, "_blank"); setDone(true); };
  return (
    <div className="ky-gate" role="dialog" aria-modal="true">
      <div className="ky-gate-backdrop" onClick={onClose} />
      <div className="ky-gate-card">
        <button className="ky-gate-x" onClick={onClose} aria-label="閉じる">×</button>
        {done ? (
          <div className="ky-gate-done">
            <Mascot size={96} mood="happy" color={MASCOT_COLOR} idle glow />
            <h3 className="ky-gate-title">友だち追加、ありがとう！</h3>
            <p className="ky-gate-sub">急変を見つけたら、オッズくんがLINEでお知らせします。さっそく今の相場を見てみましょう。</p>
            <button className="ky-btn ky-btn-cta ky-gate-go" onClick={onEnter}>ボードを見る →</button>
          </div>
        ) : (
          <>
            <div className="ky-gate-mascot"><Mascot size={78} mood="happy" color={MASCOT_COLOR} idle glow={false} /></div>
            <h3 className="ky-gate-title">LINEで友だち追加して<br /><span className="ky-gate-free">無料で見放題</span></h3>
            <p className="ky-gate-sub">全レースのオッズ急変を、LINEですぐ受け取れます。登録は10秒・もちろん無料。</p>
            <button className="ky-line-btn" onClick={addFriend}>
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3C6.9 3 2.75 6.35 2.75 10.5c0 3.72 3.3 6.84 7.78 7.43.3.06.71.2.81.45.09.23.06.59.03.82l-.13.79c-.04.23-.18.91.8.5 .98-.42 5.3-3.12 7.23-5.34 1.33-1.46 1.97-2.95 1.97-4.65C21.25 6.35 17.1 3 12 3Z" /><rect x="6.4" y="9" width="1.5" height="4" rx=".5" fill="#06C755" /><rect x="15.6" y="9" width="1.5" height="4" rx=".5" fill="#06C755" /></svg>
              LINEで友だち追加（無料）
            </button>
            <div className="ky-gate-or"><span>または スマホで読み取り</span></div>
            <div className="ky-gate-qr">
              <div className="ky-qr" style={{ gridTemplateColumns: `repeat(${N},1fr)` }}>
                {grid.flatMap((row, r) => row.map((on, c) => <i key={r + "-" + c} className={on ? "on" : ""} />))}
              </div>
              <div className="ky-qr-cap">友だち追加用<br />QRコード</div>
            </div>
            <ul className="ky-gate-benefits">
              <li>急落を見つけたら、すぐLINEに通知</li>
              <li>全レース・全会場がずっと無料</li>
              <li>いつでもブロックで解除OK</li>
            </ul>
            <button className="ky-gate-skip" onClick={onEnter}>デモ：登録せずに中を見る</button>
            <p className="ky-gate-fine">情報提供サービスであり、的中・利益を保証するものではありません。</p>
          </>
        )}
      </div>
    </div>
  );
}

function activeVenues(signals: Sig[]) {
  const seen: string[] = [];
  for (const s of signals) if (s.venue && !seen.includes(s.venue)) seen.push(s.venue);
  return seen;
}

// ============ LP ============
export function LandingScreen({ now, signals, nav }: { now: number; signals: Sig[]; nav: Nav }) {
  const preview = signals.slice(0, 4);
  const [gate, setGate] = useState(false);
  const openGate = () => setGate(true);
  const enterBoard = () => { setGate(false); nav({ screen: "board" }); };
  const counts = useMemo(() => ({
    drop: signals.filter((s) => s.type === "drop").length,
    surge: signals.filter((s) => s.type === "surge").length,
    reversal: signals.filter((s) => s.type === "reversal").length,
  }), [signals]);
  const venues = useMemo(() => activeVenues(signals), [signals]);

  const props = [
    { k: "リアルタイム", d: "発走直前まで最短5分間隔で全レースを監視。", arrow: "▼", c: "var(--drop)" },
    { k: "全レース網羅", d: "人が見きれない全場のオッズを自動で追う。", arrow: "◎", c: "var(--brand)" },
    { k: "賢い金の動き", d: "急落＝いま買われている馬がひと目で分かる。", arrow: "⚡", c: "var(--cta)" },
  ];

  return (
    <div className="ky-lp">
      <nav className="ky-lp-nav">
        <div className="ky-brand">
          <MascotMark size={32} color={MASCOT_COLOR} />
          <span className="ky-wordmark"><span className="ky-wm-accent">急騰急落</span>オッズくん</span>
        </div>
        <div className="ky-lp-nav-r">
          <button className="ky-link" onClick={openGate}>ボード</button>
          <span className="ky-beta">β版 · 無料</span>
        </div>
      </nav>

      <section className="ky-hero">
        <div className="ky-hero-copy">
          <div className="ky-hero-live">
            <LiveDot label="LIVE" />
            <span className="ky-hero-live-venues">{(venues.length ? venues : ["東京", "中山", "阪神"]).slice(0, 5).join(" · ")} 監視中</span>
          </div>
          <h1 className="ky-hero-h1">オッズは、<br /><span className="ky-grad">嘘をつかない。</span></h1>
          <p className="ky-hero-sub">
            JRA全レースのオッズをリアルタイム監視。<br />
            直前で<b>急落・急騰した馬＝賢い金の動き</b>を、オッズくんが見つけます。
          </p>
          <div className="ky-hero-cta">
            <button className="ky-btn ky-btn-cta" onClick={openGate}>無料で今すぐ見る</button>
            <span className="ky-cta-note"><b className="ky-note-line">LINE登録</b>で全レース無料・10秒</span>
          </div>
          <div className="ky-hero-stats">
            <span><b className="nums" style={{ color: "var(--drop)" }}>{counts.drop}</b> 急落</span>
            <span><b className="nums" style={{ color: "var(--surge)" }}>{counts.surge}</b> 急騰</span>
            <span><b className="nums" style={{ color: "var(--reversal)" }}>{counts.reversal}</b> 逆転</span>
          </div>
        </div>

        <div className="ky-hero-stage">
          <div className="ky-hero-mascot" style={S({ "--ms": MASCOT_SCALE })}>
            <Mascot size={150 * MASCOT_SCALE} mood="idle" color={MASCOT_COLOR} />
            <div className="ky-speech">急変、見つけたよ！</div>
          </div>
          <div className="ky-glass ky-miniboard">
            <div className="ky-miniboard-h">
              <LiveDot label="急変ボード" />
              <span className="ky-muted nums">更新 {fmtClock(now)}</span>
            </div>
            <div className="ky-miniboard-list">
              {preview.length ? preview.map((s, i) => (
                <SignalRow key={s.id} s={s} layout="list" now={now} onOpen={(id) => nav({ screen: "race", raceId: id })} fresh={i === 0} />
              )) : <div className="ky-muted" style={{ padding: "10px 4px", fontSize: 13 }}>現在シグナルはありません（JRA開催日に更新）。</div>}
            </div>
          </div>
        </div>
      </section>

      <Ticker signals={signals} />

      <section className="ky-bento">
        {props.map((p) => (
          <div className="ky-bento-card" key={p.k}>
            <span className="ky-bento-icon" style={{ color: p.c, background: `color-mix(in srgb, ${p.c} 14%, transparent)` }}>{p.arrow}</span>
            <div className="ky-bento-k">{p.k}</div>
            <div className="ky-bento-d">{p.d}</div>
          </div>
        ))}
      </section>

      <section className="ky-how">
        <h2 className="ky-h2">使い方は3ステップ</h2>
        <div className="ky-how-steps">
          {([["ボードを開く", "今日の全急変が一覧に。"], ["動いた馬を見る", "急落＝買われている馬。"], ["推移を確認", "レース詳細でオッズの軌跡を。"]] as [string, string][]).map(([t, d], i) => (
            <div className="ky-how-step" key={i}>
              <span className="ky-how-num nums">{i + 1}</span>
              <div><div className="ky-how-t">{t}</div><div className="ky-how-d">{d}</div></div>
            </div>
          ))}
        </div>
      </section>

      <section className="ky-closer">
        <div className="ky-closer-mascot"><Mascot size={92} mood="happy" color={MASCOT_COLOR} idle /></div>
        <h2 className="ky-h2">まずは、動きを見てみて。</h2>
        <p className="ky-disclaimer">本サービスは「オッズの動き」を可視化する情報ツールです。的中・利益を保証するものではありません。馬券の購入は自己責任でお願いします。</p>
        <button className="ky-btn ky-btn-cta" onClick={openGate}>LINEで無料登録して見る</button>
      </section>

      <footer className="ky-footer">急騰急落オッズくん β — JRAオッズ急変の可視化</footer>

      <LineGate open={gate} onClose={() => setGate(false)} onEnter={enterBoard} />
    </div>
  );
}

// ============ 急変ボード ============
const TABS = [
  { key: "drop", label: "急落", arrow: "▼" },
  { key: "surge", label: "急騰", arrow: "▲" },
  { key: "reversal", label: "逆転", arrow: "⇄" },
  { key: "all", label: "全部", arrow: "◎" },
] as const;

export function BoardScreen({ now, signals, nav, freshId }: { now: number; signals: Sig[]; nav: Nav; freshId: string | number | null }) {
  const [filter, setFilter] = useState<string>("drop");
  const [venue, setVenue] = useState("all");
  const venues = ["all", ...useMemo(() => activeVenues(signals), [signals])];

  const counts = useMemo(() => ({
    drop: signals.filter((s) => s.type === "drop").length,
    surge: signals.filter((s) => s.type === "surge").length,
    reversal: signals.filter((s) => s.type === "reversal").length,
  }), [signals]);

  const shown = useMemo(() => signals.filter((s) =>
    (filter === "all" || s.type === filter) && (venue === "all" || s.venue === venue)
  ), [signals, filter, venue]);

  const [react, setReact] = useState(false);
  useEffect(() => {
    if (!freshId) return;
    setReact(true);
    const t = setTimeout(() => setReact(false), 2600);
    return () => clearTimeout(t);
  }, [freshId]);
  const freshSignal = signals.find((s) => s.id === freshId);

  const onOpen = (id: string) => nav({ screen: "race", raceId: id });

  return (
    <div className="ky-board">
      <AppHeader now={now} nav={nav}><Ticker signals={signals} /></AppHeader>

      <div className="ky-board-in">
        <div className="ky-board-meta">
          <div className="ky-counts">
            <button className={`ky-count ${filter === "drop" ? "on" : ""}`} style={S({ "--c": "var(--drop)" })} onClick={() => setFilter("drop")}><b className="nums">{counts.drop}</b>急落</button>
            <button className={`ky-count ${filter === "surge" ? "on" : ""}`} style={S({ "--c": "var(--surge)" })} onClick={() => setFilter("surge")}><b className="nums">{counts.surge}</b>急騰</button>
            <button className={`ky-count ${filter === "reversal" ? "on" : ""}`} style={S({ "--c": "var(--reversal)" })} onClick={() => setFilter("reversal")}><b className="nums">{counts.reversal}</b>逆転</button>
          </div>
          <span className="ky-muted nums ky-updated">更新 {fmtClock(now)}</span>
        </div>

        <div className="ky-filterbar">
          <div className="ky-chips">
            {TABS.map((t) => {
              const active = filter === t.key;
              const c = t.key === "all" ? "var(--brand)" : SIGNAL_META[t.key as "drop"].varc;
              return (
                <button key={t.key} className={`ky-chip ${active ? "on" : ""}`} onClick={() => setFilter(t.key)}
                  style={active ? { background: c, color: "var(--chip-ink)", borderColor: c } : S({ "--c": c })}>
                  <span className="ky-chip-arrow">{t.arrow}</span>{t.label}
                </button>
              );
            })}
          </div>
          <div className="ky-venue-wrap">
            <select className="ky-venue nums" value={venue} onChange={(e) => setVenue(e.target.value)}>
              {venues.map((v) => <option key={v} value={v}>{v === "all" ? "全会場" : v}</option>)}
            </select>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="ky-empty">
            <Mascot size={104} mood="idle" color={MASCOT_COLOR} />
            <div className="ky-empty-t">{filter === "drop" ? "今は急落シグナルが出ていないな。" : "シグナルがまだ無いな。"}</div>
            <button className="ky-link" onClick={() => { setFilter("all"); setVenue("all"); }}>全部を見る</button>
          </div>
        ) : (
          <div className="ky-list ky-list-list">
            {shown.map((s) => <SignalRow key={s.id} s={s} layout="list" now={now} onOpen={onOpen} fresh={s.id === freshId} />)}
          </div>
        )}

        <p className="ky-fineprint">※ オッズの動きを可視化する情報ツールです。的中・利益を保証するものではありません。</p>
      </div>

      <div className={`ky-watcher ${react ? "is-react" : ""}`} style={S({ "--ms": MASCOT_SCALE })}>
        {react && freshSignal && (
          <div className="ky-watcher-bubble">
            <b style={{ color: SIGNAL_META[freshSignal.type].varc }}>{SIGNAL_META[freshSignal.type].label}</b>キャッチ！<br />
            <span className="nums">{freshSignal.venue}{freshSignal.raceNumber}R</span>
          </div>
        )}
        <Mascot size={64 * MASCOT_SCALE} mood={react ? "alert" : "idle"} color={MASCOT_COLOR} glow={false} />
      </div>
    </div>
  );
}

// ============ レース詳細 ============
export function RaceScreen({ now, raceId, nav }: { now: number; raceId: string; nav: Nav }) {
  const [race, setRace] = useState<Race | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let alive = true;
    setState("loading");
    fetch(`/api/race/${encodeURIComponent(raceId)}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d: Race) => { if (alive) { setRace(d); setState("ok"); } })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [raceId]);

  if (state !== "ok" || !race) {
    return (
      <div className="ky-race">
        <AppHeader now={now} nav={nav} />
        <div className="ky-board-in" style={{ paddingTop: 40 }}>
          <button className="ky-back" onClick={() => nav({ screen: "board" })}>← ボードに戻る</button>
          <div className="ky-empty">
            <Mascot size={96} mood="idle" color={MASCOT_COLOR} />
            <div className="ky-empty-t">{state === "loading" ? "読み込み中…" : "レースが見つかりません。"}</div>
          </div>
        </div>
      </div>
    );
  }

  const raceSignals = race.signals;
  const highlight = Array.from(new Set(raceSignals.map((s) => s.type === "reversal" ? (s.newFav || 0) : s.horseNumber)));
  const ps = postState(race.postTime, now);
  const field = race.horses.slice().sort((a, b) => a.popularity - b.popularity);
  const hiSet = new Set(highlight);

  return (
    <div className="ky-race">
      <AppHeader now={now} nav={nav} />
      <div className="ky-board-in">
        <button className="ky-back" onClick={() => nav({ screen: "board" })}>← ボードに戻る</button>

        <div className="ky-race-head">
          <div className="ky-race-title">
            <span className="ky-race-venue nums">{race.venue}{race.raceNumber}R</span>
            <GradeChip grade={race.grade} />
            {ps.txt && <span className={`ky-card-post nums ${ps.soon ? "is-soon" : ""} ${ps.done ? "is-done" : ""}`}>{ps.soon && !ps.done && <span className="ky-post-dot" />}{ps.txt}</span>}
          </div>
          {(race.raceName || race.distance) ? (
            <div className="ky-race-meta nums">{[race.raceName, race.surface && race.distance ? `${race.surface}${race.distance}m` : "", race.nHorses ? `${race.nHorses}頭` : ""].filter(Boolean).join(" · ")}</div>
          ) : null}
        </div>

        <div className="ky-glass ky-chart-card">
          <div className="ky-chart-head">
            <span className="ky-section-t">オッズ推移</span>
            <span className="ky-muted ky-chart-note">上＝人気（低オッズ） / 太線＝急変馬</span>
          </div>
          <OddsTrendChart race={race} highlight={highlight} />
        </div>

        <h2 className="ky-section-t ky-mt">このレースの急変</h2>
        <div className="ky-race-sigs">
          {raceSignals.length ? raceSignals.map((s) => {
            const m = SIGNAL_META[s.type];
            return (
              <div className="ky-race-sig" key={s.id} style={S({ "--accent": m.varc })}>
                <span className="ky-list-bar" style={{ background: m.varc }} />
                <TypeBadge type={s.type} size="sm" />
                <span className="ky-rsig-main">
                  {s.type === "reversal"
                    ? <span>1番人気交代 <b className="nums">{s.newFav}番</b><span className="ky-muted"> ← {s.oldFav}番</span></span>
                    : <span><b className="nums">{s.horseNumber}番</b> {s.horseName}</span>}
                </span>
                {s.type !== "reversal" && <span className="nums ky-rsig-odds"><span className="ky-muted">{fmtOdds(s.prevOdds)}→{fmtOdds(s.currOdds)}</span><b style={{ color: m.varc, marginLeft: 8 }}>{fmtPct(s.changePct)}</b></span>}
                <span className="ky-muted nums ky-rsig-time">{fmtClock(s.notifiedAt)}</span>
              </div>
            );
          }) : <div className="ky-muted">急変シグナルはありません。</div>}
        </div>

        <h2 className="ky-section-t ky-mt">出馬表</h2>
        <div className="ky-table">
          <div className="ky-tr ky-th nums">
            <span>人気</span><span>馬番</span><span className="ky-td-name">馬名</span><span>騎手</span><span className="ky-td-odds">オッズ</span><span></span>
          </div>
          {field.map((h) => {
            const isHi = hiSet.has(h.num);
            return (
              <div className={`ky-tr ${isHi ? "is-hi" : ""}`} key={h.num}>
                <span className="nums ky-td-pop">{h.popularity}</span>
                <span className="nums ky-td-num" style={isHi ? { color: "var(--drop)", borderColor: "var(--drop)" } : {}}>{h.num}</span>
                <span className="ky-td-name">{h.name}</span>
                <span className="ky-td-jky">{h.jockey || "—"}</span>
                <span className="nums ky-td-odds"><CountUp value={h.currOdds} /></span>
                <span className="ky-td-spark"><Sparkline data={h.series.slice(-10)} color={isHi ? "var(--drop)" : "var(--muted)"} w={52} h={18} strokeW={1.5} /></span>
              </div>
            );
          })}
        </div>

        <p className="ky-fineprint">※ オッズの動きを可視化する情報ツールです。的中・利益を保証するものではありません。</p>
      </div>
    </div>
  );
}
