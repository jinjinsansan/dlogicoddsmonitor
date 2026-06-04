import type { Sig } from "@/components/ui";

// fetchBoard / fetchRaceDetail が返す BoardSignal 互換の最小形
export type BoardLike = {
  id: number | string;
  raceId: string;
  venue: string;
  raceNumber: number;
  type: "drop" | "surge" | "reversal";
  horseNumber: number;
  currOdds: number | null;
  prevOdds: number | null;
  changePct: number | null;
  notifiedAt: string;
  oldFav?: number | null;
  newFav?: number | null;
};

// BoardSignal(サーバー) → Sig(プロトUI)。
// 未取得フィールド(馬名/騎手/人気/発走時刻/スパーク)は安全に既定値。
export function toSig(b: BoardLike): Sig {
  const ms = b.notifiedAt ? Date.parse(b.notifiedAt) : 0;
  return {
    id: b.id,
    raceId: b.raceId,
    venue: b.venue,
    raceNumber: b.raceNumber,
    type: b.type,
    horseNumber: b.horseNumber,
    currOdds: b.currOdds,
    prevOdds: b.prevOdds,
    changePct: b.changePct,
    notifiedAt: Number.isFinite(ms) ? ms : 0,
    oldFav: b.oldFav ?? null,
    newFav: b.newFav ?? null,
    horseName: `${b.horseNumber}番`,
    grade: "",
    popularity: null,
    jockey: "",
    postTime: null,
    spark: null,
  };
}
