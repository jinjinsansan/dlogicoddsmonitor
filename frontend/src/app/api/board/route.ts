import { NextResponse } from "next/server";
import { loadBoard } from "@/lib/static";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { signals, updatedAt } = await loadBoard();
  return NextResponse.json(
    { signals, updatedAt },
    { headers: { "Cache-Control": "no-store" } }
  );
}
