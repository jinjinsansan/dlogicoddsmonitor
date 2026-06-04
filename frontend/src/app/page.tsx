import KyApp from "@/components/KyApp";
import { loadBoard } from "@/lib/static";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { signals } = await loadBoard();
  return <KyApp initialSignals={signals} initialRoute={{ screen: "lp" }} nowInit={Date.now()} />;
}
