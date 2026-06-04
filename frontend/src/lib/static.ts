import type { Sig, Race, PreviewCard } from "@/components/ui";

// 監視(VPS)が生成する完成JSONの配信元。読み取り経路にDBは無い。
// Vercel側のfetchデータキャッシュ(revalidate)でエッジキャッシュ＝サクサク。
const BASE = (process.env.KYURAKU_STATIC_URL || "https://bot.dlogicai.in/kyuraku").replace(/\/$/, "");
const REVALIDATE = 30;

export type Mode = "preview" | "live" | "finished";
export type BoardPayload = {
  mode: Mode;
  targetDate: string;   // YYYYMMDD
  targetLabel: string;  // 例 6/7(日)
  liveStartMs: number | null;
  signals: Sig[];
  preview: PreviewCard[];
  updatedAt: string;
};

const EMPTY: BoardPayload = {
  mode: "finished", targetDate: "", targetLabel: "", liveStartMs: null,
  signals: [], preview: [], updatedAt: new Date().toISOString(),
};

export async function loadBoard(): Promise<BoardPayload> {
  try {
    const r = await fetch(`${BASE}/board.json`, { next: { revalidate: REVALIDATE } });
    if (!r.ok) return EMPTY;
    const d = await r.json();
    return {
      mode: (d.mode as Mode) || "finished",
      targetDate: d.targetDate || "",
      targetLabel: d.targetLabel || "",
      liveStartMs: d.liveStartMs ?? null,
      signals: (d.signals as Sig[]) || [],
      preview: (d.preview as PreviewCard[]) || [],
      updatedAt: d.updatedAt || new Date().toISOString(),
    };
  } catch {
    return EMPTY;
  }
}

export async function loadRace(raceId: string): Promise<Race | null> {
  try {
    const r = await fetch(`${BASE}/race/${encodeURIComponent(raceId)}.json`, { next: { revalidate: REVALIDATE } });
    if (!r.ok) return null;
    return (await r.json()) as Race;
  } catch {
    return null;
  }
}
