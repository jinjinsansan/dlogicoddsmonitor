"""Supabase client for odds snapshots and signals."""

import json
import logging
from datetime import datetime

from supabase import create_client

from config import SUPABASE_URL, SUPABASE_KEY

logger = logging.getLogger(__name__)

_client = None


def get_client():
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client


def save_snapshot(race: dict, odds_data: dict[int, float]):
    """Save an odds snapshot."""
    client = get_client()
    row = {
        "race_id": race["race_id"],
        "race_date": race.get("race_date", datetime.now().strftime("%Y-%m-%d")),
        "venue": race.get("venue", ""),
        "race_number": race.get("race_number", 0),
        "race_name": race.get("race_name", ""),
        "race_type": race.get("race_type", "jra"),
        "post_time": race.get("post_time", ""),
        "odds_data": json.dumps({str(k): v for k, v in odds_data.items()}),
    }
    try:
        client.table("odds_snapshots").insert(row).execute()
    except Exception:
        logger.exception(f"Failed to save snapshot for {race['race_id']}")


def get_latest_snapshot(race_id: str) -> dict | None:
    """Get the most recent snapshot for a race."""
    client = get_client()
    try:
        resp = (
            client.table("odds_snapshots")
            .select("*")
            .eq("race_id", race_id)
            .order("snapshot_at", desc=True)
            .limit(1)
            .execute()
        )
        if resp.data:
            row = resp.data[0]
            if isinstance(row["odds_data"], str):
                row["odds_data"] = json.loads(row["odds_data"])
            return row
        return None
    except Exception:
        logger.exception(f"Failed to get snapshot for {race_id}")
        return None


def get_snapshots(race_id: str, limit: int = 10) -> list[dict]:
    """Get recent snapshots for a race (newest first)."""
    client = get_client()
    try:
        resp = (
            client.table("odds_snapshots")
            .select("*")
            .eq("race_id", race_id)
            .order("snapshot_at", desc=True)
            .limit(limit)
            .execute()
        )
        for row in resp.data:
            if isinstance(row["odds_data"], str):
                row["odds_data"] = json.loads(row["odds_data"])
        return resp.data
    except Exception:
        logger.exception(f"Failed to get snapshots for {race_id}")
        return []


def save_signal(race: dict, signal_type: str, horse_number: int,
                horse_name: str, detail: dict):
    """Save a detected signal."""
    client = get_client()
    row = {
        "race_id": race["race_id"],
        "race_date": race.get("race_date", datetime.now().strftime("%Y-%m-%d")),
        "venue": race.get("venue", ""),
        "race_number": race.get("race_number", 0),
        "race_name": race.get("race_name", ""),
        "signal_type": signal_type,
        "horse_number": horse_number,
        "horse_name": horse_name,
        "detail": json.dumps(detail, ensure_ascii=False),
    }
    try:
        client.table("odds_signals").insert(row).execute()
    except Exception:
        logger.exception(f"Failed to save signal for {race['race_id']}")


def get_recent_signals(race_id: str, signal_type: str,
                       horse_number: int, minutes: int = 30) -> list[dict]:
    """Check if a similar signal was recently fired (cooldown check)."""
    client = get_client()
    try:
        from datetime import timedelta, timezone
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()
        resp = (
            client.table("odds_signals")
            .select("id")
            .eq("race_id", race_id)
            .eq("signal_type", signal_type)
            .eq("horse_number", horse_number)
            .gte("notified_at", cutoff)
            .execute()
        )
        return resp.data
    except Exception:
        return []
