import type { Sig, Race } from "@/components/ui";

// 監視(VPS)が生成する完成JSONの配信元。読み取り経路にDBは無い。
// Vercel側のfetchデータキャッシュ(revalidate)でエッジキャッシュ＝サクサク。
const BASE = (process.env.KYURAKU_STATIC_URL || "https://bot.dlogicai.in/kyuraku").replace(/\/$/, "");
const REVALIDATE = 30; // 秒。監視は数分ごと更新なので30秒で十分新鮮。

export type BoardPayload = { signals: Sig[]; updatedAt: string };

export async function loadBoard(): Promise<BoardPayload> {
  try {
    const r = await fetch(`${BASE}/board.json`, { next: { revalidate: REVALIDATE } });
    if (!r.ok) return { signals: [], updatedAt: new Date().toISOString() };
    const d = await r.json();
    return { signals: (d.signals as Sig[]) || [], updatedAt: d.updatedAt || new Date().toISOString() };
  } catch {
    return { signals: [], updatedAt: new Date().toISOString() };
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
