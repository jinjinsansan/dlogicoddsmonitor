#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""急騰急落オッズくん: フロント完成JSONを生成(週次スケジュール対応)。

読み取り経路からDBを外す心臓部。Supabase(監視の書込先)とnetkeiba(出馬表/レース表)を
背景で読み、フロントがそのまま描画できる board.json / race/<id>.json を生成する。

■ 週次スケジュール(JST) — 対象日とモードを時刻で自動決定
  金11:00 → 土09:00   : 土【事前情報 preview】出馬表+オッズくん指数(注目馬)
  土09:00 → 土17:00   : 土【LIVE live】オッズ急変
  土17:00 → 日09:00   : 日【事前情報 preview】
  日09:00 → 日17:00   : 日【LIVE live】
  最終開催17:00 → 次の前日11:00 : 【結果 finished】直近開催を表示
  ※ 月曜開催(祝日)も is_race_day 判定で自動対応。連続開催日は前日17:00に翌日へ切替。

馬名・騎手=fetch_race_entries、オッズくん指数=score_horses.py(backend venv)。

実行(VPS, cron */5):
  /opt/dlogic/linebot/venv/bin/python /opt/dlogic/odds-monitor/scripts/build_static_board.py
"""
import json
import os
import sys
import time as _time
import subprocess
from datetime import datetime, timezone, timedelta, date as _date

sys.path.insert(0, "/opt/dlogic/linebot")

ENV = "/opt/dlogic/odds-monitor/.env"
for line in open(ENV, encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"'))

from supabase import create_client
try:
    from scrapers.jra import fetch_race_entries  # linebot 側(出馬表)
except Exception:
    fetch_race_entries = None
# レース表(scrapers.odds)は同名パッケージ衝突を避けるため odds-monitor venv の
# サブプロセス(list_races.py)で取得する。get_race_list() を使う。

JST = timezone(timedelta(hours=9))
JRA_VENUES = ['東京', '中山', '阪神', '京都', '中京', '新潟', '福島', '小倉', '札幌', '函館']
WD = ["月", "火", "水", "木", "金", "土", "日"]

BASE = "/opt/dlogic/odds-monitor"
OUT = os.path.join(BASE, "static_out")
RACE_DIR = os.path.join(OUT, "race")
DATA = os.path.join(BASE, "data")
ENTRIES_CACHE = os.path.join(DATA, "race_entries_full.json")
SCORE_CACHE = os.path.join(DATA, "score_cache.json")
NEEDED = os.path.join(DATA, "needed_names.json")
RACEDAY_CACHE = os.path.join(DATA, "race_days_cache.json")
SCORE_PY = "/opt/dlogic/backend/venv/bin/python"
SCORE_SCRIPT = os.path.join(BASE, "scripts/score_horses.py")
ODDS_PY = "/opt/dlogic/odds-monitor/venv/bin/python"
LIST_SCRIPT = os.path.join(BASE, "scripts/list_races.py")

BOARD_LIMIT = 120
HONMEI_MIN = 80
PREVIEW_HOUR = 11   # 前日プレビュー開始
LIVE_HOUR = 9       # 当日ライブ開始
END_HOUR = 17       # 開催終了→次へ
RACEDAY_TTL = 6 * 3600  # 未確定(False)日の再確認間隔

c = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


# ---------- 汎用 ----------
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


# ---------- レース表(サブプロセス) ----------
def get_race_list(date_str: str) -> list:
    try:
        r = subprocess.run([ODDS_PY, LIST_SCRIPT, date_str], capture_output=True, text=True, timeout=120)
        out = (r.stdout or "").strip()
        return json.loads(out) if out else []
    except Exception:
        return []


# ---------- 開催日判定(キャッシュ) ----------
_rd_cache = load_json(RACEDAY_CACHE, {})


def is_race_day(d: _date) -> bool:
    key = d.isoformat()
    rec = _rd_cache.get(key)
    now = _time.time()
    if rec and (rec.get("v") is True or (now - rec.get("ts", 0) < RACEDAY_TTL)):
        return bool(rec.get("v"))
    val = len(get_race_list(d.strftime("%Y%m%d"))) > 0
    _rd_cache[key] = {"v": val, "ts": now}
    save_json(RACEDAY_CACHE, _rd_cache)
    return val


def label_of(d: _date) -> str:
    return f"{d.month}/{d.day}({WD[d.weekday()]})"


def decide(now: datetime):
    """(target_date, mode) を返す。mode = preview|live|finished"""
    today = now.date()
    cand = [today + timedelta(days=off) for off in range(-6, 7)]
    cand = [d for d in cand if is_race_day(d)]
    cand.sort()
    if not cand:
        return today, "finished"

    def preview_start(rd: _date) -> datetime:
        prev = rd - timedelta(days=1)
        if prev in cand:  # 連続開催 → 前日の終了時刻に翌日へ
            return datetime.combine(prev, datetime.min.time(), JST).replace(hour=END_HOUR)
        return datetime.combine(rd - timedelta(days=1), datetime.min.time(), JST).replace(hour=PREVIEW_HOUR)

    chosen = None
    for rd in cand:
        if now >= preview_start(rd):
            chosen = rd
    if chosen is None:
        past = [d for d in cand if d < today]
        return (past[-1] if past else cand[0]), "finished"

    live_start = datetime.combine(chosen, datetime.min.time(), JST).replace(hour=LIVE_HOUR)
    end = datetime.combine(chosen, datetime.min.time(), JST).replace(hour=END_HOUR)
    if now < live_start:
        mode = "preview"
    elif now <= end:
        mode = "live"
    else:
        mode = "finished"
    return chosen, mode


# ---------- 出馬表 / 採点 ----------
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
                _time.sleep(0.4)
        except Exception:
            pass
    if changed:
        save_json(ENTRIES_CACHE, cache)


def run_scoring(names):
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
        "id": row.get("id"), "raceId": row.get("race_id"),
        "venue": row.get("venue") or "", "raceNumber": row.get("race_number") or 0,
        "type": stype, "horseNumber": num,
        "currOdds": d.get("curr_odds", d.get("new_fav_odds_curr")),
        "prevOdds": d.get("prev_odds", d.get("new_fav_odds_prev")),
        "changePct": d.get("change_pct"),
        "notifiedAt": to_ms(row.get("notified_at")),
        "oldFav": d.get("old_favorite"), "newFav": d.get("new_favorite"),
        "horseName": name, "grade": "", "popularity": None, "jockey": "",
        "postTime": None, "spark": None,
        "okScore": ok,
        "honmei": bool(stype == "drop" and ok is not None and ok >= HONMEI_MIN),
    }


def build_signals_for_date(target_iso, entries_cache, scores):
    rows = (c.table("odds_signals")
            .select("id,race_id,venue,race_number,signal_type,horse_number,detail,race_date,notified_at")
            .in_("venue", JRA_VENUES).eq("race_date", target_iso)
            .order("notified_at", desc=True).limit(800).execute().data) or []
    seen, out = set(), []
    for row in rows:
        key = f"{row['race_id']}:{row['horse_number']}:{row['signal_type']}"
        if key in seen:
            continue
        seen.add(key)
        out.append(sig_from_row(row, entries_cache.get(row["race_id"]), scores))
        if len(out) >= BOARD_LIMIT:
            break
    return out


def build_preview(races, entries_cache, scores):
    cards = []
    for r in sorted(races, key=lambda x: x.get("post_time") or ""):
        rid = r["race_id"]
        ent = entries_cache.get(rid) or {}
        horses = []
        for num_s, info in ent.items():
            try:
                num = int(num_s)
            except Exception:
                continue
            nm = info.get("name") if isinstance(info, dict) else info
            jk = info.get("jockey", "") if isinstance(info, dict) else ""
            horses.append({"num": num, "name": nm, "jockey": jk, "okScore": scores.get(nm)})
        horses.sort(key=lambda h: h["num"])
        cards.append({
            "raceId": rid, "venue": r.get("venue") or "", "raceNumber": r.get("race_number") or 0,
            "postTime": r.get("post_time") or "", "horses": horses,
        })
    return cards


def build_race(race_id, entries, scores):
    sig_rows = (c.table("odds_signals")
                .select("id,race_id,venue,race_number,signal_type,horse_number,detail,race_date,notified_at")
                .eq("race_id", race_id).order("notified_at", desc=True).execute().data) or []
    snap_rows = (c.table("odds_snapshots")
                 .select("snapshot_at,odds_data,venue,race_number")
                 .eq("race_id", race_id).order("snapshot_at", desc=False).limit(300).execute().data) or []

    venue = (sig_rows[0]["venue"] if sig_rows else "") or (snap_rows[0]["venue"] if snap_rows else "")
    race_number = (sig_rows[0]["race_number"] if sig_rows else 0) or (snap_rows[0]["race_number"] if snap_rows else 0)

    horses, snap_times = [], []
    if snap_rows:
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
            nm = (e or {}).get("name") or f"{num}番"
            horses.append({"num": num, "name": nm, "jockey": (e or {}).get("jockey") or "",
                           "popularity": 0, "currOdds": curr, "series": series, "okScore": scores.get(nm)})
        for i, h in enumerate(sorted(horses, key=lambda x: x["currOdds"])):
            h["popularity"] = i + 1
    else:
        # 事前情報(スナップショット無し): 出馬表のみ
        ent = entries or {}
        for num_s, info in ent.items():
            try:
                num = int(num_s)
            except Exception:
                continue
            nm = info.get("name") if isinstance(info, dict) else info
            jk = info.get("jockey", "") if isinstance(info, dict) else ""
            horses.append({"num": num, "name": nm, "jockey": jk, "popularity": 0,
                           "currOdds": 0, "series": [], "okScore": scores.get(nm)})
        horses.sort(key=lambda h: h["num"])

    signals = [sig_from_row(r, entries, scores) for r in sig_rows]
    return {
        "raceId": race_id, "venue": venue, "raceNumber": race_number,
        "grade": "", "raceName": "", "surface": "", "distance": 0,
        "nHorses": len(horses), "postTime": None,
        "snapTimes": snap_times, "horses": horses, "signals": signals,
    }


def main():
    # 手動検証用オーバーライド: KY_FORCE_DATE(YYYYMMDD)/KY_FORCE_MODE/KY_OUT
    out_dir = os.environ.get("KY_OUT", OUT)
    race_dir = os.path.join(out_dir, "race")
    os.makedirs(race_dir, exist_ok=True)
    entries_cache = load_json(ENTRIES_CACHE, {})
    now = datetime.now(JST)
    fd = os.environ.get("KY_FORCE_DATE")
    if fd:
        target = datetime.strptime(fd, "%Y%m%d").date()
        mode = os.environ.get("KY_FORCE_MODE", "preview")
    else:
        target, mode = decide(now)
    target_iso = target.isoformat()
    date_str = target.strftime("%Y%m%d")
    target_label = label_of(target)

    # 対象レース一覧(出馬表のため)。preview/全モードで取得。
    races = get_race_list(date_str)

    if mode in ("live", "finished"):
        # シグナル対象レース + 一覧の race_id の出馬表を確保
        sig_rids = [r["race_id"] for r in (c.table("odds_signals")
                    .select("race_id").in_("venue", JRA_VENUES).eq("race_date", target_iso)
                    .limit(2000).execute().data or [])]
        race_ids = list(dict.fromkeys(sig_rids + [r["race_id"] for r in races]))
    else:
        race_ids = [r["race_id"] for r in races]

    ensure_entries(race_ids, entries_cache)

    names = []
    for rid in race_ids:
        for info in (entries_cache.get(rid) or {}).values():
            nm = info.get("name") if isinstance(info, dict) else info
            if nm:
                names.append(nm)
    scores = run_scoring(names)

    if mode in ("live", "finished"):
        signals = build_signals_for_date(target_iso, entries_cache, scores)
        preview = []
    else:
        signals = []
        preview = build_preview(races, entries_cache, scores)

    live_start_ms = int(datetime.combine(target, datetime.min.time(), JST).replace(hour=LIVE_HOUR).timestamp() * 1000)
    board = {
        "targetDate": date_str, "targetLabel": target_label, "mode": mode,
        "liveStartMs": live_start_ms,
        "signals": signals, "preview": preview,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    save_json(os.path.join(out_dir, "board.json"), board)

    for rid in race_ids:
        try:
            save_json(os.path.join(race_dir, f"{rid}.json"), build_race(rid, entries_cache.get(rid), scores))
        except Exception as ex:
            print(f"  race {rid} 失敗: {ex}", flush=True)

    honmei = len([1 for s in signals if s.get("honmei")])
    print(f"[{target_label} {mode}] signals={len(signals)}(本命{honmei}) preview={len(preview)} races={len(race_ids)} @ {board['updatedAt']}", flush=True)


if __name__ == "__main__":
    main()
