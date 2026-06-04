import Link from "next/link";
import { fetchBoard } from "@/lib/data";
import SignalRow from "@/components/SignalRow";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const preview = (await fetchBoard(5)).slice(0, 5);

  return (
    <main className="max-w-3xl mx-auto px-4">
      {/* nav */}
      <nav className="flex items-center justify-between py-4">
        <span className="font-bold text-lg">
          オッズ<span className="text-drop">急落</span>くん
        </span>
        <div className="flex items-center gap-3">
          <Link href="/about" className="text-sm text-muted hover:text-ink cursor-pointer">
            使い方
          </Link>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface text-muted border border-line">
            β版・無料
          </span>
        </div>
      </nav>

      {/* hero */}
      <section className="pt-6 pb-10">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold leading-tight">
              オッズは、
              <br />
              <span className="text-drop">嘘をつかない。</span>
            </h1>
            <p className="mt-4 text-muted leading-relaxed">
              JRA全レースのオッズをリアルタイム監視。
              <br />
              直前で<strong className="text-ink">急落した馬=賢い金が入った馬</strong>を、
              ひと目で。
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Link
                href="/board"
                className="bg-cta text-base font-bold px-6 py-3 rounded-lg cursor-pointer hover:brightness-110 transition"
              >
                無料で今すぐ見る
              </Link>
              <span className="text-xs text-muted">登録不要</span>
            </div>
          </div>

          {/* live mini board */}
          <div className="bg-surface/60 rounded-xl border border-line p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted mb-2 px-1">
              <span className="live-dot inline-block w-2 h-2 rounded-full bg-emerald-400" />
              LIVE 急変ボード
            </div>
            <div className="space-y-2">
              {preview.length ? (
                preview.map((s) => (
                  <SignalRow key={`${s.raceId}-${s.horseNumber}-${s.type}`} s={s} />
                ))
              ) : (
                <div className="text-center text-muted text-sm py-8">
                  今は監視待機中。レース当日に動きが流れます。
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* value props */}
      <section className="grid sm:grid-cols-3 gap-4 py-8">
        {[
          { t: "リアルタイム", d: "発走直前まで最短5分間隔で監視" },
          { t: "全レース", d: "人が見きれない全レースを自動で" },
          { t: "賢い金の動き", d: "急落=今買われている馬が一目で" },
        ].map((c) => (
          <div key={c.t} className="bg-surface rounded-xl border border-line p-4">
            <div className="font-bold text-drop">{c.t}</div>
            <div className="text-sm text-muted mt-1">{c.d}</div>
          </div>
        ))}
      </section>

      {/* how */}
      <section className="py-8">
        <h2 className="font-bold text-lg mb-4">使い方</h2>
        <ol className="space-y-2 text-sm text-muted">
          <li>1. ボードを開く</li>
          <li>2. 今動いている馬(急落)を見る</li>
          <li>3. レース詳細でオッズの推移を確認</li>
        </ol>
      </section>

      {/* disclaimer + CTA */}
      <section className="py-8 border-t border-line">
        <p className="text-xs text-muted leading-relaxed mb-6">
          本サービスは「オッズの動き」を可視化する情報ツールです。的中・利益を保証する
          ものではありません。馬券の購入は自己責任でお願いします。
        </p>
        <Link
          href="/board"
          className="inline-block bg-cta text-base font-bold px-6 py-3 rounded-lg cursor-pointer hover:brightness-110 transition"
        >
          無料で使ってみる
        </Link>
      </section>

      <footer className="py-8 text-center text-[11px] text-muted/60">
        オッズ急落くん β — JRAオッズ急変の可視化
      </footer>
    </main>
  );
}
