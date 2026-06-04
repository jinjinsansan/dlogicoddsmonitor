"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { Mascot, MascotMark } from "./Mascot";
import {
  SIGNAL_META, fmtOdds, fmtPct, fmtClock, postState, okGrade,
  CountUp, Sparkline, LiveDot, TypeBadge, GradeChip, SignalRow, Ticker, OddsTrendChart, OkScore,
  type Sig, type Race, type RaceCard, type PreviewHorse,
} from "./ui";
import type { BoardPayload } from "@/lib/static";
import { pushSupported, isTracked, trackRace, untrackRace, unsupportedMessage } from "@/lib/push";

const MASCOT_COLOR = "#00E5FF"; // neon drop
const MASCOT_SCALE = 1.28; // big
const S = (o: Record<string, unknown>) => o as React.CSSProperties;

export type Route = { screen: "lp" | "board" | "race" | "guide"; raceId?: string };
type Nav = (r: Route) => void;

const MODE_LABEL: Record<string, { txt: string; live: boolean }> = {
  preview: { txt: "事前情報", live: false },
  live: { txt: "LIVE", live: true },
  finished: { txt: "結果", live: false },
};

// ============ ヘッダ ============
function AppHeader({ now, nav, mode, targetLabel, children }:
  { now: number; nav: Nav; mode?: string; targetLabel?: string; children?: React.ReactNode }) {
  const ml = mode ? MODE_LABEL[mode] : null;
  return (
    <header className="ky-appbar">
      <div className="ky-appbar-in">
        <button className="ky-brand" onClick={() => nav({ screen: "lp" })}>
          <MascotMark size={30} color={MASCOT_COLOR} />
          <span className="ky-wordmark"><span style={{ color: "var(--surge)" }}>急騰</span><span style={{ color: "var(--drop)" }}>急落</span>オッズくん</span>
        </button>
        <div className="ky-appbar-r">
          {ml && targetLabel && (
            <span className={`ky-daytag ${ml.live ? "is-live" : ""}`}>
              {ml.live && <span className="ky-daytag-dot" />}<b>{targetLabel}</b> {ml.txt}
            </span>
          )}
          <button className="ky-link" onClick={() => nav({ screen: "guide" })}>使い方</button>
          <span className="nums ky-clock">{fmtClock(now)}</span>
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

// LINE登録ゲート(必須・スキップ不可)。onRegistered で「中を見る」=登録完了。
// forced=true(直リンクでブロック中)のときは × で閉じてもLPに戻るだけ。
export function LineGate({ open, forced, onClose, onRegistered }:
  { open: boolean; forced?: boolean; onClose: () => void; onRegistered: () => void }) {
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
            <p className="ky-gate-sub">さっそく今の相場を見てみよう。急変ボードはぜんぶ無料で見放題だよ。</p>
            <button className="ky-btn ky-btn-cta ky-gate-go" onClick={onRegistered}>中を見る →</button>
          </div>
        ) : (
          <>
            <div className="ky-gate-mascot"><Mascot size={78} mood="happy" color={MASCOT_COLOR} idle glow={false} /></div>
            <h3 className="ky-gate-title">LINEで友だち追加して<br /><span className="ky-gate-free">無料で見放題</span></h3>
            <p className="ky-gate-sub">急変ボード・オッズくん指数・本命急落のすべてを見るには、LINEの友だち追加が必要です（無料・10秒）。</p>
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
              <li>全レース・全会場の急変ボードが見放題</li>
              <li>オッズくん指数・本命急落もぜんぶ無料</li>
              <li>いつでも解除OK</li>
            </ul>
            <button className="ky-gate-skip" onClick={onClose}>{forced ? "トップに戻る" : "あとで"}</button>
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
export function LandingScreen({ now, board, nav }: { now: number; board: BoardPayload; nav: Nav }) {
  const { signals, mode, races, targetLabel } = board;
  const miniSignals = signals.slice(0, 4);
  // 事前情報用: 注目馬(指数A/B)を数頭ピック
  const miniPicks = useMemo(() => {
    const out: { card: RaceCard; h: PreviewHorse }[] = [];
    for (const card of races) {
      const best = card.picks.find((h) => (h.okScore ?? 0) >= 70);
      if (best) out.push({ card, h: best });
    }
    return out.sort((a, b) => (b.h.okScore ?? 0) - (a.h.okScore ?? 0)).slice(0, 4);
  }, [races]);
  // 「中を見る」系は guarded nav に委ねる(未登録ならKyApp側でゲートが開く)
  const openGate = () => nav({ screen: "board" });
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
          <span className="ky-wordmark"><span style={{ color: "var(--surge)" }}>急騰</span><span style={{ color: "var(--drop)" }}>急落</span>オッズくん</span>
        </div>
        <div className="ky-lp-nav-r">
          <button className="ky-link" onClick={() => nav({ screen: "guide" })}>使い方</button>
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
              <LiveDot label={mode === "preview" ? "本日の注目馬" : "急変ボード"} />
              <span className="ky-muted nums">{targetLabel}</span>
            </div>
            <div className="ky-miniboard-list">
              {miniSignals.length ? (
                miniSignals.map((s, i) => (
                  <SignalRow key={s.id} s={s} layout="list" now={now} onOpen={(id) => nav({ screen: "race", raceId: id })} fresh={i === 0} />
                ))
              ) : miniPicks.length ? (
                miniPicks.map(({ card, h }) => (
                  <button key={card.raceId + h.num} className="ky-mini-pick" onClick={() => nav({ screen: "race", raceId: card.raceId })}>
                    <span className="ky-mini-pick-race">{card.venue}<b>{card.raceNumber}R</b></span>
                    <span className="ky-mini-pick-name">{h.num} {h.name}</span>
                    <OkScore score={h.okScore} size="sm" />
                  </button>
                ))
              ) : (
                <div className="ky-muted" style={{ padding: "10px 4px", fontSize: 13 }}>{targetLabel ? `${targetLabel}の情報は準備中です。` : "JRA開催日に更新されます。"}</div>
              )}
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

function fmtCountdown(ms: number) {
  if (ms <= 0) return "まもなく";
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  if (h >= 1) return `${h}時間${m % 60}分`;
  return `${m}分`;
}

// レース一覧(番組表)カード: 状態バッジ + 注目馬 + 🔔追跡
function RaceCardItem({ card, nav, now }: { card: RaceCard; nav: Nav; now: number }) {
  const [tracked, setTrackedState] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTrackedState(isTracked(card.raceId)); }, [card.raceId]);
  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    if (!pushSupported()) { alert(unsupportedMessage()); return; }
    setBusy(true);
    try {
      if (tracked) { await untrackRace(card.raceId); setTrackedState(false); }
      else { await trackRace(card.raceId); setTrackedState(true); }
    } catch (err) {
      const msg = (err as Error)?.message;
      if (msg === "denied") alert("通知がブロックされています。ブラウザの設定で通知を許可してください。");
      else if (msg === "unsupported") alert(unsupportedMessage());
      else alert("追跡の登録に失敗しました。");
    } finally { setBusy(false); }
  };
  const noMove = !card.honmei && card.drop === 0 && card.surge === 0 && card.reversal === 0;
  return (
    <div className={`ky-prace ${card.honmei ? "is-honmei" : ""}`} role="button" tabIndex={0}
      onClick={() => nav({ screen: "race", raceId: card.raceId })}
      onKeyDown={(e) => { if (e.key === "Enter") nav({ screen: "race", raceId: card.raceId }); }}>
      <div className="ky-prace-h">
        <span className="ky-prace-r">{card.venue}<b>{card.raceNumber}R</b></span>
        <span className="ky-muted nums">{card.postTime}発走</span>
      </div>
      <div className="ky-prace-badges">
        {card.honmei && <span className="ky-honmei">本命</span>}
        {card.drop > 0 && <span className="ky-pb" style={{ color: "var(--drop)" }}>▼{card.drop}</span>}
        {card.surge > 0 && <span className="ky-pb" style={{ color: "var(--surge)" }}>▲{card.surge}</span>}
        {card.reversal > 0 && <span className="ky-pb" style={{ color: "var(--reversal)" }}>⇄{card.reversal}</span>}
        {noMove && <span className="ky-muted" style={{ fontSize: 12 }}>動きなし</span>}
      </div>
      <div className="ky-prace-picks">
        {card.picks.slice(0, 3).map((h) => (
          <div className="ky-prace-pick" key={h.num}>
            <span className="ky-prace-num nums">{h.num}</span>
            <span className="ky-prace-name">{h.name}</span>
            {okGrade(h.okScore) ? <OkScore score={h.okScore} size="sm" /> : <span className="ky-muted" style={{ fontSize: 11 }}>—</span>}
          </div>
        ))}
      </div>
      <button className={`ky-prace-track ${tracked ? "is-on" : ""}`} onClick={toggle} disabled={busy} aria-label="このレースを追跡">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        {tracked ? "追跡中" : "追跡"}
      </button>
    </div>
  );
}

function RaceList({ now, races, nav, mode, targetLabel, liveStartMs }:
  { now: number; races: RaceCard[]; nav: Nav; mode: string; targetLabel: string; liveStartMs: number | null }) {
  const [venue, setVenue] = useState("all");
  const venues = ["all", ...Array.from(new Set(races.map((r) => r.venue).filter(Boolean)))];
  const shown = races.filter((r) => venue === "all" || r.venue === venue);
  const cd = mode === "preview" && liveStartMs ? fmtCountdown(liveStartMs - now) : null;
  return (
    <>
      {mode === "preview" && (
        <div className="ky-preview-banner">
          <Mascot size={52} mood="happy" color={MASCOT_COLOR} idle glow={false} />
          <div className="ky-preview-banner-tx">
            <div className="ky-preview-banner-t"><b>{targetLabel}</b> の事前情報</div>
            <div className="ky-preview-banner-d">{cd ? `あと ${cd} で急変監視スタート` : "まもなく急変監視スタート"}・気になるレースを追跡しておこう！</div>
          </div>
        </div>
      )}
      <div className="ky-filterbar">
        <span className="ky-muted nums" style={{ fontSize: 13 }}>{shown.length} レース</span>
        <div className="ky-venue-wrap">
          <select className="ky-venue nums" value={venue} onChange={(e) => setVenue(e.target.value)}>
            {venues.map((v) => <option key={v} value={v}>{v === "all" ? "全会場" : v}</option>)}
          </select>
        </div>
      </div>
      {shown.length ? (
        <div className="ky-preview-grid">
          {shown.map((card) => <RaceCardItem key={card.raceId} card={card} nav={nav} now={now} />)}
        </div>
      ) : (
        <div className="ky-empty"><Mascot size={104} mood="idle" color={MASCOT_COLOR} /><div className="ky-empty-t">レース情報を準備中です。</div></div>
      )}
      <p className="ky-fineprint">タップでレース詳細・🔔で発走直前の通知を追跡。指数(A/B/C)＝馬の実力評価。※情報ツールであり的中・利益を保証するものではありません。</p>
    </>
  );
}

export function BoardScreen({ now, board, nav, freshId }: { now: number; board: BoardPayload; nav: Nav; freshId: string | number | null }) {
  const { signals, mode, races, targetLabel, liveStartMs } = board;
  const [tab, setTab] = useState<"signal" | "races">("races"); // 既定=レース一覧
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

  // 右下オッズくん: 急落/急騰のシグナルを巡回して吹き出し表示(賑わい演出)
  const [react, setReact] = useState(false);
  const [spot, setSpot] = useState<Sig | null>(null);
  const spotIdx = useRef(0);
  const spotlightPool = useMemo(
    () => signals.filter((s) => s.type === "drop" || s.type === "surge"),
    [signals]
  );
  useEffect(() => {
    if (tab !== "signal" || !spotlightPool.length) { setSpot(null); setReact(false); return; }
    let alive = true;
    let hideT: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (!alive) return;
      const s = spotlightPool[spotIdx.current % spotlightPool.length];
      spotIdx.current += 1;
      setSpot(s);
      setReact(true);
      hideT = setTimeout(() => { if (alive) setReact(false); }, 2800);
    };
    tick();
    const id = setInterval(tick, 5200);
    return () => { alive = false; clearInterval(id); clearTimeout(hideT); };
  }, [spotlightPool, tab]);
  useEffect(() => {
    if (!freshId) return;
    const fs = signals.find((s) => s.id === freshId);
    if (fs) { setSpot(fs); setReact(true); }
  }, [freshId, signals]);

  const onOpen = (id: string) => nav({ screen: "race", raceId: id });

  return (
    <div className="ky-board">
      <AppHeader now={now} nav={nav} mode={mode} targetLabel={targetLabel}>
        {tab === "signal" && mode !== "preview" ? <Ticker signals={signals} /> : null}
      </AppHeader>

      <div className="ky-board-in">
        {/* タブ: レース一覧(左・既定) / 急変(右) */}
        <div className="ky-tabs">
          <button className={`ky-tab ${tab === "races" ? "on" : ""}`} onClick={() => setTab("races")}>
            レース一覧{races.length ? `（${races.length}）` : ""}
          </button>
          <button className={`ky-tab ${tab === "signal" ? "on" : ""}`} onClick={() => setTab("signal")}>
            急変{signals.length ? `（${signals.length}）` : ""}
          </button>
        </div>

        {tab === "races" ? (
          <RaceList now={now} races={races} nav={nav} mode={mode} targetLabel={targetLabel} liveStartMs={liveStartMs} />
        ) : (
          <>
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

            <div className="ky-legend">
              <span className="ky-legend-i"><span className="ky-ok ky-ok-high ky-ok-sm"><span className="ky-ok-val">A</span></span>実力上位</span>
              <span className="ky-legend-i"><span className="ky-ok ky-ok-mid ky-ok-sm"><span className="ky-ok-val">B</span></span>有力</span>
              <span className="ky-legend-i"><span className="ky-ok ky-ok-low ky-ok-sm"><span className="ky-ok-val">C</span></span>標準</span>
              <span className="ky-legend-sep">/</span>
              <span className="ky-legend-i"><span className="ky-honmei">本命</span>急落×A</span>
              <button className="ky-link ky-legend-more" onClick={() => nav({ screen: "guide" })}>くわしい使い方 →</button>
            </div>

            {shown.length === 0 ? (
              <div className="ky-empty">
                <Mascot size={104} mood="idle" color={MASCOT_COLOR} />
                <div className="ky-empty-t">{mode === "preview" ? "急変は監視開始後に出ます。" : (filter === "drop" ? "今は急落シグナルが出ていないな。" : "シグナルがまだ無いな。")}</div>
                <button className="ky-link" onClick={() => setTab("races")}>レース一覧から探す →</button>
              </div>
            ) : (
              <div className="ky-list ky-list-list">
                {shown.map((s) => <SignalRow key={s.id} s={s} layout="list" now={now} onOpen={onOpen} fresh={s.id === freshId} />)}
              </div>
            )}

            <p className="ky-fineprint">指数(A/B/C)=オッズくん指数＝馬の実力評価(A=上位/B=有力/C=標準)。<b style={{ color: "var(--cta)" }}>★本命</b>=急落×A＝資金と実力が一致したサイン。※情報ツールであり的中・利益を保証するものではありません。</p>
          </>
        )}
      </div>

      {tab === "signal" && (
        <div className={`ky-watcher ${react ? "is-react" : ""}`} style={S({ "--ms": MASCOT_SCALE })}>
          {react && spot && (
            <div className="ky-watcher-bubble">
              <b style={{ color: SIGNAL_META[spot.type].varc }}>{SIGNAL_META[spot.type].arrow}{SIGNAL_META[spot.type].label}</b>みっけ！<br />
              <span className="nums">{spot.venue}{spot.raceNumber}R {spot.horseNumber}番</span>
              <span className="nums" style={{ color: SIGNAL_META[spot.type].varc, marginLeft: 6 }}>{fmtPct(spot.changePct)}</span>
            </div>
          )}
          <Mascot size={64 * MASCOT_SCALE} mood={react ? "alert" : "idle"} color={MASCOT_COLOR} glow={false} />
        </div>
      )}
    </div>
  );
}

