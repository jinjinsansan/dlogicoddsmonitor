import KyApp from "@/components/KyApp";
import { fetchBoard } from "@/lib/data";
import { toSig } from "@/lib/toSig";

export const dynamic = "force-dynamic";

export default async function RacePage({ params }: { params: { id: string } }) {
  const raceId = decodeURIComponent(params.id);
  const board = await fetchBoard();
  const signals = board.map(toSig);
  return <KyApp initialSignals={signals} initialRoute={{ screen: "race", raceId }} nowInit={Date.now()} />;
}
