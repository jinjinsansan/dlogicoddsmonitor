import { NextResponse } from "next/server";
import { fetchRaceDetail } from "@/lib/data";
import { toSig } from "@/lib/toSig";
import type { Race, RaceHorse } from "@/components/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const raceId = decodeURIComponent(params.id);
  const detail = await fetchRaceDetail(raceId);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });

  const snaps = detail.trend; // snapshot_at 昇順
  const snapTimes = snaps.map((s) => Date.parse(s.t)).filter((n) => Number.isFinite(n));

  // 最終スナップショットに居る馬を出走馬とみなす
  const last = snaps.length ? snaps[snaps.length - 1].odds : {};
  const nums = Object.keys(last)
    .map((k) => parseInt(k, 10))
    .filter((n) => Number.isFinite(n) && (last[String(n)] ?? 0) > 0)
    .sort((a, b) => a - b);

  const horses: RaceHorse[] = nums.map((num) => {
    const key = String(num);
    // 系列(欠損は直前値で補完)
    let lastKnown = 0;
    const series = snaps.map((s) => {
      const v = Number(s.odds[key]);
      if (Number.isFinite(v) && v > 0) { lastKnown = v; return v; }
      return lastKnown || NaN;
    }).map((v, i, arr) => {
      if (Number.isFinite(v)) return v;
      // 先頭側の欠損は最初の有効値で埋める
      const firstValid = arr.find((x) => Number.isFinite(x));
      return Number.isFinite(firstValid as number) ? (firstValid as number) : 0;
    });
    const currOdds = Number(last[key]) || series[series.length - 1] || 0;
    return { num, name: `${num}番`, jockey: "", popularity: 0, currOdds, series };
  });

  // 人気 = 現オッズ昇順
  horses.slice().sort((a, b) => a.currOdds - b.currOdds).forEach((h, i) => { h.popularity = i + 1; });

  const race: Race = {
    raceId,
    venue: detail.venue,
    raceNumber: detail.raceNumber,
    grade: "",
    raceName: "",
    surface: "",
    distance: 0,
    nHorses: horses.length,
    postTime: null,
    snapTimes,
    horses,
    signals: detail.signals.map(toSig),
  };

  return NextResponse.json(race, { headers: { "Cache-Control": "no-store" } });
}
