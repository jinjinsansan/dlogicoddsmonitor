"""Odds monitor configuration."""

import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# --- External services ---
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

# --- netkeiba ---
NETKEIBA_JRA_BASE = "https://race.netkeiba.com"
NETKEIBA_NAR_BASE = "https://nar.netkeiba.com"

# --- Polling intervals (seconds) ---
POLL_NORMAL = 600       # 10 min (発走60分前以上)
POLL_CLOSE = 300        # 5 min  (発走60〜15分前)
POLL_FINAL = 180        # 3 min  (発走15分前以内)

# --- Signal thresholds ---
THRESHOLDS = {
    "drop_pct": -20,        # 20%以上下落で発火
    "surge_pct": 30,        # 30%以上上昇で発火
    "reversal_rank": 2,     # 人気順位が2つ以上変動
    "min_odds": 2.0,        # 2倍未満は除外
    "max_odds": 200.0,      # 200倍以上は除外
    "cooldown": 1800,       # 同じシグナルの再発火間隔（30分）
}

# --- Monitoring schedule ---
# JRA: 発売は通常 9:30〜, NAR: 会場による
MONITOR_START_HOUR = 8      # 監視開始（JST）
MONITOR_END_HOUR = 21       # 監視終了（JST）
