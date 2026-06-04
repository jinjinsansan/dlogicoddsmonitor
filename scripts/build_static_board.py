#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""オッズ急落くん: フロント完成JSONを生成して静的配信ディレクトリへ書き出す。

読み取り経路からDBを外すための心臓部。Supabase(監視の書込先)を背景で読み、
フロントがそのまま描画できる board.json / race/<id>.json を生成する。
馬名・騎手は出馬表(fetch_race_entries)から焼き込み済み。

出力(nginx /kyuraku/ が配信):
  /opt/dlogic/odds-monitor/static_out/board.json
  /opt/dlogic/odds-monitor/static_out/race/<race_id>.json
出馬表キャッシュ: /opt/dlogic/odds-monitor/data/race_entries_full.json  {race_id:{num:{name,jockey}}}

実行(VPS):
  /opt/dlogic/linebot/venv/bin/python /opt/dlogic/odds-monitor/scripts/build_static_board.py
"""
import json
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, "/opt/dlogic/linebot")

ENV = "/opt/dlogic/odds-monitor/.env"
for line in open(ENV, encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"'))

from supabase import create_client
try:
    from scrapers.jra import fetch_race_entries
except Exception:
    fetch_race_entries = None

JRA_VENUES = ['東京', '中山', '阪神', '京都', '中京', '新潟', '福島', '小倉', '札幌', '函館']
OUT = "/opt/dlogic/odds-monitor/static_out"
RACE_DIR = os.path.join(OUT, "race")
ENTRIES_CACHE = "/opt/dlogic/odds-monitor/data/race_entries_full.json"
BOARD_LIMIT = 120

c = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def to_ms(iso):
    if not iso:
        return 0
    try:
        s = str(iso).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except Exception:
        return 0


def parse_detail(raw):
    if not raw:
        return {}
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return {}
    return raw


def load_entries_cache():
    if os.path.exists(ENTRIES_CACHE):
        try:
            return json.load(open(ENTRIES_CACHE, encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_entries_cache(cache):
    os.makedirs(os.path.dirname(ENTRIES_CACHE), exist_ok=True)
    tmp = ENTRIES_CACHE + ".tmp"
    json.dump(cache, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
    os.replace(tmp, ENTRIES_CACHE)


def ensure_entries(race_ids, cache):
    """board に出てくるレースの出馬表(name,jockey)を確保。未取得はスクレイプ。"""
    if not fetch_race_entries:
        return
    changed = False
    for rid in race_ids:
        if cache.get(rid):
            continue
        try:
            d = fetch_race_entries(rid)
            ents = getattr(d, "entries", None) or (d.get("entries") if isinstance(d, dict) else None)
            m = {}
            for e in (ents or []):
                if isinstance(e, dict):
                    hn, nm, jk = e.get("horse_number"), e.get("horse_name"), e.get("jockey")
                else:
                    hn, nm, jk = getattr(e, "horse_number", None), getattr(e, "horse_name", None), getattr(e, "jockey", None)
                if hn and nm:
                    m[str(int(hn))] = {"name": nm, "jockey": jk or ""}
            if m:
                cache[rid] = m
                changed = True
                time.sleep(0.5)
        except Exception:
            pass
    if changed:
        save_entries_cache(cache)


def sig_from_row(row, entries):
    d = parse_detail(row.get("detail"))
    num = row.get("horse_number")
    e = (entries or {}).get(str(num)) if entries else None
    return {
        "id": row.get("id"),
        "raceId": row.get("race_id"),
        "venue": row.get("venue") or "",
        "raceNumber": row.get("race_number") or 0,
        "type": row.get("signal_type"),
        "horseNumber": num,
        "currOdds": d.get("curr_odds", d.get("new_fav_odds_curr")),
        "prevOdds": d.get("prev_odds", d.get("new_fav_odds_prev")),
        "changePct": d.get("change_pct"),
        "notifiedAt": to_ms(row.get("notified_at")),
        "oldFav": d.get("old_favorite"),
        "newFav": d.get("new_favorite"),
        "horseName": (e or {}).get("name") or f"{num}番",
        "grade": "",
        "popularity": None,
        "jockey": "",
        "postTime": None,
        "spark": None,
    }


def build_board(entries_cache):
    rows = (c.table("odds_signals")
            .select("id,race_id,venue,race_number,signal_type,horse_number,detail,race_date,notified_at")
            .in_("venue", JRA_VENUES)
            .order("notified_at", desc=True)
            .limit(500).execute().data) or []
    seen, board = set(), []
    for row in rows:
        key = f"{row['race_id']}:{row['horse_number']}:{row['signal_type']}"
        if key in seen:
            continue
        seen.add(key)
        board.append(row)
        if len(board) >= BOARD_LIMIT:
            break
    race_ids = list({r["race_id"] for r in board})
    ensure_entries(race_ids, entries_cache)
    signals = [sig_from_row(r, entries_cache.get(r["race_id"])) for r in board]
    return signals, race_ids


def build_race(race_id, entries):
    sig_rows = (c.table("odds_signals")
                .select("id,race_id,venue,race_number,signal_type,horse_number,detail,race_date,notified_at")
                .eq("race_id", race_id).order("notified_at", desc=True).execute().data) or []
    snap_rows = (c.table("odds_snapshots")
                 .select("snapshot_at,odds_data,venue,race_number")
                 .eq("race_id", race_id).order("snapshot_at", desc=False).limit(300).execute().data) or []

    venue = (sig_rows[0]["venue"] if sig_rows else "") or (snap_rows[0]["venue"] if snap_rows else "")
    race_number = (sig_rows[0]["race_number"] if sig_rows else 0) or (snap_rows[0]["race_number"] if snap_rows else 0)

    snaps = []
    for s in snap_rows:
        od = s.get("odds_data")
        if isinstance(od, str):
            try:
                od = json.loads(od)
            except Exception:
                od = {}
        snaps.append({"t": s.get("snapshot_at"), "odds": od or {}})

    snap_times = [to_ms(s["t"]) for s in snaps if to_ms(s["t"])]
    last = snaps[-1]["odds"] if snaps else {}
    nums = sorted([int(k) for k in last.keys() if str(k).lstrip("-").isdigit() and float(last.get(k) or 0) > 0])

    horses = []
    for num in nums:
        key = str(num)
        last_known = 0.0
        series = []
        for s in snaps:
            v = s["odds"].get(key)
            try:
                v = float(v)
            except Exception:
                v = None
            if v and v > 0:
                last_known = v
                series.append(v)
            else:
                series.append(last_known if last_known > 0 else None)
        # 先頭欠損を最初の有効値で埋める
        first_valid = next((x for x in series if x), 0)
        series = [x if x else first_valid for x in series]
        curr = 0.0
        try:
            curr = float(last.get(key) or 0)
        except Exception:
            curr = 0.0
        if not curr:
            curr = series[-1] if series else 0
        e = (entries or {}).get(key)
        horses.append({
            "num": num,
            "name": (e or {}).get("name") or f"{num}番",
            "jockey": (e or {}).get("jockey") or "",
            "popularity": 0,
            "currOdds": curr,
            "series": series,
        })
    for i, h in enumerate(sorted(horses, key=lambda x: x["currOdds"])):
        h["popularity"] = i + 1

    signals = [sig_from_row(r, entries) for r in sig_rows]

    return {
        "raceId": race_id,
        "venue": venue,
        "raceNumber": race_number,
        "grade": "",
        "raceName": "",
        "surface": "",
        "distance": 0,
        "nHorses": len(horses),
        "postTime": None,
        "snapTimes": snap_times,
        "horses": horses,
        "signals": signals,
    }


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    json.dump(obj, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
    os.replace(tmp, path)


def main():
    os.makedirs(RACE_DIR, exist_ok=True)
    entries_cache = load_entries_cache()
    signals, race_ids = build_board(entries_cache)
    updated = datetime.now(timezone.utc).isoformat()
    write_json(os.path.join(OUT, "board.json"), {"signals": signals, "updatedAt": updated})
    for rid in race_ids:
        try:
            write_json(os.path.join(RACE_DIR, f"{rid}.json"), build_race(rid, entries_cache.get(rid)))
        except Exception as ex:
            print(f"  race {rid} 失敗: {ex}", flush=True)
    print(f"board: {len(signals)} signals / races: {len(race_ids)} / updated {updated}", flush=True)


if __name__ == "__main__":
    main()
