-- races_rt : PC-KEIBA(JRA-VAN jvd_ra)由来のレース表(レースID・会場・R・発走時刻)
-- 用途: ボードの番組表/プレビュー。netkeibaのレース一覧APIは開催日が近づくまで400/空を返すため、
--       PC-KEIBA(週末カードを事前保持)を正/フォールバック元にして preview を確実に表示する。
-- プロジェクト: agkuvhiycthrloxzhgjc (オッズ急落くん)  ← このプロジェクトのSQLエディタで実行
-- 書込: jinさんPCの scripts/pckeiba_odds_feeder.py (1分毎・当日+翌日)
-- 読取: VPS scripts/build_static_board.py / push_sender.py

create table if not exists races_rt (
  race_id     text        primary key,        -- netkeiba 12桁
  race_date   text        not null,           -- 'YYYY-MM-DD'(JST開催日)
  venue       text,                           -- 会場(トラックコードから導出)
  race_number int,                            -- R
  post_time   text,                           -- 'HH:MM'(発走)
  race_name   text,
  updated_at  timestamptz default now()
);

create index if not exists idx_races_rt_date on races_rt (race_date);
