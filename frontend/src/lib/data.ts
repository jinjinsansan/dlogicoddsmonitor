import { supabase } from "./supabase";
import type { SignalType } from "./format";

export type BoardSignal = {
  id: number;
  raceId: string;
  venue: string;
  raceNumber: number;
  type: SignalType;
  horseNumber: number;
  currOdds: number | null;
  prevOdds: number | null;
  changePct: number | null;
  notifiedAt: string;
  raceDate: string;
  // reversal 用
  oldFav?: number | null;
  newFav?: number | null;
};

function parseDetail(raw: any): any {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

function toBoardSignal(row: any): BoardSignal {
  const d = parseDetail(row.detail);
  return {
    id: row.id,
    raceId: row.race_id,
    venue: row.venue || "",
    raceNumber: row.race_number || 0,
    type: row.signal_type as SignalType,
    horseNumber: row.horse_number,
    currOdds: d.curr_odds ?? d.new_fav_odds_curr ?? null,
    prevOdds: d.prev_odds ?? d.new_fav_odds_prev ?? null,
    changePct: d.change_pct ?? null,
    notifiedAt: row.notified_at,
    raceDate: row.race_date,
    oldFav: d.old_favorite ?? null,
    newFav: d.new_favorite ?? null,
  };
}

// JRA限定(NARはオッズ変動が激しすぎノイズのため監視・表示対象外)
const JRA_VENUES = [
  "東京", "中山", "阪神", "京都", "中京", "新潟", "福島", "小倉", "札幌", "函館",
];

/** 直近の急変シグナル(JRA限定・重複排除済み)。新しい順。 */
export async function fetchBoard(limit = 120): Promise<BoardSignal[]> {
  const { data, error } = await supabase
    .from("odds_signals")
    .select("id,race_id,venue,race_number,signal_type,horse_number,detail,race_date,notified_at")
    .in("venue", JRA_VENUES)
    .order("notified_at", { ascending: false })
    .limit(500);
  if (error || !data) return [];

  const seen = new Set<string>();
  const out: BoardSignal[] = [];
  for (const row of data) {
    const key = `${row.race_id}:${row.horse_number}:${row.signal_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(toBoardSignal(row));
    if (out.length >= limit) break;
  }
  return out;
}

export type RaceDetail = {
  raceId: string;
  venue: string;
  raceNumber: number;
  signals: BoardSignal[];
  trend: { t: string; odds: Record<string, number> }[]; // snapshot_at毎の全馬オッズ
};

export async function fetchRaceDetail(raceId: string): Promise<RaceDetail | null> {
  const [{ data: sigRows }, { data: snapRows }] = await Promise.all([
    supabase
      .from("odds_signals")
      .select("id,race_id,venue,race_number,signal_type,horse_number,detail,race_date,notified_at")
      .eq("race_id", raceId)
      .order("notified_at", { ascending: false }),
    supabase
      .from("odds_snapshots")
      .select("snapshot_at,odds_data,venue,race_number")
      .eq("race_id", raceId)
      .order("snapshot_at", { ascending: true })
      .limit(300),
  ]);

  const signals = (sigRows || []).map(toBoardSignal);
  let venue = signals[0]?.venue || "";
  let raceNumber = signals[0]?.raceNumber || 0;

  const trend: RaceDetail["trend"] = [];
  for (const s of snapRows || []) {
    venue = venue || s.venue || "";
    raceNumber = raceNumber || s.race_number || 0;
    let od = s.odds_data;
    if (typeof od === "string") {
      try {
        od = JSON.parse(od);
      } catch {
        od = {};
      }
    }
    trend.push({ t: s.snapshot_at, odds: od || {} });
  }

  if (!signals.length && !trend.length) return null;
  return { raceId, venue, raceNumber, signals, trend };
}
