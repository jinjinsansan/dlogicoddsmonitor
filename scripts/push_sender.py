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
# race_id(12桁)のトラックコード(5-6桁目)→会場。scraperのvenueは誤るためrace_idから導出。
VENUE_BY_CODE = {"01": "札幌", "02": "函館", "03": "福島", "04": "新潟", "05": "東京",
                 "06": "中山", "07": "中京", "08": "京都", "09": "阪神", "10": "小倉"}


def venue_of(race_id, fallback=""):
    try:
        return VENUE_BY_CODE.get(str(race_id)[4:6], fallback)
    except Exception:
        return fallback


BASE = "/opt/dlogic/odds-monitor"
DATA = os.path.join(BASE, "data")
VAPID_PRIV = os.path.join(DATA, "vapid_private.pem")
SENT = os.path.join(DATA, "sent_races.json")
RACES_TODAY = os.path.join(DATA, "races_today.json")
ENTRIES_CACHE = os.path.join(DATA, "race_entries_full.json")
VAPID_SUB = "mailto:goldbenchan@gmail.com"
SITE = "https://www.oddskun.com"
ALERT_MAX_MIN = 3   # 発走まで何分以内で発火するか(直前の速報オッズを掴むため発走寄りに)

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
    if cache.get("date") == ds and cache.get("races"):
        return cache["races"]
    try:
        races = fetch_jra_race_list(ds) or []
    except Exception:
        races = []
    if not races:
        # netkeibaのレース一覧は開催日が近づくまで取れない → PC-KEIBA(races_rt)へフォールバック
        iso = f"{ds[:4]}-{ds[4:6]}-{ds[6:8]}"
        try:
            rows = (c.table("races_rt").select("race_id,venue,race_number,post_time")
                    .eq("race_date", iso).execute().data) or []
            races = [{"race_id": x["race_id"], "race_number": x.get("race_number") or 0,
                      "venue": x.get("venue") or "", "post_time": x.get("post_time") or "",
                      "race_type": "jra"} for x in rows]
        except Exception:
            races = []
    if races:  # 空はキャッシュしない(後で取れたら反映させる)
        save_json(RACES_TODAY, {"date": ds, "races": races})
    return races


def biggest_drop(race_id, post_epoch):
    # 算出元 = PC-KEIBA(JRA-VAN)由来の速報オッズ odds_rt。
    # netkeibaの前売りAPIは発走直前まで凍結し「直前急落」が取れないため切替済。
    rows = (c.table("odds_rt").select("snapshot_at,odds_data")
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


_NAMES_CACHE = {}


def race_names_of(race_id):
    """race_names(PC-KEIBA由来)から 馬番→{name,jockey} を取得(1run内キャッシュ)。"""
    if race_id in _NAMES_CACHE:
        return _NAMES_CACHE[race_id]
    try:
        rows = (c.table("race_names").select("names")
                .eq("race_id", race_id).limit(1).execute().data) or []
        names = (rows[0].get("names") if rows else {}) or {}
        if isinstance(names, str):
            names = json.loads(names)
    except Exception:
        names = {}
    _NAMES_CACHE[race_id] = names
    return names


def vote_inflow(race_id, num, post_epoch):
    """votes_rt から馬num の直前資金流入(票数増・円)を算出。(inflow_votes, yen) or None。

    1票=100円。基準=発走30分前に最も近い票数、最新=末尾。純増のみ返す。
    """
    rows = (c.table("votes_rt").select("snapshot_at,votes")
            .eq("race_id", race_id).order("snapshot_at", desc=False).limit(300).execute().data) or []
    if len(rows) < 2:
        return None

    def vd(r):
        v = r.get("votes")
        if isinstance(v, str):
            try:
                v = json.loads(v)
            except Exception:
                v = {}
        return v or {}

    target = post_epoch - 1800
    base_row = min(rows, key=lambda r: abs(to_epoch(r["snapshot_at"]) - target))
    base, last = vd(base_row), vd(rows[-1])
    k = str(num)
    try:
        bv = int(base.get(k) or 0); lv = int(last.get(k) or 0)
    except Exception:
        return None
    inflow = lv - bv
    if inflow <= 0:
        return None
    return inflow, inflow * 100


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
            # まだ急落が出ていない/速報オッズ未到達 → sentに記録せず次のcronで再試行
            # (旧実装はここでsent記録し永久スキップ＝無通知の原因だった)
            continue
        # 馬名 = PC-KEIBA(jvd_se)由来の race_names を優先(オッズと馬番が一致)。
        # 無ければ netkeiba出馬表キャッシュ(番号ズレあり)→最後は馬番のみ。
        nm = (race_names_of(rid).get(str(best["num"])) or {}).get("name") or ""
        if not nm:
            ne = ((entries.get(rid) or {}).get(str(best["num"])) or {})
            nm = (ne.get("name") if isinstance(ne, dict) else ne) or ""
        horse = f"{best['num']}番" + (f" {nm}" if nm else "")
        # 資金流入(票数)= 急落の"原因"。JRA-VAN票数があるレースのみ付与。
        money = ""
        vi = vote_inflow(rid, best["num"], post_dt.timestamp())
        if vi:
            votes_in, yen = vi
            money = (f"｜資金+{votes_in:,}票(約{yen // 10000}万円)"
                     if yen >= 10000 else f"｜資金+{votes_in:,}票")
        payload = json.dumps({
            "title": f"{venue_of(rid, r.get('venue',''))}{r.get('race_number','')}R まもなく発走",
            "body": f"直前で最も急落：{horse}　{best['base']:.1f}→{best['last']:.1f}倍 ({best['pct']}%){money}",
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
        print(f"[{now.isoformat()}] sent {rid} {venue_of(rid, r.get('venue',''))}{r.get('race_number')}R -> {ok}/{len(rsubs)} ({best['num']}番 {nm} {best['pct']}%{money})", flush=True)


if __name__ == "__main__":
    main()
