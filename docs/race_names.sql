-- race_names : PC-KEIBA(JRA-VAN jvd_se)由来の 馬番→馬名・騎手 マップ
-- 用途: Web Push 本文の馬名表示(netkeiba出馬表は馬番がズレるためPC-KEIBAを正とする)
-- プロジェクト: agkuvhiycthrloxzhgjc (オッズ急落くん)  ← このプロジェクトのSQLエディタで実行
-- 書込: jinさんPCの scripts/pckeiba_odds_feeder.py (1分毎・オッズと同時)
-- 読取: VPS scripts/push_sender.py

create table if not exists race_names (
  race_id    text        primary key,        -- netkeiba 12桁 (例 202605030111)
  names      jsonb       not null,            -- {"9":{"name":"メディアスター","jockey":"ディー"}, ...} 馬番(連番)→馬名/騎手
  updated_at timestamptz default now()
);
