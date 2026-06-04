# 🔖 オッズ急落くん — 再開ドキュメント (RESUME HERE)

> jinが「**オッズ急落くんの続きから再開したい**」と言ったら、まずこのファイルを読む。
> 状態・決定事項・検証結果・次の一手が全部ここにある。作成: 2026-06-04。

## いまの状態(一行)
**MVP実装完了・ローカル稼働確認済(2026-06-04)。** 次は「ブラウザで確認→フィードバック反映→Vercelデプロイ(kyuraku.dlogicai.in)」。

### MVP実装メモ
- 場所: `frontend/`(Next.js14 App Router + Tailwind + Recharts)。`npm run dev` で http://localhost:3000。
- データ方式 = **A改良: サーバー側でSupabase直読み(service_roleキー、`frontend/.env.local`、クライアント露出なし)**。RLS不要。
- 実装: `/`(LP)・`/board`(種別フィルタ/45秒ポーリング/**JRA限定**・既定=急落)・`/race/[id]`(オッズ推移Recharts+急変履歴)・`/api/board`。
- 検証済: build OK / 実データ表示OK(`fetchBoard` はJRA会場のみ。NAR除外)。
- 既知の簡易点(今後): 馬番表示のみ(馬名は signal_entries 等から付与可)、発走時刻未表示、Vercel未デプロイ。
- env: Vercelに `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`(agkuvhiycthrloxzhgjc)を設定する。

---

## プロダクト概要
- **名称: オッズ急落くん**(英字補助 OddsDrop)。マスコット「急落くん」世界観OK。
- JRAのオッズをリアルタイム監視し、**直前で急落した馬(=資金流入)を可視化**する**情報/エンタメ型**サービス。**無料ベータ**でユーザー反応を見る。
- ⚠️ **「当たる/儲かる」は謳わない**(下記バックテストで賭け優位性は否定済。誇大表現NG・免責明記)。
- ブランドは独立(Dlogic名は出さない)。

## 確定した決定事項
- 名称 = **オッズ急落くん**
- タイプ = 情報/可視化(利益保証なし)
- レイアウト = **全シグナルボード**(急落=主タブ/既定、急騰・逆転=副タブ)。設計は `docs/BETA_SITE_DESIGN.md` のまま
- デザイン = **Dark Mode(OLED)** / **Fira Code(数値)+ Fira Sans** / 青#3B82F6 + CTA琥珀#F59E0B / 急落=シアン▼・急騰=ローズ▲・逆転=紫⇄
- 技術 = **Next.js(App Router)+ Vercel**、モバイルファースト。`*.dlogicai.in` はVercel ALIASなのでサブドメイン公開容易

## ドキュメント/成果物の場所(このリポジトリ dlogic-odds-monitor)
- `docs/BETA_SITE_DESIGN.md` — ★サイト設計書(構成/LP/画面レイアウト/デザイン方針)
- `PLAN_ODDS_SIGNAL_SERVICE.md` — 事業/段階プラン
- `scripts/backtest_signals.py` — 単勝/複勝バックテスト
- `scripts/backtest_fade.py` — odds-matched(消し)検証
- (別repo) `chatbot/uma/backend/scripts/backtest_engine_combo.py` — B: D-Logic×急変
- (別repo) `dlogic-agent/scripts/scrape_signal_entries.py` — 出馬表実名取得
- VPS: `/opt/dlogic/backend/data/signal_entries.json` — 744レースの番号→実名マップ

---

## Phase 0 バックテスト結論(★再検証しなくてよい)
データ: 2026-03-15〜05-31、JRAシグナル約8千、race_results 818レース。
- **単純な買い(単勝/複勝)= アルファ無し**。drop単勝回収62.9%/surge57.5%/reversal54.4%(いずれも市場基準~80%未満)。odds-matchedでもdropは全帯でベース割れ=**買われ過ぎ**。
- **C(surge=消し)= 不成立**(5-20倍では危険だが20-50/50+では逆。非一貫)。
- **B(drop × D-Logicスコア80-85)= 唯一の黒字: 回収123%/単勝36%/複勝57% だが n=47 & ルックアヘッド疑い**(現ナレッジ=シグナル後のレースも含むため)。retroでは判別不能 → **フォワードテストでしか確認できない**。
- 結論: **賭けて勝つ系では出さない**。情報/エンタメ型(本サービス)で出す。Bだけは将来の有料化候補としてフォワード検証する価値あり。

## 検知エンジン(既に稼働中)
- VPS `dlogic-odds-monitor.service` = active(**JRA限定**、config.MONITOR_NAR=False)。08-21 JST、20/10/5分間隔。急変を **Supabase `odds_signals`** に書込、スナップショットを `odds_snapshots` に保存。
- Supabaseプロジェクト = **agkuvhiycthrloxzhgjc**(linebot/odds-monitorと同じ。backendは別プロジェクトなので注意)。
- テーブル: `odds_signals`(race_id=12桁netkeiba, venue, race_number, signal_type, horse_number, detail(JSON: curr_odds/change_pct), race_date, notified_at) / `odds_snapshots`(odds_data JSON, snapshot_at, post_time) / `race_results`(race_id=内部形式 YYYYMMDD-会場-R, winner_number, win_payout, result_json.top3 — payoutsは壊れているのでtop3/win_payoutのみ信頼)。
- ⚠️ race_id形式が odds_signals(12桁) と race_results(内部形式)で違う → 照合は race_date+venue+race_number で内部キーを組む。
- ⚠️ odds_signals.horse_name は "5番" 等のプレースホルダ(実名でない)。実名は signal_entries.json か出馬表スクレイプで。

---

## ▶ 再開時の次アクション(ここから)
1. **データ取得方式を決定**(未決)。
   - **A(推奨)**: Vercel/Next.jsから **Supabase直読み**。anonキー + 3テーブルに**読み取り専用RLS**を張る(service_roleキーは使わない)。最小インフラ。
   - B: VPSに公開読み取りAPIを足す。
2. A採用なら: Supabaseで odds_signals/odds_snapshots/race_results に **select用RLSポリシー**を作成(anon read-only)。
3. **Next.jsプロジェクト雛形**作成: `/`(LP)・`/board`(急変ボード, 既定フィルタ=急落)・`/race/[id]`(オッズ推移=Recharts)。`docs/BETA_SITE_DESIGN.md` のレイアウト/配色/フォント通りに。
4. ローカル起動で確認 → Vercelデプロイ → `*.dlogicai.in` サブドメイン公開(例 kyuraku.dlogicai.in)。LINE webhookと同様DNSはVercel ALIAS。
5. (並行・任意)**Bフォワードテスト基盤**: 今後の急落シグナル発生時に「その時点のD-Logicスコア」を記録するジョブを足し、数週間後に結果照合(クリーンな有効性検証)。

## 接続情報(再開時すぐ使う)
- VPS: `ssh -i ~/.ssh/dlogic.pem root@210.131.208.243`(Ubuntu 26.04, uv+Python3.12)
- odds-monitor: `/opt/dlogic/odds-monitor/`(venv, .env にSupabase agkuvhiycthrloxzhgjc認証)
- バックテスト再実行: `cd /opt/dlogic/odds-monitor && venv/bin/python scripts/backtest_signals.py`

---
_関連メモリ: project_vps_outage_20260603(VPS再構築全体), このサービスは穴党/Dlogicとは独立。状態が進んだらこのファイルを更新。_
