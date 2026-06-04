import { NextResponse } from "next/server";
import { loadBoard } from "@/lib/static";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const board = await loadBoard();
  return NextResponse.json(board, { headers: { "Cache-Control": "no-store" } });
}
