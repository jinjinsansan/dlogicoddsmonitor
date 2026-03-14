"""Odds change detection logic."""

import logging
from config import THRESHOLDS

logger = logging.getLogger(__name__)


def detect_signals(
    race: dict,
    current_odds: dict[int, float],
    previous_odds: dict[int, float] | None,
    horse_names: dict[int, str] | None = None,
) -> list[dict]:
    """Compare current odds with previous snapshot and detect signals.

    Returns list of signal dicts:
        {
            "type": "drop" | "surge" | "reversal",
            "horse_number": int,
            "horse_name": str,
            "detail": {
                "prev_odds": float,
                "curr_odds": float,
                "change_pct": float,
                ...
            }
        }
    """
    if not previous_odds or not current_odds:
        return []

    signals = []
    names = horse_names or {}
    min_odds = THRESHOLDS["min_odds"]
    max_odds = THRESHOLDS["max_odds"]
    drop_thresh = THRESHOLDS["drop_pct"]
    surge_thresh = THRESHOLDS["surge_pct"]

    # --- Per-horse change detection ---
    for num, curr in current_odds.items():
        prev = previous_odds.get(num)
        if prev is None or prev <= 0 or curr <= 0:
            continue

        # Skip extremes
        if prev < min_odds and curr < min_odds:
            continue
        if prev > max_odds and curr > max_odds:
            continue

        change_pct = ((curr - prev) / prev) * 100

        detail = {
            "prev_odds": prev,
            "curr_odds": curr,
            "change_pct": round(change_pct, 1),
        }

        # Drop signal (odds decreased = money coming in)
        if change_pct <= drop_thresh:
            signals.append({
                "type": "drop",
                "horse_number": num,
                "horse_name": names.get(num, f"{num}番"),
                "detail": detail,
            })

        # Surge signal (odds increased = money leaving)
        elif change_pct >= surge_thresh:
            signals.append({
                "type": "surge",
                "horse_number": num,
                "horse_name": names.get(num, f"{num}番"),
                "detail": detail,
            })

    # --- Popularity reversal detection ---
    prev_ranking = sorted(
        [(n, o) for n, o in previous_odds.items() if 0 < o < max_odds],
        key=lambda x: x[1],
    )
    curr_ranking = sorted(
        [(n, o) for n, o in current_odds.items() if 0 < o < max_odds],
        key=lambda x: x[1],
    )

    if len(prev_ranking) >= 3 and len(curr_ranking) >= 3:
        prev_top3 = [n for n, _ in prev_ranking[:3]]
        curr_top3 = [n for n, _ in curr_ranking[:3]]

        # Check if the #1 favorite changed
        if prev_top3[0] != curr_top3[0]:
            old_fav = prev_top3[0]
            new_fav = curr_top3[0]
            signals.append({
                "type": "reversal",
                "horse_number": new_fav,
                "horse_name": names.get(new_fav, f"{new_fav}番"),
                "detail": {
                    "old_favorite": old_fav,
                    "old_favorite_name": names.get(old_fav, f"{old_fav}番"),
                    "new_favorite": new_fav,
                    "new_favorite_name": names.get(new_fav, f"{new_fav}番"),
                    "old_fav_odds_prev": previous_odds.get(old_fav, 0),
                    "old_fav_odds_curr": current_odds.get(old_fav, 0),
                    "new_fav_odds_prev": previous_odds.get(new_fav, 0),
                    "new_fav_odds_curr": current_odds.get(new_fav, 0),
                },
            })

    return signals
