#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""追跡レースの発走直前(約4分前)に「最も急落した馬」をWeb Pushで通知。

cron */1 で実行(odds-monitor venv)。購読者がいるレースのみ処理。
- 基準点 = 発走30分前に最も近いスナップショット
- 直前急落 = (基準→最新)で最も下落した1頭
- 通知手段 = Web Push(無料)。LINE通知はしない。

実行: /opt/dlogic/odds-monitor/venv/bin/python /opt/dlogic/odds-monitor/scripts/push_sender.py
"""
import json
import os
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, "/opt/dlogic/odds-monitor")

ENV = "/opt/dlogic/odds-monitor/.env"
for line in open(ENV, encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"'))

from supabase import create_client
from pywebpush import webpush, WebPushException
from scrapers.odds import fetch_jra_race_list

JST = timezone(timedelta(hours=9))
BASE = "/opt/dlogic/odds-monitor"
DATA = os.path.join(BASE, "data")
VAPID_PRIV = os.path.join(DATA, "vapid_private.pem")
SENT = os.path.join(DATA, "sent_races.json")
RACES_TODAY = os.path.join(DATA, "races_today.json")
ENTRIES_CACHE = os.path.join(DATA, "race_entries_full.json")
VAPID_SUB = "mailto:goldbenchan@gmail.com"
SITE = "https://www.oddskun.com"
ALERT_MAX_MIN = 5   # 発走まで何分以内で発火するか(≒4分前)

c = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def load_json(p, d):
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception:
        return d


def save_json(p, o):
    tmp = p + ".tmp"
    json.dump(o, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
    os.replace(tmp, p)


def to_epoch(iso):
    try:
        s = str(iso).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return 0


def race_list_today(now):
    ds = now.strftime("%Y%m%d")
    cache = load_json(RACES_TODAY, {})
    if cache.get("date") == ds:
        return cache.get("races", [])
    try:
        races = fetch_jra_race_list(ds) or []
    except Exception:
        races = []
    save_json(RACES_TODAY, {"date": ds, "races": races})
    return races


def biggest_drop(race_id, post_epoch):
    rows = (c.table("odds_snapshots").select("snapshot_at,odds_data")
            .eq("race_id", race_id).order("snapshot_at", desc=False).limit(300).execute().data) or []
    if len(rows) < 2:
        return None
    def od(r):
        x = r.get("odds_data")
        if isinstance(x, str):
            try:
                x = json.loads(x)
            except Exception:
                x = {}
        return x or {}
    # 基準=post-30分に最も近い / 最新=末尾
    target = post_epoch - 1800
    base_row = min(rows, key=lambda r: abs(to_epoch(r["snapshot_at"]) - target))
    base, last = od(base_row), od(rows[-1])
    best = None
    for k, lv in last.items():
        try:
            lo = float(lv); bo = float(base.get(k) or 0)
        except Exception:
            continue
        if lo > 0 and bo > 0:
            pct = (lo - bo) / bo * 100.0
            if pct < 0 and (best is None or pct < best["pct"]):
                best = {"num": int(k) if str(k).lstrip("-").isdigit() else k, "base": bo, "last": lo, "pct": round(pct, 1)}
    return best


def main():
    now = datetime.now(JST)
    if not (8 <= now.hour <= 18):
        return
    subs = (c.table("push_subscriptions").select("endpoint,p256dh,auth,race_id").limit(5000).execute().data) or []
    if not subs:
        return
    by_race = {}
    for s in subs:
        by_race.setdefault(s["race_id"], []).append(s)

    races = {r["race_id"]: r for r in race_list_today(now)}
    sent = load_json(SENT, {})
    entries = load_json(ENTRIES_CACHE, {})

    for rid, rsubs in by_race.items():
        if rid in sent or rid not in races:
            continue
        r = races[rid]
        pt = r.get("post_time") or ""
        try:
            hh, mm = pt.split(":")
            post_dt = now.replace(hour=int(hh), minute=int(mm), second=0, microsecond=0)
        except Exception:
            continue
        mins = (post_dt - now).total_seconds() / 60.0
        if not (0 <= mins <= ALERT_MAX_MIN):
            continue
        best = biggest_drop(rid, post_dt.timestamp())
        if not best:
            sent[rid] = now.isoformat(); save_json(SENT, sent); continue
        name = ((entries.get(rid) or {}).get(str(best["num"])) or {})
        nm = name.get("name") if isinstance(name, dict) else (name or f"{best['num']}番")
        payload = json.dumps({
            "title": f"{r.get('venue','')}{r.get('race_number','')}R まもなく発走",
            "body": f"直前で最も急落：{best['num']}番 {nm}　{best['base']:.1f}→{best['last']:.1f}倍 ({best['pct']}%)",
            "url": f"{SITE}/race/{rid}",
            "tag": f"ky-{rid}",
        }, ensure_ascii=False)

        ok = 0
        for s in rsubs:
            try:
                webpush(
                    subscription_info={"endpoint": s["endpoint"], "keys": {"p256dh": s["p256dh"], "auth": s["auth"]}},
                    data=payload,
                    vapid_private_key=VAPID_PRIV,
                    vapid_claims={"sub": VAPID_SUB},
                )
                ok += 1
            except WebPushException as ex:
                code = getattr(getattr(ex, "response", None), "status_code", None)
                if code in (404, 410):  # 失効購読は削除
                    try:
                        c.table("push_subscriptions").delete().eq("endpoint", s["endpoint"]).execute()
                    except Exception:
                        pass
            except Exception:
                pass
        sent[rid] = now.isoformat()
        save_json(SENT, sent)
        print(f"[{now.isoformat()}] sent {rid} {r.get('venue')}{r.get('race_number')}R -> {ok}/{len(rsubs)} ({best['num']}番 {nm} {best['pct']}%)", flush=True)


if __name__ == "__main__":
    main()