// ============ レース詳細 ============
export function RaceScreen({ now, raceId, nav }: { now: number; raceId: string; nav: Nav }) {
  const [race, setRace] = useState<Race | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [tracked, setTracked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setState("loading");
    fetch(`/api/race/${encodeURIComponent(raceId)}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d: Race) => { if (alive) { setRace(d); setState("ok"); } })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [raceId]);

  useEffect(() => {
    setTracked(isTracked(raceId));
  }, [raceId]);

  const toggleTrack = async () => {
    if (busy) return;
    if (!pushSupported()) { alert(unsupportedMessage()); return; }
    setBusy(true);
    try {
      if (tracked) { await untrackRace(raceId); setTracked(false); }
      else { await trackRace(raceId); setTracked(true); }
    } catch (e) {
      const msg = (e as Error)?.message;
      if (msg === "denied") alert("通知がブロックされています。ブラウザの設定で通知を許可してください。");
      else if (msg === "unsupported") alert(unsupportedMessage());
      else alert("追跡の登録に失敗しました。少し時間をおいて再度お試しください。");
    } finally {
      setBusy(false);
    }
  };

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
          <button className={`ky-track ${tracked ? "is-on" : ""}`} onClick={toggleTrack} disabled={busy}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {tracked ? "追跡中・直前に通知" : "このレースを追跡"}
          </button>
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
            <span>人気</span><span>馬番</span><span className="ky-td-name">馬名</span><span className="ky-td-jky">騎手</span><span className="ky-td-ok">指数</span><span className="ky-td-odds">オッズ</span><span className="ky-td-spark"></span>
          </div>
          {field.map((h) => {
            const isHi = hiSet.has(h.num);
            return (
              <div className={`ky-tr ${isHi ? "is-hi" : ""}`} key={h.num}>
                <span className="nums ky-td-pop">{h.popularity}</span>
                <span className="nums ky-td-num" style={isHi ? { color: "var(--drop)", borderColor: "var(--drop)" } : {}}>{h.num}</span>
                <span className="ky-td-name">{h.name}</span>
                <span className="ky-td-jky">{h.jockey || "—"}</span>
                <span className="ky-td-ok">{h.okScore != null ? <OkScore score={h.okScore} size="sm" /> : <span className="ky-muted">—</span>}</span>
                <span className="nums ky-td-odds"><CountUp value={h.currOdds} /></span>
                <span className="ky-td-spark"><Sparkline data={h.series.slice(-10)} color={isHi ? "var(--drop)" : "var(--muted)"} w={52} h={18} strokeW={1.5} /></span>
              </div>
            );
          })}
        </div>
        <p className="ky-fineprint" style={{ marginTop: 10 }}>「指数」＝オッズくん指数＝馬の実力評価（<b>A</b>=上位/<b>B</b>=有力/<b>C</b>=標準）。<b style={{ color: "var(--cta)" }}>本命急落</b>＝急落×A＝資金と実力が一致したサイン。的中・利益を保証するものではありません。</p>

        <p className="ky-fineprint">※ オッズの動きを可視化する情報ツールです。的中・利益を保証するものではありません。</p>
      </div>
    </div>
  );
}

// ============ 使い方(オッズくんが解説) ============
function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="ky-guide-row">
      <div className="ky-guide-mini"><Mascot size={56} mood="happy" color={MASCOT_COLOR} idle glow={false} /></div>
      <div className="ky-guide-bubble">{children}</div>
    </div>
  );
}

export function GuideScreen({ now, nav }: { now: number; nav: Nav }) {
  return (
    <div className="ky-guide">
      <AppHeader now={now} nav={nav} />
      <div className="ky-board-in">
        <button className="ky-back" onClick={() => nav({ screen: "lp" })}>← トップに戻る</button>

        <div className="ky-guide-hero">
          <Mascot size={120} mood="idle" color={MASCOT_COLOR} />
          <h1 className="ky-h2" style={{ marginTop: 10, marginBottom: 6 }}>オッズくんの使い方</h1>
          <p className="ky-muted" style={{ fontSize: 14, maxWidth: 520, lineHeight: 1.7 }}>
            こんにちは、オッズくんだよ。<br />ぼくは<b style={{ color: "var(--ink)" }}>JRA全レースのオッズ</b>をずっと見張って、「いま動いた馬」を教えるよ。1分で使い方を説明するね！
          </p>
        </div>

        {/* 急変の3種類 */}
        <section className="ky-guide-sec">
          <h2 className="ky-section-t">① 「急変」＝お金の動き</h2>
          <Bubble>
            オッズが急に動くのは<b style={{ color: "var(--ink)" }}>みんなのお金が動いた</b>サイン。ぼくは3種類を見つけるよ。
          </Bubble>
          <div className="ky-guide-cards">
            <div className="ky-guide-card" style={S({ "--accent": "var(--drop)" })}>
              <div className="ky-guide-card-h"><TypeBadge type="drop" /></div>
              <div className="ky-guide-card-d"><b style={{ color: "var(--drop)" }}>オッズが下がった</b>＝お金が入ってきた＝<b>買われている</b>馬。いちばん注目！</div>
            </div>
            <div className="ky-guide-card" style={S({ "--accent": "var(--surge)" })}>
              <div className="ky-guide-card-h"><TypeBadge type="surge" /></div>
              <div className="ky-guide-card-d"><b style={{ color: "var(--surge)" }}>オッズが上がった</b>＝お金が抜けた＝<b>人気が離れた</b>馬。</div>
            </div>
            <div className="ky-guide-card" style={S({ "--accent": "var(--reversal)" })}>
              <div className="ky-guide-card-h"><TypeBadge type="reversal" /></div>
              <div className="ky-guide-card-d"><b style={{ color: "var(--reversal)" }}>1番人気が入れ替わった</b>瞬間。情勢が動いたサイン。</div>
            </div>
          </div>
        </section>

        {/* 指数 */}
        <section className="ky-guide-sec">
          <h2 className="ky-section-t">② 「指数」＝馬の実力評価</h2>
          <Bubble>
            お金が動いても、<b style={{ color: "var(--ink)" }}>その馬が本当に強いか</b>は別の話。そこでぼくは過去の成績から実力を評価して、<b>A・B・C</b>で出すよ。
          </Bubble>
          <div className="ky-guide-grades">
            <div className="ky-guide-grade"><span className="ky-ok ky-ok-high"><span className="ky-ok-val">A</span></span><span><b>実力上位</b>（一線級・指数80以上）</span></div>
            <div className="ky-guide-grade"><span className="ky-ok ky-ok-mid"><span className="ky-ok-val">B</span></span><span><b>有力</b>（指数70〜79）</span></div>
            <div className="ky-guide-grade"><span className="ky-ok ky-ok-low"><span className="ky-ok-val">C</span></span><span><b>標準</b>（指数70未満）</span></div>
          </div>
        </section>

        {/* 本命急落 */}
        <section className="ky-guide-sec">
          <h2 className="ky-section-t">③ ★本命急落 ＝ いちばん大事</h2>
          <div className="ky-guide-honmei">
            <div className="ky-guide-honmei-eq">
              <span><span className="ky-badge" style={{ color: "var(--drop)", background: "color-mix(in srgb, var(--drop) 15%, transparent)", borderColor: "color-mix(in srgb, var(--drop) 40%, transparent)", padding: "3px 10px" }}>▼急落</span></span>
              <span className="ky-guide-plus">＋</span>
              <span><span className="ky-ok ky-ok-high"><span className="ky-ok-val">A</span></span></span>
              <span className="ky-guide-plus">＝</span>
              <span><span className="ky-honmei">本命</span></span>
            </div>
            <Bubble>
              <b style={{ color: "var(--cta)" }}>お金が入った（急落）×実力もある（A）</b>＝買われるべくして買われている馬。これが「本命急落」、ぼくの<b>イチオシのサイン</b>だよ！ボードでは光って目立つよ。
            </Bubble>
          </div>
        </section>

        {/* 使い方ステップ */}
        <section className="ky-guide-sec">
          <h2 className="ky-section-t">④ 使い方は3ステップ</h2>
          <div className="ky-how-steps" style={{ marginTop: 12 }}>
            {([["ボードを開く", "今日の急変が新しい順に並ぶよ。"], ["★本命や指数Aを探す", "お金と実力が一致した馬に注目。"], ["レース詳細で確認", "オッズの推移グラフと出馬表が見れるよ。"]] as [string, string][]).map(([t, d], i) => (
              <div className="ky-how-step" key={i}>
                <span className="ky-how-num nums">{i + 1}</span>
                <div><div className="ky-how-t">{t}</div><div className="ky-how-d">{d}</div></div>
              </div>
            ))}
          </div>
        </section>

        {/* 通知(追跡) */}
        <section className="ky-guide-sec">
          <h2 className="ky-section-t">⑤ 直前の通知（追跡）の使い方</h2>
          <Bubble>
            気になるレースを<b style={{ color: "var(--ink)" }}>「追跡」</b>しておくと、<b style={{ color: "var(--drop)" }}>発走の約4分前</b>に「<b>直前で最も急落した馬</b>（＝最も買われた馬）」を<b>無料で通知</b>するよ。通知はLINEじゃなく<b>ブラウザ</b>に届くよ（アプリ不要）。
          </Bubble>
          <div className="ky-how-steps" style={{ marginTop: 12 }}>
            {([
              ["レースを開く", "ボードから気になるレースをタップ。"],
              ["🔔 追跡を押す", "「このレースを追跡」→ 通知を「許可」。"],
              ["直前に通知が届く", "発走4分前に最も急落した馬をお知らせ。"],
            ] as [string, string][]).map(([t, d], i) => (
              <div className="ky-how-step" key={i}>
                <span className="ky-how-num nums">{i + 1}</span>
                <div><div className="ky-how-t">{t}</div><div className="ky-how-d">{d}</div></div>
              </div>
            ))}
          </div>
          <div className="ky-guide-card" style={{ marginTop: 14 }}>
            <div className="ky-bento-k" style={{ fontSize: 15, marginBottom: 8 }}>つかうときのポイント</div>
            <ul className="ky-guide-notes">
              <li><b>無料</b>・何レースでも追跡OK。やめたい時はもう一度「追跡中」を押せば解除。</li>
              <li>スマホ・PCの<b>ブラウザ通知</b>（OSの通知）として届きます。アプリ不要。</li>
              <li><b>iPhone(Safari)</b>は、共有メニューから<b>「ホーム画面に追加」</b>→そのアイコンから開くと通知が使えます（Apple側の仕様）。</li>
              <li><b>Android／PCのChrome等</b>はそのまま使えます。</li>
              <li>通知が来ない時は、ブラウザ／端末の通知設定で「許可」になっているか確認してください。</li>
            </ul>
          </div>
          <p className="ky-fineprint" style={{ marginTop: 12 }}>※「最も急落した馬」は資金の動きを示す情報です。的中・利益を保証するものではありません。</p>
        </section>

        <div className="ky-guide-cta">
          <button className="ky-btn ky-btn-cta" onClick={() => nav({ screen: "board" })}>急変ボードを見る →</button>
        </div>

        <p className="ky-disclaimer" style={{ marginTop: 24 }}>
          ※ オッズくんは「オッズの動き」と「実力評価」を見やすくする<b style={{ color: "var(--ink)" }}>情報ツール</b>です。馬券の的中・利益を保証するものではありません。馬券の購入は自己責任でお願いします。
        </p>
      </div>
    </div>
  );
}
