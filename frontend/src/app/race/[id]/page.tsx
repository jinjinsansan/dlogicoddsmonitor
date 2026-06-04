import KyApp from "@/components/KyApp";
import { loadBoard } from "@/lib/static";

export const dynamic = "force-dynamic";

export default async function RacePage({ params }: { params: { id: string } }) {
  const raceId = decodeURIComponent(params.id);
  const board = await loadBoard();
  return <KyApp initialBoard={board} initialRoute={{ screen: "race", raceId }} nowInit={Date.now()} />;
}
