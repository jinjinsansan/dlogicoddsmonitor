import KyApp from "@/components/KyApp";
import { fetchBoard } from "@/lib/data";
import { toSig } from "@/lib/toSig";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const board = await fetchBoard();
  const signals = board.map(toSig);
  return <KyApp initialSignals={signals} initialRoute={{ screen: "board" }} nowInit={Date.now()} />;
}
