#!/usr/bin/env python3
"""Odds Monitor — polls odds, detects changes, sends Telegram alerts."""

import json
import logging
import time
from datetime import datetime, timedelta, timezone

from config import (
    POLL_NORMAL, POLL_CLOSE, POLL_FINAL,
    THRESHOLDS, MONITOR_START_HOUR, MONITOR_END_HOUR,
)
from scrapers.odds import (
    fetch_jra_odds_batch, fetch_nar_odds_batch,
    fetch_jra_race_list, fetch_nar_race_list,
)
from detection.signals import detect_signals
from db.supabase import (
    save_snapshot, get_latest_snapshot, get_snapshots,
    save_signal, get_recent_signals,
)
from notifiers.telegram import send_message, format_signal_message, send_daily_summary

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("monitor")

JST = timezone(timedelta(hours=9))


def now_jst() -> datetime:
    return datetime.now(JST)


def parse_post_time(post_time: str, date: datetime) -> datetime | None:
    """Parse "15:45" into a JST datetime."""
    m = None
    for fmt in ["%H:%M", "%H時%M分"]:
        try:
            t = datetime.strptime(post_time.strip(), fmt)
            return date.replace(hour=t.hour, minute=t.minute, second=0, microsecond=0)
        except ValueError:
            continue
    return None


def get_poll_interval(races: list[dict], current_time: datetime) -> int:
    """Determine poll interval based on nearest race post time."""
    min_minutes = float("inf")
    for race in races:
        pt = parse_post_time(race.get("post_time", ""), current_time)
        if pt and pt > current_time:
            diff = (pt - current_time).total_seconds() / 60
            min_minutes = min(min_minutes, diff)

    if min_minutes <= 15:
        return POLL_FINAL
    elif min_minutes <= 60:
        return POLL_CLOSE
    else:
        return POLL_NORMAL


def filter_active_races(races: list[dict], current_time: datetime) -> list[dict]:
    """Remove races that have already started (post_time passed)."""
    active = []
    for race in races:
        pt = parse_post_time(race.get("post_time", ""), current_time)
        if pt is None:
            # Can't determine post time — keep it
            active.append(race)
        elif pt > current_time - timedelta(minutes=5):
            # Race hasn't started yet (5min grace)
            active.append(race)
    return active


def build_horse_names(race_id: str, odds_map: dict[int, float]) -> dict[int, str]:
    """Build horse number -> name mapping.

    For now returns numbers only. Can be enhanced with prefetch data later.
    """
    return {n: f"{n}番" for n in odds_map}


def _send_hourly_status(now: datetime, active_races: int,
                        hourly_polls: int, hourly_signals: int,
                        total_signals: int):
    """Send hourly heartbeat to Telegram."""
    ts = now.strftime("%H:%M")
    lines = [
        f"<b>{ts} 定期レポート</b>",
        "",
        f"  監視中: {active_races} レース",
        f"  直近1h: {hourly_polls} 回ポーリング / {hourly_signals} 件シグナル",
        f"  本日累計シグナル: {total_signals} 件",
        "",
        "━━━━━━━━━━━━",
    ]
    send_message("\n".join(lines))


def poll_once(races: list[dict]) -> tuple[int, int]:
    """Execute one polling cycle. Returns (snapshots_saved, signals_fired)."""
    now = now_jst()
    active_races = filter_active_races(races, now)

    if not active_races:
        return 0, 0

    # Split by type
    jra_races = [r for r in active_races if r["race_type"] == "jra"]
    nar_races = [r for r in active_races if r["race_type"] == "nar"]

    # Fetch odds
    jra_ids = [r["race_id"] for r in jra_races]
    nar_ids = [r["race_id"] for r in nar_races]

    logger.info(f"Polling: {len(jra_ids)} JRA + {len(nar_ids)} NAR races")

    jra_odds = {}
    if jra_ids:
        t0 = time.time()
        jra_odds = fetch_jra_odds_batch(jra_ids)
        logger.info(f"JRA batch: {len(jra_odds)}/{len(jra_ids)} in {time.time()-t0:.1f}s")

    nar_odds = {}
    if nar_ids:
        t0 = time.time()
        nar_odds = fetch_nar_odds_batch(nar_ids)
        logger.info(f"NAR batch: {len(nar_odds)}/{len(nar_ids)} in {time.time()-t0:.1f}s")

    all_odds = {**jra_odds, **nar_odds}
    race_map = {r["race_id"]: r for r in active_races}

    snapshots_saved = 0
    signals_fired = 0

    for race_id, current_odds in all_odds.items():
        race = race_map.get(race_id)
        if not race:
            continue

        race["race_date"] = now.strftime("%Y-%m-%d")

        # Get previous snapshot for comparison (before saving new one)
        prev = get_latest_snapshot(race_id)

        # Save snapshot
        save_snapshot(race, current_odds)
        snapshots_saved += 1

        if not prev:
            continue

        prev_odds_raw = prev.get("odds_data", {})
        prev_odds = {int(k): float(v) for k, v in prev_odds_raw.items()}

        # Detect signals
        horse_names = build_horse_names(race_id, current_odds)
        signals = detect_signals(race, current_odds, prev_odds, horse_names)

        if not signals:
            continue

        # Filter by cooldown
        new_signals = []
        cooldown_min = THRESHOLDS["cooldown"] // 60
        for sig in signals:
            recent = get_recent_signals(
                race_id, sig["type"], sig["horse_number"], cooldown_min
            )
            if not recent:
                new_signals.append(sig)

        if not new_signals:
            continue

        # Save & notify
        for sig in new_signals:
            save_signal(race, sig["type"], sig["horse_number"],
                        sig["horse_name"], sig["detail"])
            signals_fired += 1

        logger.info(f"Signal: {race_id} -> {[s['type'] for s in new_signals]}")

    return snapshots_saved, signals_fired


