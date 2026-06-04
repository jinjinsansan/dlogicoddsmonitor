import { NextResponse } from "next/server";
import { loadRace } from "@/lib/static";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const raceId = decodeURIComponent(params.id);
  const race = await loadRace(raceId);
  if (!race) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(race, { headers: { "Cache-Control": "no-store" } });
}
