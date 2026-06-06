-- odds_rt : PC-KEIBA(JRA-VAN)由来のリアルタイム単勝オッズ・スナップショット
-- 用途: Web Push「直前で最も急落した馬」の算出元(netkeibaのフリーズ問題を回避)
-- プロジェクト: agkuvhiycthrloxzhgjc (オッズ急落くん)  ← 必ずこのプロジェクトのSQLエディタで実行
-- 書込: jinさんPCの scripts/pckeiba_odds_feeder.py (1分毎)
-- 読取: VPS scripts/push_sender.py

create table if not exists odds_rt (
  id          bigserial primary key,
  race_id     text        not null,           -- netkeiba 12桁 (例 202605030101)
  happyo      text        not null,           -- jvd_o1 発表月日時分 'MMDDHHMM' (速報の識別)
  data_kubun  text,                           -- 1..4=速報回, 5=確定
  snapshot_at timestamptz not null,           -- happyo を JST→UTC で解釈
  odds_data   jsonb       not null,           -- {"1":2.3,"2":15.2,...} 単勝(馬番→オッズ)
  created_at  timestamptz default now(),
  unique (race_id, happyo)
);

create index if not exists idx_odds_rt_race on odds_rt (race_id, snapshot_at);

-- 任意: 古いデータの自動削除は運用で(例: 数日分のみ保持)。RLSは不要(service_roleのみアクセス)。