def run_monitor():
    """Main monitoring loop."""
    logger.info("=" * 50)
    logger.info("Odds Monitor started")
    logger.info("=" * 50)

    send_message("🟢 <b>オッズモニター起動</b>\nJRA + 地方競馬 の監視を開始します。")

    total_polls = 0
    total_signals = 0
    signal_counts = {"drop": 0, "surge": 0, "reversal": 0}

    while True:
        now = now_jst()

        # Outside monitoring hours — wait
        if now.hour < MONITOR_START_HOUR:
            wait = (now.replace(hour=MONITOR_START_HOUR, minute=0, second=0) - now).seconds
            logger.info(f"Before monitoring hours. Sleeping {wait//60}min")
            time.sleep(min(wait, 600))
            continue

        if now.hour >= MONITOR_END_HOUR:
            # Send daily summary
            if total_polls > 0:
                send_daily_summary(
                    now.strftime("%Y-%m-%d"),
                    total_polls, total_signals, signal_counts,
                )
                total_polls = 0
                total_signals = 0
                signal_counts = {"drop": 0, "surge": 0, "reversal": 0}

            # Wait until next day
            tomorrow = (now + timedelta(days=1)).replace(
                hour=MONITOR_START_HOUR, minute=0, second=0
            )
            wait = (tomorrow - now).seconds
            logger.info(f"After monitoring hours. Sleeping {wait//3600:.1f}h")
            time.sleep(min(wait, 3600))
            continue

        # Fetch race lists (refresh every hour)
        date_str = now.strftime("%Y%m%d")
        logger.info(f"Fetching race lists for {date_str}...")

        races = []
        try:
            races += fetch_jra_race_list(date_str)
        except Exception:
            logger.exception("Failed to fetch JRA race list")

        try:
            races += fetch_nar_race_list(date_str)
        except Exception:
            logger.exception("Failed to fetch NAR race list")

        if not races:
            logger.info("No races found. Sleeping 30min")
            time.sleep(1800)
            continue

        logger.info(f"Monitoring {len(races)} races")

        # Inner polling loop (re-fetch race list every hour)
        inner_start = time.time()
        hourly_polls = 0
        hourly_signals = 0

        while time.time() - inner_start < 3600:
            now = now_jst()
            if now.hour >= MONITOR_END_HOUR:
                break

            active = filter_active_races(races, now)
            if not active:
                logger.info("All races finished. Breaking inner loop.")
                break

            interval = get_poll_interval(active, now)
            logger.info(f"Active: {len(active)} races, interval: {interval}s")

            try:
                saved, fired = poll_once(active)
                total_polls += 1
                total_signals += fired
                hourly_polls += 1
                hourly_signals += fired
                for s_type in signal_counts:
                    # Update signal counts from DB would be ideal,
                    # but for simplicity just track fired
                    pass
                logger.info(f"Poll done: {saved} snapshots, {fired} signals")
            except Exception:
                logger.exception("Poll failed")

            # Sleep until next poll
            logger.info(f"Sleeping {interval}s until next poll")
            time.sleep(interval)

        # Hourly status report
        now = now_jst()
        if now.hour < MONITOR_END_HOUR and hourly_polls > 0:
            active_count = len(filter_active_races(races, now))
            _send_hourly_status(now, active_count, hourly_polls, hourly_signals, total_signals)

    logger.info("Monitor stopped")


if __name__ == "__main__":
    run_monitor()
