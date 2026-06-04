import KyApp from "@/components/KyApp";
import { fetchBoard } from "@/lib/data";
import { toSig } from "@/lib/toSig";

export const dynamic = "force-dynamic";

export default async function Page() {
  const board = await fetchBoard();
  const signals = board.map(toSig);
  return <KyApp initialSignals={signals} initialRoute={{ screen: "lp" }} nowInit={Date.now()} />;
}
