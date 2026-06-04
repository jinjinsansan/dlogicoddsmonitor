import KyApp from "@/components/KyApp";
import { loadBoard } from "@/lib/static";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const board = await loadBoard();
  return <KyApp initialBoard={board} initialRoute={{ screen: "board" }} nowInit={Date.now()} />;
}
