# -*- coding: utf-8 -*-
"""オッズ急変ボードの対象レースの出馬表をローカル(netkeiba到達可)で取得し、
正しいUTF-8馬名のエントリキャッシュを生成 → VPSへ同期 → board再生成をトリガーする。

背景: VPSはnetkeibaにIPブロックされ shutuba(出馬表)を取得できない(HTTP 400)ため、
build_static_board の ensure_entries がVPS上では馬名を取得できない。
このPCはnetkeibaに到達できるので、PC-KEIBA feeder(run_pckeiba_feeder.bat)と同じ
「ローカル取得 → VPS同期」パターンで馬名キャッシュを肩代わりする。

タスクスケジューラから run_odds_entries_sync.bat 経由で定期実行する想定。
"""
import os
import sys
import json
import time
import subprocess
import urllib.request
from datetime import datetime

# dlogic-agent の scrapers.jra(fetch_race_entries)を使う
DLOGIC_AGENT = r"E:\dev\Cusor\dlogic-agent"
sys.path.insert(0, DLOGIC_AGENT)
from scrapers.jra import fetch_race_entries  # noqa: E402

BOARD_URL = "https://bot.dlogicai.in/kyuraku/board.json"
VPS = "root@210.131.208.243"
KEY = os.path.expanduser(r"~\.ssh\dlogic.pem")
REMOTE_CACHE = "/opt/dlogic/odds-monitor/data/race_entries_full.json"
HERE = os.path.dirname(os.path.abspath(__file__))
LOCAL_TMP = os.path.join(HERE, "_entries_sync.json")
SSH_OPTS = ["-o", "ConnectTimeout=20", "-o", "StrictHostKeyChecking=no", "-i", KEY]


def log(msg: str) -> None:
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}", flush=True)


def main() -> None:
    try:
        raw = urllib.request.urlopen(BOARD_URL, timeout=20).read()
        board = json.loads(raw)
    except Exception as ex:
        log(f"board.json取得失敗: {ex}")
        return
    rids = [r["raceId"] for r in board.get("races", []) if r.get("raceId")]
    log(f"target races: {len(rids)} (mode={board.get('mode')} {board.get('targetLabel')})")
    if not rids:
        log("対象レースなし → skip")
        return

    cache = {}
    ok = 0
    for rid in rids:
        try:
            d = fetch_race_entries(rid)
            ents = getattr(d, "entries", None) or (d.get("entries") if isinstance(d, dict) else None)
            m = {}
            for e in (ents or []):
                hn = e.get("horse_number") if isinstance(e, dict) else getattr(e, "horse_number", None)
                nm = e.get("horse_name") if isinstance(e, dict) else getattr(e, "horse_name", None)
                jk = e.get("jockey") if isinstance(e, dict) else getattr(e, "jockey", None)
                if hn and nm:
                    m[str(int(hn))] = {"name": nm, "jockey": jk or ""}
            if m:
                cache[rid] = m
                ok += 1
            time.sleep(0.5)
        except Exception as ex:
            log(f"  skip {rid}: {type(ex).__name__} {str(ex)[:60]}")

    if not cache:
        log("エントリを1件も取得できず → VPSキャッシュは変更しない(中断)")
        return

    json.dump(cache, open(LOCAL_TMP, "w", encoding="utf-8"), ensure_ascii=False)
    log(f"fetched: races_ok={ok} horses={sum(len(v) for v in cache.values())}")

    # VPSへ同期
    r1 = subprocess.run(["scp"] + SSH_OPTS + [LOCAL_TMP, f"{VPS}:{REMOTE_CACHE}"],
                        capture_output=True, text=True)
    if r1.returncode != 0:
        log(f"SCP失敗: {r1.stderr.strip()[:200]}")
        return
    log("SCP ok")

    # board再生成をトリガー(キャッシュ命中=netkeiba不要)
    try:
        r2 = subprocess.run(
            ["ssh"] + SSH_OPTS + [VPS,
             "cd /opt/dlogic/odds-monitor && /opt/dlogic/linebot/venv/bin/python scripts/build_static_board.py"],
            capture_output=True, text=True, timeout=220)
        tail = (r2.stdout or r2.stderr).strip().splitlines()
        log(f"rebuild rc={r2.returncode}: {tail[-1] if tail else ''}")
    except Exception as ex:
        log(f"rebuildトリガー失敗(cron */5で自動反映される): {ex}")

    try:
        os.remove(LOCAL_TMP)
    except OSError:
        pass


if __name__ == "__main__":
    main()
