"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import type { BoardSignal } from "@/lib/data";
import { SIGNAL_META, fmtTimeJST } from "@/lib/format";
import SignalRow from "@/components/SignalRow";

type Filter = "all" | "drop" | "surge" | "reversal";

const TABS: { key: Filter; label: string }[] = [
  { key: "drop", label: "急落" },
  { key: "surge", label: "急騰" },
  { key: "reversal", label: "逆転" },
  { key: "all", label: "全部" },
];

export default function BoardClient({
  initial,
  initialUpdatedAt,
}: {
  initial: BoardSignal[];
  initialUpdatedAt: string;
}) {
  const [signals, setSignals] = useState<BoardSignal[]>(initial);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [filter, setFilter] = useState<Filter>("drop");

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/board", { cache: "no-store" });
        const j = await r.json();
        if (alive && j.signals) {
          setSignals(j.signals);
          setUpdatedAt(j.updatedAt);
        }
      } catch {
        /* ignore */
      }
    };
    const id = setInterval(tick, 45000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const shown = useMemo(
    () => (filter === "all" ? signals : signals.filter((s) => s.type === filter)),
    [signals, filter]
  );

  return (
    <div className="max-w-2xl mx-auto px-3 pb-16">
      {/* header */}
      <header className="sticky top-0 z-20 bg-base/95 backdrop-blur pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <Link href="/" className="font-bold text-lg">
            オッズ<span className="text-drop">急落</span>くん
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/about" className="text-xs text-muted hover:text-ink cursor-pointer">
              使い方
            </Link>
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <span className="live-dot inline-block w-2 h-2 rounded-full bg-emerald-400" />
              LIVE
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted mb-2 nums">
          <span className="text-drop">急落 {signals.filter((s) => s.type === "drop").length}</span>
          <span className="text-surge">急騰 {signals.filter((s) => s.type === "surge").length}</span>
          <span className="text-reversal">逆転 {signals.filter((s) => s.type === "reversal").length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {TABS.map((t) => {
            const active = filter === t.key;
            const color =
              t.key !== "all" ? SIGNAL_META[t.key].color : "#3B82F6";
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className="text-sm font-medium px-3 py-1.5 rounded-full cursor-pointer transition-colors"
                style={
                  active
                    ? { backgroundColor: color, color: "#0A0E17" }
                    : { backgroundColor: "#131826", color: "#94A3B8" }
                }
              >
                {t.label}
              </button>
            );
          })}
          <span className="nums ml-auto text-[11px] text-muted">
            更新 {fmtTimeJST(updatedAt)}
          </span>
        </div>
      </header>

      {/* list */}
      <div className="mt-2 space-y-2">
        {shown.length === 0 ? (
          <div className="text-center text-muted py-16 text-sm">
            {filter === "drop"
              ? "今は急落シグナルが出ていないな。"
              : "シグナルがまだ無いな。"}
            <div className="mt-3">
              <button
                onClick={() => setFilter("all")}
                className="text-brand cursor-pointer underline"
              >
                全部を見る
              </button>
            </div>
          </div>
        ) : (
          shown.map((s) => <SignalRow key={`${s.raceId}-${s.horseNumber}-${s.type}`} s={s} />)
        )}
      </div>

      <p className="text-[11px] text-muted/70 mt-8 leading-relaxed">
        ※ オッズの動きを可視化する情報ツールです。的中・利益を保証するものではありません。
        表示にはダミーを含む場合があります。
      </p>
    </div>
  );
}
