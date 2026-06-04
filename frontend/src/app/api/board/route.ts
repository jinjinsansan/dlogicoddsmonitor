import { NextResponse } from "next/server";
import { fetchBoard } from "@/lib/data";
import { toSig } from "@/lib/toSig";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const board = await fetchBoard();
  const signals = board.map(toSig);
  return NextResponse.json(
    { signals, updatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
