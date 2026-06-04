import KyApp from "@/components/KyApp";
import { loadBoard } from "@/lib/static";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const { signals } = await loadBoard();
  return <KyApp initialSignals={signals} initialRoute={{ screen: "board" }} nowInit={Date.now()} />;
}
