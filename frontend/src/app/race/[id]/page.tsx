import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchRaceDetail } from "@/lib/data";
import { SIGNAL_META, fmtOdds, fmtPct, fmtTimeJST } from "@/lib/format";
import OddsChart from "./OddsChart";

export const dynamic = "force-dynamic";

export default async function RacePage({
  params,
}: {
  params: { id: string };
}) {
  const raceId = decodeURIComponent(params.id);
  const detail = await fetchRaceDetail(raceId);
  if (!detail) notFound();

  const horses = Array.from(
    new Set(
      detail.signals
        .map((s) => (s.type === "reversal" ? s.newFav ?? s.horseNumber : s.horseNumber))
        .filter((n): n is number => typeof n === "number")
    )
  );

  return (
    <main className="max-w-2xl mx-auto px-4 pb-16">
      <header className="py-4">
        <Link href="/board" className="text-sm text-muted cursor-pointer hover:text-ink">
          ← ボードに戻る
        </Link>
        <h1 className="text-xl font-bold mt-2">
          {detail.venue}
          {detail.raceNumber}R
        </h1>
      </header>

      <section className="bg-surface rounded-xl border border-line p-3">
        <div className="text-sm font-semibold mb-2 text-muted">オッズ推移</div>
        <OddsChart trend={detail.trend} horses={horses} />
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-muted mb-2">このレースの急変</h2>
        <div className="space-y-2">
          {detail.signals.length ? (
            detail.signals.map((s) => {
              const meta = SIGNAL_META[s.type];
              return (
                <div
                  key={s.id}
                  className="border-l-4 bg-surface rounded-r-lg px-4 py-3 flex items-center justify-between gap-3"
                  style={{ borderColor: meta.color }}
                >
                  <span className="text-sm">
                    <span style={{ color: meta.color }} className="font-bold">
                      {meta.arrow} {meta.short}
                    </span>{" "}
                    {s.type === "reversal" ? (
                      <>
                        {s.newFav ?? s.horseNumber}番
                        {s.oldFav != null && (
                          <span className="text-muted"> ← {s.oldFav}番</span>
                        )}
                      </>
                    ) : (
                      <span className="nums">{s.horseNumber}番</span>
                    )}
                  </span>
                  <span className="nums text-sm">
                    {s.type !== "reversal" && (
                      <span className="text-muted mr-2">
                        {fmtOdds(s.prevOdds)}→{fmtOdds(s.currOdds)}
                      </span>
                    )}
                    {s.changePct != null && (
                      <span style={{ color: meta.color }} className="font-bold">
                        {fmtPct(s.changePct)}
                      </span>
                    )}
                    <span className="text-muted ml-2 text-[11px]">
                      {fmtTimeJST(s.notifiedAt)}
                    </span>
                  </span>
                </div>
              );
            })
          ) : (
            <div className="text-muted text-sm">急変シグナルはありません。</div>
          )}
        </div>
      </section>

      <p className="text-[11px] text-muted/70 mt-8">
        ※ オッズの動きを可視化する情報ツールです。的中・利益を保証するものではありません。
      </p>
    </main>
  );
}
