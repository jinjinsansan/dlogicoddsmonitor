import KyApp from "@/components/KyApp";
import { loadBoard } from "@/lib/static";

export const dynamic = "force-dynamic";

export default async function GuidePage() {
  const board = await loadBoard();
  return <KyApp initialBoard={board} initialRoute={{ screen: "guide" }} nowInit={Date.now()} />;
}
