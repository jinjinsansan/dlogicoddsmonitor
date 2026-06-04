import { fetchBoard } from "@/lib/data";
import BoardClient from "./BoardClient";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const signals = await fetchBoard();
  return (
    <BoardClient initial={signals} initialUpdatedAt={new Date().toISOString()} />
  );
}
