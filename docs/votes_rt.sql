-- votes_rt : PC-KEIBA(JRA-VAN jvd_h1)由来の 単勝票数(実際の投票数=生の資金量) 時系列
-- 用途: 「資金急増」可視化(オッズ急落の"原因"=実際にいくら金が入ったかを直接見せる)
-- プロジェクト: agkuvhiycthrloxzhgjc (オッズ急落くん)  ← このプロジェクトのSQLエディタで実行
-- 書込: jinさんPCの scripts/pckeiba_odds_feeder.py (1分毎)
-- 読取: VPS scripts/push_sender.py / build_static_board.py
-- 1票=100円。total が変わった時だけ1行追加(冪等)=票数の純増を時系列で追える。

create table if not exists votes_rt (
  id          bigserial primary key,
  race_id     text        not null,           -- netkeiba 12桁
  total       bigint      not null,           -- 単勝票数合計(これが変化点キー)
  snapshot_at timestamptz not null,           -- feeder が取得した時刻
  data_kubun  text,                           -- 1..4=速報回, 5=確定
  votes       jsonb       not null,           -- {"1":74439,"2":...} 馬番→単勝票数
  created_at  timestamptz default now(),
  unique (race_id, total)
);

create index if not exists idx_votes_rt_race on votes_rt (race_id, snapshot_at);
