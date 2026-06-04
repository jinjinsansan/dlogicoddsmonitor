import { NextResponse } from "next/server";
import { fetchBoard } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const signals = await fetchBoard();
  return NextResponse.json(
    { signals, updatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
