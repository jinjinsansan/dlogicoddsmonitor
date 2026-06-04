-- 急騰急落オッズくん: Web Push 購読テーブル
-- 実行先: Supabase プロジェクト agkuvhiycthrloxzhgjc (オッズくん/odds-monitor と同じ)
-- 1購読(endpoint) × 追跡レース(race_id) = 1行。発走直前の通知に使う。
-- アクセスは service_role のみ(Vercel /api/track と VPS push_sender.py)。anon公開しない。

create table if not exists push_subscriptions (
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  race_id    text not null,
  created_at timestamptz default now(),
  primary key (endpoint, race_id)
);
