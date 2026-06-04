# 🔖 オッズ急落くん — 再開ドキュメント (RESUME HERE)

> jinが「**オッズ急落くんの続きから再開したい**」と言ったら、まずこのファイルを読む。
> 状態・決定事項・検証結果・次の一手が全部ここにある。作成: 2026-06-04。

## いまの状態(一行)
**✅ ベータ本番公開済(2026-06-04): https://www.oddskun.com/**(Vercel, GitHub jinjinsansan/dlogicoddsmonitor の frontend/ を Root Directory に、env=SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY[agku])。
**✅ ハイファイ・リデザイン統合&push済(2026-06-04, commit 9160ee0)** = design_handoff_kyuraku のプロト(neon/M PLUS 1/pico マスコット/SPA)を Next.js へ移植。LP+ボード+レース詳細+LINE登録ゲート。Vercel自動再デプロイで反映。
次の候補: ①金曜のJRAオッズ(Lightpanda)確認=週末に新JRAシグナルが入るかの生命線 ②**馬名表示**(monitor拡張→signal_entries等)=現状は「N番」表示 ③LINE友だち追加URL(`NEXT_PUBLIC_LINE_ADD_URL`)を Vercel env に設定(未設定だとゲートのボタンはdoneへ進むだけ) ④ユーザー反応の収集・改善 ⑤Bフォワードテスト。

### レース追跡 + Web Push通知(2026-06-04, commit 998442e) ★現行
仲間アイデア採用。ユーザーが任意レースを「追跡」→発走約4分前に「**直前で最も急落した馬**」をWeb Push(無料・タブ閉でもOK、**LINE通知は使わない**)。アラート対象=最急落馬のみ(指数は絡めない、仲間指定)。情報型(「最も買われた馬」)。
- フロント: `public/sw.js`(SW), `src/lib/push.ts`(購読,localStorageで追跡管理), レース詳細に「🔔このレースを追跡」ボタン(**A案=レース詳細のみ・既存UI不変**)。`/api/track`(Vercel)が購読をSupabase `push_subscriptions` にupsert/delete(書込のみ復活)。
- VPS: `scripts/push_sender.py`(odds-monitor venv, **pywebpush**) を **cron */1**。購読者がいるレースのみ、発走30分前基準→最新で最急落1頭を算出し送信。失効購読(404/410)は自動削除、sent_races.jsonで重複防止。races_today.jsonでレース表キャッシュ。
- VAPID: 公開鍵は push.ts 既定(`BPfu1Tjc...`)、秘密鍵=VPS `data/vapid_private.pem`(600)。
- 監視ポーリングは**不変**(Droid領域回避、4分前は最終スナップで妥協)。
- **要手動**: ①Supabaseで `push_subscriptions` 作成(`docs/push_subscriptions.sql`, agkuプロジェクト) ②Vercel env `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`(初回デプロイで設定済のはず)。
- 検証: 購読ゼロで安全終了 / 最急落算出OK(5/31東京12R=6番 3.6→2.8 -22.2%)。実プッシュは実機購読が要るので未送信テスト。

### 週次スケジュール表示(2026-06-04, commit e7e5c1d)
ボードを**対象日＋モードで自動切替**(JST、`build_static_board.py` の `decide()`)。
- 金11:00→土09:00 = 土【preview 事前情報】/ 土09-17 = 土【live】/ 土17:00→日【preview】→日【live】/ 最終開催17:00以降〜次の前日11:00 = 【finished 結果】。連続開催日は前日17時に翌日へ切替。
- **月曜(祝日)開催も自動対応**: `is_race_day(date)` = レース表(get_race_list)の有無で判定。race_days_cache.json にキャッシュ(正は永続/負は6h)。
- **preview(事前情報)** = 出馬表(馬名・騎手)+オッズくん指数の「注目馬」カード(まだ急変は無い)。**live/finished** = その日の急変ボード(odds_signals を race_date で絞り込み)。
- レース表 `scrapers.odds.fetch_jra_race_list` は出馬表 `scrapers.jra` と同名パッケージ衝突 → **`list_races.py` を odds-monitor venv のサブプロセス**で取得(`get_race_list`)。未来日(翌週末)も取得可。
- 手動検証: `KY_FORCE_DATE=YYYYMMDD KY_FORCE_MODE=preview KY_OUT=/tmp/...` で本番非汚染生成。
- board.json に `mode/targetDate/targetLabel/liveStartMs/preview[]` 追加。フロントはヘッダに対象日タグ(LIVE/事前情報/結果)、preview用レースカード、LPミニboardも事前情報時は注目馬。
- 検証: now=6/4→「5/31(日) 結果」、6/7 preview=24R を両方描画確認。

