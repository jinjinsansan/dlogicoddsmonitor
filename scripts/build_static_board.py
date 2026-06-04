#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""急騰急落オッズくん: フロント完成JSONを生成して静的配信ディレクトリへ書き出す。

読み取り経路からDBを外すための心臓部。Supabase(監視の書込先)を背景で読み、
フロントがそのまま描画できる board.json / race/<id>.json を生成する。
馬名・騎手は出馬表(fetch_race_entries)から、**オッズくん指数**(中身はD-Logic
エンジン、ブランド名は出さない)は score_horses.py(backend venv)から焼き込む。

出力(nginx /kyuraku/ が配信):
  /opt/dlogic/odds-monitor/static_out/board.json
  /opt/dlogic/odds-monitor/static_out/race/<race_id>.json
キャッシュ:
  data/race_entries_full.json  {race_id:{num:{name,jockey}}}
  data/score_cache.json        {馬名: オッズくん指数 or null}

実行(VPS, cron */5):
  /opt/dlogic/linebot/venv/bin/python /opt/dlogic/odds-monitor/scripts/build_static_board.py
"""
import json
import os
import sys
import time
import subprocess
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
BASE = "/opt/dlogic/odds-monitor"
OUT = os.path.join(BASE, "static_out")
RACE_DIR = os.path.join(OUT, "race")
DATA = os.path.join(BASE, "data")
ENTRIES_CACHE = os.path.join(DATA, "race_entries_full.json")
SCORE_CACHE = os.path.join(DATA, "score_cache.json")
NEEDED = os.path.join(DATA, "needed_names.json")
SCORE_PY = "/opt/dlogic/backend/venv/bin/python"
SCORE_SCRIPT = os.path.join(BASE, "scripts/score_horses.py")
BOARD_LIMIT = 120
HONMEI_MIN = 80  # オッズくん指数がこれ以上 かつ 急落 = 「本命급落」

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


def load_json(p, default):
    if os.path.exists(p):
        try:
            return json.load(open(p, encoding="utf-8"))
        except Exception:
            return default
    return default


def save_json(p, obj):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + ".tmp"
    json.dump(obj, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
    os.replace(tmp, p)


def ensure_entries(race_ids, cache):
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
        save_json(ENTRIES_CACHE, cache)


def run_scoring(names):
    """未計算の馬名を score_horses.py(backend venv) で採点 → score_cache を返す。"""
    save_json(NEEDED, sorted(set(n for n in names if n)))
    try:
        subprocess.run([SCORE_PY, SCORE_SCRIPT], timeout=600, check=False)
    except Exception as ex:
        print(f"  scoring失敗: {ex}", flush=True)
    return load_json(SCORE_CACHE, {})


def sig_from_row(row, entries, scores):
    d = parse_detail(row.get("detail"))
    num = row.get("horse_number")
    e = (entries or {}).get(str(num)) if entries else None
    name = (e or {}).get("name") or f"{num}番"
    ok = scores.get(name)
    stype = row.get("signal_type")
    return {
        "id": row.get("id"),
        "raceId": row.get("race_id"),
        "venue": row.get("venue") or "",
        "raceNumber": row.get("race_number") or 0,
        "type": stype,
        "horseNumber": num,
        "currOdds": d.get("curr_odds", d.get("new_fav_odds_curr")),
        "prevOdds": d.get("prev_odds", d.get("new_fav_odds_prev")),
        "changePct": d.get("change_pct"),
        "notifiedAt": to_ms(row.get("notified_at")),
        "oldFav": d.get("old_favorite"),
        "newFav": d.get("new_favorite"),
        "horseName": name,
        "grade": "",
        "popularity": None,
        "jockey": "",
        "postTime": None,
        "spark": None,
        "okScore": ok,                                  # オッズくん指数(0-100, ナレッジ無しnull)
        "honmei": bool(stype == "drop" and ok is not None and ok >= HONMEI_MIN),  # 本命급落
    }


def build_board(entries_cache, scores):
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
    signals = [sig_from_row(r, entries_cache.get(r["race_id"]), scores) for r in board]
    return signals


def build_race(race_id, entries, scores):
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
        first_valid = next((x for x in series if x), 0)
        series = [x if x else first_valid for x in series]
        try:
            curr = float(last.get(key) or 0)
        except Exception:
            curr = 0.0
        if not curr:
            curr = series[-1] if series else 0
        e = (entries or {}).get(key)
        name = (e or {}).get("name") or f"{num}番"
        horses.append({
            "num": num,
            "name": name,
            "jockey": (e or {}).get("jockey") or "",
            "popularity": 0,
            "currOdds": curr,
            "series": series,
            "okScore": scores.get(name),
        })
    for i, h in enumerate(sorted(horses, key=lambda x: x["currOdds"])):
        h["popularity"] = i + 1

    signals = [sig_from_row(r, entries, scores) for r in sig_rows]

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


def main():
    os.makedirs(RACE_DIR, exist_ok=True)
    entries_cache = load_json(ENTRIES_CACHE, {})

    # board 対象 race_id を先に確定
    rows = (c.table("odds_signals")
            .select("race_id,horse_number,signal_type,notified_at")
            .in_("venue", JRA_VENUES)
            .order("notified_at", desc=True)
            .limit(500).execute().data) or []
    seen, race_ids = set(), []
    for row in rows:
        key = f"{row['race_id']}:{row['horse_number']}:{row['signal_type']}"
        if key in seen:
            continue
        seen.add(key)
        if row["race_id"] not in race_ids:
            race_ids.append(row["race_id"])
        if len(seen) >= BOARD_LIMIT:
            break

    ensure_entries(race_ids, entries_cache)

    # board 関連レースの全出走馬名を採点対象に
    names = []
    for rid in race_ids:
        for info in (entries_cache.get(rid) or {}).values():
            nm = info.get("name") if isinstance(info, dict) else info
            if nm:
                names.append(nm)
    scores = run_scoring(names)

    signals = build_board(entries_cache, scores)
    updated = datetime.now(timezone.utc).isoformat()
    save_json(os.path.join(OUT, "board.json"), {"signals": signals, "updatedAt": updated})
    for rid in race_ids:
        try:
            save_json(os.path.join(RACE_DIR, f"{rid}.json"), build_race(rid, entries_cache.get(rid), scores))
        except Exception as ex:
            print(f"  race {rid} 失敗: {ex}", flush=True)
    honmei = len([1 for s in signals if s.get("honmei")])
    print(f"board: {len(signals)} signals(本命급落 {honmei}) / races: {len(race_ids)} / updated {updated}", flush=True)


if __name__ == "__main__":
    main()
