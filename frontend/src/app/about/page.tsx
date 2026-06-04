import Link from "next/link";

export const metadata = {
  title: "オッズ急落くんとは — JRAオッズ急変の可視化",
};

export default function AboutPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 pb-16">
      <nav className="py-4">
        <Link href="/" className="font-bold text-lg cursor-pointer">
          オッズ<span className="text-drop">急落</span>くん
        </Link>
      </nav>

      <h1 className="text-2xl font-bold mt-4">オッズ急落くんとは</h1>
      <p className="text-muted mt-3 leading-relaxed">
        JRA全レースのオッズをリアルタイムで監視し、
        <strong className="text-ink">直前で急に動いた馬</strong>
        を自動で見つけて表示する情報サービスです。
        人の目では追いきれない全レースの「お金の動き」を、ひと目で。
      </p>

      <section className="mt-8">
        <h2 className="font-bold text-lg mb-3">3つのシグナル</h2>
        <div className="space-y-3">
          <div className="border-l-4 pl-3" style={{ borderColor: "#22D3EE" }}>
            <div className="font-semibold text-drop">▼ 急落</div>
            <div className="text-sm text-muted">
              オッズが下がった=お金が入ってきた(買われている)馬。
            </div>
          </div>
          <div className="border-l-4 pl-3" style={{ borderColor: "#FB7185" }}>
            <div className="font-semibold text-surge">▲ 急騰</div>
            <div className="text-sm text-muted">
              オッズが上がった=お金が抜けた(人気が離れた)馬。
            </div>
          </div>
          <div className="border-l-4 pl-3" style={{ borderColor: "#A78BFA" }}>
            <div className="font-semibold text-reversal">⇄ 1番人気逆転</div>
            <div className="text-sm text-muted">
              オッズ順の1番人気が入れ替わった瞬間。
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-bold text-lg mb-2">使い方</h2>
        <ol className="text-sm text-muted space-y-1">
          <li>1. ボードを開く</li>
          <li>2. 今動いている馬を見る</li>
          <li>3. レース詳細でオッズの推移を確認する</li>
        </ol>
      </section>

      <section className="mt-8 bg-surface rounded-xl border border-line p-4">
        <h2 className="font-bold mb-2">免責</h2>
        <p className="text-xs text-muted leading-relaxed">
          本サービスは「オッズの動き」を可視化する<strong className="text-ink">情報ツール</strong>です。
          馬券の的中・利益を保証するものではありません。表示には集計上のダミーを含む場合があります。
          馬券の購入は20歳以上・自己責任でお願いします。現在<strong className="text-ink">ベータ版</strong>として
          無料公開しており、予告なく仕様変更・停止する場合があります。
        </p>
      </section>

      <section className="mt-8 text-center">
        <Link
          href="/board"
          className="inline-block bg-cta text-base font-bold px-6 py-3 rounded-lg cursor-pointer hover:brightness-110 transition"
        >
          急変ボードを見る
        </Link>
        <p className="mt-4 text-xs text-muted">
          ご意見・ご感想は{" "}
          <a
            href="mailto:goldbenchan@gmail.com?subject=オッズ急落くん フィードバック"
            className="text-brand underline cursor-pointer"
          >
            こちら
          </a>
          (ベータ版・反応募集中)
        </p>
      </section>
    </main>
  );
}