### エッジ機能: オッズくん指数 + 本命急落(2026-06-04, commit 9717064)
**素のオッズ急変に「一段のエッジ」**=案B(急変×予想エンジン)を実装。ただし**Dlogicブランドは出さず独自指標「オッズくん指数」**として表示(中身は backend の fast_dlogic_engine、`data_source=knowledge_base` のみ採用、0-100)。
- 採点: `odds-monitor/scripts/score_horses.py`(**backend venv** `/opt/dlogic/backend/venv` で `fast_engine_instance.analyze_single_horse` 直叩き) → `data/score_cache.json`{馬名:指数or null}。未計算が無ければエンジン非ロードで即終了(軽量)。
- 焼き込み: `build_static_board.py` が board/race JSON に `okScore` と `honmei`(=急落 かつ 指数≥80=資金と実力の一致)を付与。`run_scoring()` が needed_names.json→score_horses.py をサブプロセス呼び。本番日ライブ採点=ルックアヘッド無し(フォワード妥当)。
- フロント: ボード行に「指数」チップ + ★本命バッジ + 行ハイライト(is-honmei)、レース詳細出馬表に指数列。免責(参考値・的中保証なし)明記。
- 実証: 直近開催(5/31東京)で120/120採点(全knowledge_base)、本命急落2件(例 ウィクトルウェルス 指数89.1)。
- 注: HONMEI閾値=80(Phase0で黒字だった drop×80-85 帯に整合)。n=47/未確証なので「当たる」は謳わずフォワード検証継続。

### アーキテクチャ更新(2026-06-04, commit 2fba539) ★現行
**読み取り経路から DB を排除（UI体感速度優先・jin判断）**:
- 監視(VPS) `odds-monitor/scripts/build_static_board.py` が **数分ごとに完成JSONを生成** → `board.json` / `race/<id>.json`（**馬名・騎手・人気・89点推移を焼き込み済み**）。nginx `location /kyuraku/`(`alias /opt/dlogic/odds-monitor/static_out/`, CORS*, Cache-Control max-age=30) で配信。URL: `https://bot.dlogicai.in/kyuraku/board.json`。
- 出馬表は `scrapers.jra.fetch_race_entries`(馬名+騎手) → `data/race_entries_full.json` にキャッシュ。
- 更新: `crontab */5 * * * *` で build_static_board.py。
- フロントは `src/lib/static.ts` 経由で静的JSONを `fetch(next.revalidate=30)` ＝ Vercelエッジキャッシュ。**読み取りSQLゼロ＝サクサク**。`KYURAKU_STATIC_URL` 既定値ハードコード(Vercel env不要)。
- 旧Supabase直読み(data.ts/toSig/supabase/format)は**削除**。Supabaseは監視の書込先としてのみ残存。
- 注: monitor.py `build_horse_names` は番号スタブのままで良い(UIは静的JSONの実名を使うため不依存)。

### MVP実装メモ(旧・参考)
- 場所: `frontend/`(Next.js14 App Router)。`npm run dev` で http://localhost:3000。
- ~~データ方式 = Supabase直読み~~ → **静的JSON配信に移行(上記)**。
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
