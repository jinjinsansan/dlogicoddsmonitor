"""Telegram push notification for odds signals."""

import logging
import requests

from config import TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

logger = logging.getLogger(__name__)


def send_message(text: str, chat_id: str | None = None):
    """Send a message via Telegram Bot API."""
    cid = chat_id or TELEGRAM_CHAT_ID
    if not TELEGRAM_BOT_TOKEN or not cid:
        logger.warning("Telegram not configured")
        return False

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        resp = requests.post(url, json={
            "chat_id": cid,
            "text": text,
            "parse_mode": "HTML",
        }, timeout=10)
        if resp.status_code != 200:
            logger.error(f"Telegram send failed: {resp.text}")
            return False
        return True
    except Exception:
        logger.exception("Telegram send error")
        return False


def format_signal_message(race: dict, signals: list[dict],
                          snapshots: list[dict] | None = None) -> str:
    """Format signal data into a Telegram message."""
    venue = race.get("venue", "")
    race_num = race.get("race_number", "")
    race_name = race.get("race_name", "")
    post_time = race.get("post_time", "")

    lines = [
        "⚡ <b>オッズ急変シグナル</b> ⚡",
        "",
        f"📍 {venue}{race_num}R {race_name}",
    ]
    if post_time:
        lines.append(f"   発走 {post_time}")
    lines.append("")

    for sig in signals:
        stype = sig["type"]
        num = sig["horse_number"]
        name = sig["horse_name"]
        detail = sig["detail"]

        if stype == "drop":
            pct = detail["change_pct"]
            prev = detail["prev_odds"]
            curr = detail["curr_odds"]
            lines.append("📉 <b>急落</b> ─ 大口買い検知")
            lines.append(f"  {num}.{name}")

            # Add transition if snapshots available
            if snapshots:
                for snap in reversed(snapshots[-4:]):
                    odds_data = snap.get("odds_data", {})
                    ts = snap.get("snapshot_at", "")[:16].split("T")[-1]
                    val = odds_data.get(str(num), "")
                    if val:
                        lines.append(f"  {ts}  {val}倍")

            lines.append(f"  <b>変動 {pct:+.1f}%</b>")
            lines.append("")

        elif stype == "surge":
            pct = detail["change_pct"]
            lines.append("📈 <b>急騰</b> ─ 嫌気")
            lines.append(f"  {num}.{name}")

            if snapshots:
                for snap in reversed(snapshots[-4:]):
                    odds_data = snap.get("odds_data", {})
                    ts = snap.get("snapshot_at", "")[:16].split("T")[-1]
                    val = odds_data.get(str(num), "")
                    if val:
                        lines.append(f"  {ts}  {val}倍")

            lines.append(f"  <b>変動 {pct:+.1f}%</b>")
            lines.append("")

        elif stype == "reversal":
            old_name = detail.get("old_favorite_name", "")
            new_name = detail.get("new_favorite_name", "")
            old_num = detail.get("old_favorite", "")
            new_num = detail.get("new_favorite", "")
            lines.append("🔀 <b>1番人気逆転</b>")
            lines.append(f"  {old_num}.{old_name} → {new_num}.{new_name}")
            lines.append("")

    lines.append("━━━━━━━━━━━━")

    return "\n".join(lines)


def send_daily_summary(date_str: str, total_polls: int,
                       total_signals: int, signal_breakdown: dict):
    """Send end-of-day summary."""
    lines = [
        "📊 <b>本日のオッズモニター集計</b>",
        f"日付: {date_str}",
        "",
        f"ポーリング回数: {total_polls}",
        f"シグナル発火数: {total_signals}",
    ]
    if signal_breakdown:
        lines.append("")
        for stype, count in signal_breakdown.items():
            label = {"drop": "📉 急落", "surge": "📈 急騰", "reversal": "🔀 逆転"}.get(stype, stype)
            lines.append(f"  {label}: {count}件")

    lines.append("")
    lines.append("━━━━━━━━━━━━")

    send_message("\n".join(lines))
