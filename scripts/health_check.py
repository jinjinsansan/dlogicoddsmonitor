#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""dlogic/オッズくん/netkeita の常時ヘルスチェック → Telegram通知。

VPS上で cron 実行(PC非依存=24時間)。異常時のみ通知＋復旧通知、毎日サマリー。
チェック項目:
  - systemd サービス生存
  - HTTP /health (backend/linebot/netkeita-api) と公開JSON/API
  - オッズくん board.json の鮮度・件数
  - netkeita プリフェッチの件数・会場妥当性・文字化け(サロゲート/未知会場)検査
  - 開催日(土日)日中の急変生成ライブネス(=Lightpanda生存)

実行(VPS, cron):
  /opt/dlogic/odds-monitor/venv/bin/python /opt/dlogic/odds-monitor/scripts/health_check.py
"""
import os
import sys
import json
import glob
import time
import ssl
import subprocess
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone, timedelta

JST = timezone(timedelta(hours=9))
BASE = "/opt/dlogic/odds-monitor"
STATE = os.path.join(BASE, "data", "health_state.json")
PREFETCH_DIR = "/opt/dlogic/linebot/data/prefetch"
REMIND_SEC = 2 * 3600       # 継続障害の再通知間隔
BOARD_STALE_MIN = 20        # board.json がこれ以上古いと異常
SIGNAL_STALE_MIN = 45       # 開催日日中、急変がこれ以上来てないと異常
DIGEST_HOUR = 22            # 日次サマリーの時刻(JST)

# .env (Telegram + Supabase)
for line in open(os.path.join(BASE, ".env"), encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"'))

TG_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TG_CHAT = os.environ.get("TELEGRAM_CHAT_ID", "")

SERVICES = ["dlogic-odds-monitor", "dlogic-backend", "dlogic-linebot", "netkeita-api", "nginx", "redis-server"]
HTTP_CHECKS = [
    ("backend:8000", "http://127.0.0.1:8000/health"),
    ("linebot:5000", "http://127.0.0.1:5000/health"),
    ("netkeita-api:5002", "http://127.0.0.1:5002/health"),
    ("oddskun board.json", "https://bot.dlogicai.in/kyuraku/board.json"),
    ("netkeita /nk/api/races", "https://bot.dlogicai.in/nk/api/races"),
]
JRA_VENUES = {"東京", "中山", "阪神", "京都", "中京", "新潟", "福島", "小倉", "札幌", "函館"}
NAR_VENUES = {"大井", "川崎", "船橋", "浦和", "園田", "姫路", "名古屋", "笠松", "高知", "佐賀", "水沢", "盛岡", "門別", "帯広", "金沢"}
KNOWN_VENUES = JRA_VENUES | NAR_VENUES

_ctx = ssl.create_default_context()


def tg_send(text):
    if not TG_TOKEN or not TG_CHAT:
        print("TG未設定:", text); return
    try:
        data = urllib.parse.urlencode({"chat_id": TG_CHAT, "text": text, "parse_mode": "HTML"}).encode()
        urllib.request.urlopen(f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage", data=data, timeout=15)
    except Exception as e:
        print("TG送信失敗:", e)


def http_ok(url):
    # 到達できれば生存とみなす(4xxでもサーバは生きている)。接続不可/5xx/タイムアウトのみ異常。
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "dlogic-health"})
        with urllib.request.urlopen(req, timeout=15, context=_ctx) as r:
            return r.status < 500, r.read(200000)
    except urllib.error.HTTPError as e:
        return e.code < 500, str(e).encode()
    except Exception as e:
        return False, str(e).encode()


def has_surrogate(s):
    return any(0xD800 <= ord(ch) <= 0xDFFF for ch in str(s))


def to_age_min(iso):
    try:
        s = str(iso).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).total_seconds() / 60.0
    except Exception:
        return 9999


def run_checks(now):
    results = []  # (name, ok, detail)

    # systemd
    for s in SERVICES:
        try:
            out = subprocess.run(["systemctl", "is-active", s], capture_output=True, text=True, timeout=10).stdout.strip()
        except Exception:
            out = "error"
        results.append((f"svc:{s}", out == "active", out))

    # HTTP
    board_bytes = None
    races_bytes = None
    for name, url in HTTP_CHECKS:
        ok, body = http_ok(url)
        results.append((f"http:{name}", ok, "200" if ok else body[:120].decode("utf-8", "replace")))
        if "board.json" in name and ok:
            board_bytes = body
        if "/nk/api/races" in name and ok:
            races_bytes = body

    # board.json 鮮度・件数
    if board_bytes:
        try:
            d = json.loads(board_bytes)
            age = to_age_min(d.get("updatedAt"))
            nraces = len(d.get("races", []))
            ok = age <= BOARD_STALE_MIN and nraces > 0
            results.append(("oddskun:freshness", ok, f"{d.get('targetLabel','')} {d.get('mode','')} age={age:.0f}分 races={nraces}"))
        except Exception as e:
            results.append(("oddskun:freshness", False, f"parse error {e}"))

    # netkeita /nk/api/races 文字化け・会場妥当性
    if races_bytes:
        try:
            d = json.loads(races_bytes)
            rs = d.get("races", [])
            bad = [r for r in rs if has_surrogate(r.get("race_name", "")) or has_surrogate(r.get("venue", ""))]
            venues = set(r.get("venue", "") for r in rs)
            unknown = [v for v in venues if v and v not in KNOWN_VENUES]
            ok = len(rs) > 0 and not bad and not unknown
            detail = f"date={d.get('date')} count={len(rs)}"
            if bad: detail += f" 文字化け{len(bad)}件"
            if unknown: detail += f" 未知会場={unknown[:3]}"
            results.append(("netkeita:sanity", ok, detail))
        except Exception as e:
            results.append(("netkeita:sanity", False, f"parse error {e}"))

    # プリフェッチ(最新ファイル)のサニティ
    files = sorted(glob.glob(os.path.join(PREFETCH_DIR, "races_*.json")))
    if files:
        try:
            pf = json.load(open(files[-1], encoding="utf-8"))
            rs = pf.get("races", [])
            bad = sum(1 for r in rs if has_surrogate(r.get("race_name", "")) or has_surrogate(r.get("venue", "")))
            venues = set(r.get("venue", "") for r in rs)
            unknown = [v for v in venues if v and v not in KNOWN_VENUES]
            ok = len(rs) > 0 and bad == 0 and not unknown
            results.append(("prefetch:sanity", ok, f"{os.path.basename(files[-1])} races={len(rs)} 化け={bad} 未知={unknown[:2]}"))
        except Exception as e:
            results.append(("prefetch:sanity", False, f"read error {e}"))
    else:
        results.append(("prefetch:sanity", False, "prefetchファイル無し"))

    # 開催日(土日)日中の急変ライブネス
    if now.weekday() >= 5 and 9 <= now.hour <= 17:
        try:
            from supabase import create_client
            c = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
            today_iso = now.date().isoformat()
            r = (c.table("odds_signals").select("notified_at")
                 .in_("venue", list(JRA_VENUES)).eq("race_date", today_iso)
                 .order("notified_at", desc=True).limit(1).execute().data)
            if r:
                age = to_age_min(r[0]["notified_at"])
                results.append(("oddskun:live", age <= SIGNAL_STALE_MIN, f"最新急変 {age:.0f}分前"))
            else:
                results.append(("oddskun:live", False, "本日のJRA急変が0件(Lightpanda要確認)"))
        except Exception as e:
            results.append(("oddskun:live", False, f"確認失敗 {e}"))

    return results


def main():
    now = datetime.now(JST)
    try:
        state = json.load(open(STATE, encoding="utf-8"))
    except Exception:
        state = {}

    results = run_checks(now)
    alerts, recovers = [], []
    for name, ok, detail in results:
        prev = state.get(name, {"ok": True, "last_alert": 0})
        if not ok:
            if prev["ok"] or (time.time() - prev.get("last_alert", 0) > REMIND_SEC):
                alerts.append(f"❌ {name}: {detail}")
                prev["last_alert"] = time.time()
        elif not prev["ok"]:
            recovers.append(f"✅ {name}: 復旧 ({detail})")
        prev["ok"] = ok
        state[name] = prev

    msg = []
    if alerts:
        msg.append("<b>🚨 障害検知</b>\n" + "\n".join(alerts))
    if recovers:
        msg.append("<b>復旧</b>\n" + "\n".join(recovers))
    if msg:
        tg_send(f"[dlogic監視 {now:%m/%d %H:%M}]\n" + "\n\n".join(msg))

    # 日次サマリー
    digest_key = now.strftime("%Y%m%d")
    if now.hour == DIGEST_HOUR and state.get("_last_digest") != digest_key:
        ng = [f"  ❌ {n}: {d}" for n, ok, d in results if not ok]
        head = "全システム正常 ✅" if not ng else f"異常 {len(ng)}件 ⚠️"
        body = "\n".join([f"  ✅ {n}" for n, ok, d in results if ok][:0])  # 正常は省略
        summary = (f"<b>📋 dlogic 日次レポート {now:%m/%d}</b>\n{head}\n"
                   f"・チェック {len(results)}項目 / 正常 {sum(1 for _,ok,_ in results if ok)}\n"
                   + ("\n".join(ng) if ng else "・問題なし"))
        tg_send(summary)
        state["_last_digest"] = digest_key

    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    tmp = STATE + ".tmp"
    json.dump(state, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
    os.replace(tmp, STATE)

    ng = sum(1 for _, ok, _ in results if not ok)
    print(f"[{now:%H:%M}] checks={len(results)} NG={ng} alerts={len(alerts)} recover={len(recovers)}", flush=True)


if __name__ == "__main__":
    main()
