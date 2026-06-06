#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scrapers/odds.py のJRAオッズ取得を、JS不要のnetkeiba JSON APIに切替える(冪等)。
Lightpanda/Playwrightはフォールバックとして残すが、通常はAPIで全件取得できる。"""
import shutil
import sys

P = "/opt/dlogic/odds-monitor/scrapers/odds.py"
src = open(P, encoding="utf-8").read()
if "_fetch_jra_odds_api" in src:
    print("already patched")
    sys.exit(0)

shutil.copy(P, P + ".bak")

NEWFUNC = '''def _fetch_jra_odds_api(race_id: str) -> dict[int, float] | None:
    """JRA単勝オッズをnetkeibaのJSON API(JS不要)で取得。ブラウザ不要で堅牢。"""
    url = f"{NETKEIBA_JRA_BASE}/api/api_get_jra_odds.html?race_id={race_id}&type=1&action=init"
    try:
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=15)
        d = resp.json()
        win = ((d.get("data") or {}).get("odds") or {}).get("1") or {}
        out = {}
        for k, v in win.items():
            try:
                num = int(k)
                val = float(v[0]) if isinstance(v, (list, tuple)) else float(v)
                if val > 0:
                    out[num] = val
            except (ValueError, TypeError, IndexError):
                continue
        return out or None
    except Exception:
        logger.debug(f"odds API failed: {race_id}", exc_info=True)
        return None


'''

# 1) API関数を挿入
src = src.replace("def _fetch_jra_odds_lightpanda(", NEWFUNC + "def _fetch_jra_odds_lightpanda(", 1)
# 2) Phase1の取得をAPIに切替
src = src.replace("pool.submit(_fetch_jra_odds_lightpanda, rid)", "pool.submit(_fetch_jra_odds_api, rid)", 1)
# 3) ログ表記
src = src.replace('f"Lightpanda: {len(results)}', 'f"OddsAPI: {len(results)}', 1)

open(P, "w", encoding="utf-8").write(src)
print("patched OK")
