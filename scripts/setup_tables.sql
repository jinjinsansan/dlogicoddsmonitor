-- オッズモニター テーブル作成
-- Supabase SQL Editor で実行

-- オッズスナップショット（時系列データ）
CREATE TABLE IF NOT EXISTS odds_snapshots (
    id          BIGSERIAL PRIMARY KEY,
    race_id     TEXT NOT NULL,
    race_date   DATE NOT NULL,
    venue       TEXT NOT NULL,
    race_number INT NOT NULL,
    race_name   TEXT,
    race_type   TEXT NOT NULL,
    post_time   TEXT,
    odds_data   JSONB NOT NULL,
    snapshot_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_date ON odds_snapshots(race_date);
CREATE INDEX IF NOT EXISTS idx_snapshots_race ON odds_snapshots(race_id, snapshot_at);

-- 発火したシグナルの記録
CREATE TABLE IF NOT EXISTS odds_signals (
    id           BIGSERIAL PRIMARY KEY,
    race_id      TEXT NOT NULL,
    race_date    DATE NOT NULL,
    venue        TEXT,
    race_number  INT,
    race_name    TEXT,
    signal_type  TEXT NOT NULL,
    horse_number INT,
    horse_name   TEXT,
    detail       JSONB NOT NULL,
    notified_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signals_date ON odds_signals(race_date);
CREATE INDEX IF NOT EXISTS idx_signals_race ON odds_signals(race_id);
