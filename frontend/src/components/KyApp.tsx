"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { LandingScreen, BoardScreen, RaceScreen, GuideScreen, type Route } from "./screens";
import type { BoardPayload } from "@/lib/static";

export default function KyApp({ initialBoard, initialRoute, nowInit }:
  { initialBoard: BoardPayload; initialRoute: Route; nowInit: number }) {
  const [route, setRoute] = useState<Route>(initialRoute);
  const [now, setNow] = useState(nowInit);
  const [board, setBoard] = useState<BoardPayload>(initialBoard);
  const [freshId, setFreshId] = useState<string | number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const topIdRef = useRef<string | number | null>(initialBoard.signals[0]?.id ?? null);

  // ライブ時計(1秒)
  useEffect(() => {
    const id = setInterval(() => setNow((n) => n + 1000), 1000);
    return () => clearInterval(id);
  }, []);

  // ボードのライブ更新(45秒ポーリング)
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/board", { cache: "no-store" });
        if (!r.ok) return;
        const d: BoardPayload = await r.json();
        if (!alive) return;
        setBoard(d);
        if (d.signals[0] && d.signals[0].id !== topIdRef.current) {
          topIdRef.current = d.signals[0].id;
          setFreshId(d.signals[0].id);
        }
      } catch { /* ネットワーク失敗は無視 */ }
    };
    const id = setInterval(poll, 45000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const nav = useCallback((r: Route) => {
    setRoute(r);
    const sc = rootRef.current?.querySelector(".ky-scroll");
    if (sc) sc.scrollTop = 0;
    try {
      const u = r.screen === "board" ? "/board"
        : r.screen === "guide" ? "/guide"
          : r.screen === "race" && r.raceId ? `/race/${encodeURIComponent(r.raceId)}`
            : "/";
      window.history.pushState({}, "", u);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    const onPop = () => {
      const p = location.pathname;
      if (p.startsWith("/race/")) setRoute({ screen: "race", raceId: decodeURIComponent(p.slice("/race/".length)) });
      else if (p.startsWith("/board")) setRoute({ screen: "board" });
      else if (p.startsWith("/guide")) setRoute({ screen: "guide" });
      else setRoute({ screen: "lp" });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  let screen: React.ReactNode;
  if (route.screen === "board") screen = <BoardScreen now={now} board={board} nav={nav} freshId={freshId} />;
  else if (route.screen === "race" && route.raceId) screen = <RaceScreen now={now} raceId={route.raceId} nav={nav} />;
  else if (route.screen === "guide") screen = <GuideScreen now={now} nav={nav} />;
  else screen = <LandingScreen now={now} board={board} nav={nav} />;

  return (
    <div ref={rootRef} className="ky-app" data-anim="full" data-density="compact">
      <div className="ky-scroll">{screen}</div>
    </div>
  );
}
