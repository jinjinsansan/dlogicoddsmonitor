#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PC-KEIBA(JRA-VAN) の単勝オッズ速報を Supabase odds_rt へ供給する feeder。

jinさんのPC(常時起動)で Windows タスクスケジューラから 1分毎に実行する想定。
ローカル PC-KEIBA PostgreSQL(jvd_o1) の当日レースを読み、単勝オッズをデコードして
Supabase の odds_rt テーブルへ upsert(race_id, happyo で冪等)する。

netkeiba の前売りAPIは発走直前まで凍結していて「直前急落」が取れないため、
本物のJRA-VAN速報オッズ(発走前に速報1〜4回が段階配信)を push 用に供給する。

実行: python scripts/pckeiba_odds_feeder.py [--date YYYYMMDD] [--verbose]
"""
import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone, timedelta

import psycopg2
import requests
from dotenv import load_dotenv

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
load_dotenv(os.path.join(ROOT, ".env"))

from supabase import create_client

JST = timezone(timedelta(hours=9))

PCKEIBA = {
    "host": os.getenv("PCKEIBA_HOST", "127.0.0.1"),
    "port": int(os.getenv("PCKEIBA_PORT", "5432")),
    "database": os.getenv("PCKEIBA_DB", "pckeiba"),
    "user": os.getenv("PCKEIBA_USER", "postgres"),
    "password": os.getenv("PCKEIBA_PASSWORD", "postgres"),
}

# jvd_o1.keibajo_code は JRA トラックコード(netkeiba race_id 5-6桁目と同一)
JRA_CODES = {"01", "02", "03", "04", "05", "06", "07", "08", "09", "10"}
VENUE_BY_CODE = {"01": "札幌", "02": "函館", "03": "福島", "04": "新潟", "05": "東京",
                 "06": "中山", "07": "中京", "08": "京都", "09": "阪神", "10": "小倉"}

# --- PC-KEIBA 起動忘れ検知 → Telegram通知 ---
# PostgreSQLは常駐サービスなので接続では起動忘れを検知できない。リアルタイム受信を担う
# Com.Pckeiba.Database.Realtime.exe プロセスの有無で判定する。
TG_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TG_CHAT = os.getenv("TELEGRAM_CHAT_ID", "")
PCKEIBA_PROC = "Com.Pckeiba.Database.Realtime.exe"
ALERT_STATE = os.path.join(ROOT, "data", "pckeiba_alert_state.json")
ALERT_REPEAT_MIN = 30  # 起動忘れが続く間の再通知間隔(分)


def _load_state():
    try:
        return json.load(open(ALERT_STATE, encoding="utf-8"))
    except Exception:
        return {"down": False, "alerted": False, "last_alert_ts": 0}


def _save_state(st):
    os.makedirs(os.path.dirname(ALERT_STATE), exist_ok=True)
    tmp = ALERT_STATE + ".tmp"
    json.dump(st, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
    os.replace(tmp, ALERT_STATE)


def tg_send(text):
    if not TG_TOKEN or not TG_CHAT:
        return
    try:
        requests.post(f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
                      json={"chat_id": TG_CHAT, "text": text}, timeout=10)
    except Exception:
        pass


def realtime_running():
    """PC-KEIBA リアルタイム受信プロセスが動いているか。判定不能時は True(誤報回避)。"""
    try:
        out = subprocess.run(
            ["tasklist", "/FI", f"IMAGENAME eq {PCKEIBA_PROC}", "/NH"],
            capture_output=True, text=True, timeout=15,
        )
        return "Com.Pckeiba.Database.Real" in (out.stdout or "")
    except Exception:
        return True


def in_alert_window(now):
    """通知する時間帯: JRA開催の土・日の 08:00-17:00(起動忘れの実害がある時間)。"""
    return now.weekday() in (5, 6) and 8 <= now.hour < 17


def check_pckeiba_alert(now):
    """PC-KEIBA起動忘れを検知し Telegram 通知(発生時+30分毎、復旧時)。"""
    st = _load_state()
    if realtime_running():
        if st.get("alerted"):
            tg_send("✅ PC-KEIBA(リアルタイム)が復旧しました。オッズ急落くんの速報オッズ取得を再開します。")
        _save_state({"down": False, "alerted": False, "last_alert_ts": 0})
        return
    # 起動していない
    if not in_alert_window(now):
        _save_state({**st, "down": True})
        return
    nowts = now.timestamp()
    if nowts - st.get("last_alert_ts", 0) >= ALERT_REPEAT_MIN * 60:
        tg_send("⚠️ PC-KEIBA(リアルタイム)が起動していません。\n"
                "速報オッズが取れず、オッズ急落くんの急落Push と リアルタイムボードが止まります。\n"
                "PC-KEIBA を起動してください。")
        _save_state({"down": True, "alerted": True, "last_alert_ts": nowts})
    else:
        _save_state({**st, "down": True})


def decode_tansho(s: str) -> dict[str, float]:
    """jvd_o1.odds_tansho を {馬番: オッズ} にデコード。

    8文字単位: 馬番(2) + オッズ(4, /10) + 人気(2)。空欄(スペース)・0オッズは除外。
    """
    out = {}
    if not s:
        return out
    for i in range(0, len(s), 8):
        g = s[i:i + 8]
        if len(g) < 8:
            break
        uma = g[0:2].strip()
        odds = g[2:6].strip()
        if not uma.isdigit() or not odds.isdigit():
            continue
        o = int(odds) / 10.0
        if o > 0:
            out[str(int(uma))] = o
    return out


def decode_hyosu(s: str) -> dict[str, int]:
    """jvd_h1.hyosu_tansho を {馬番: 単勝票数} にデコード。

    15文字単位: 馬番(2) + 票数(11) + 人気(2)。1票=100円。空欄は除外。
    """
    out = {}
    if not s:
        return out
    for i in range(0, len(s), 15):
        g = s[i:i + 15]
        if len(g) < 15:
            break
        uma = g[0:2].strip()
        hyo = g[2:13].strip()
        if not uma.isdigit() or not hyo.isdigit():
            continue
        out[str(int(uma))] = int(hyo)
    return out


def happyo_to_snapshot_at(happyo: str, year: int) -> datetime | None:
    """'MMDDHHMM'(JST) を timezone-aware datetime(JST) に。"""
    try:
        mm = int(happyo[0:2]); dd = int(happyo[2:4])
        hh = int(happyo[4:6]); mi = int(happyo[6:8])
        return datetime(year, mm, dd, hh, mi, tzinfo=JST)
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="対象日 YYYYMMDD (既定=今日JST)")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    now = datetime.now(JST)
    # PC-KEIBA起動忘れの検知・Telegram通知(オッズ処理より先に必ず実行)
    try:
        check_pckeiba_alert(now)
    except Exception as e:
        print(f"WARN: pckeiba alert check 失敗: {e}", file=sys.stderr)

    date_str = args.date or now.strftime("%Y%m%d")
    nen, tsukihi = date_str[:4], date_str[4:8]
    year = int(nen)

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未設定 (.env)", file=sys.stderr)
        return 1
    sb = create_client(url, key)

    try:
        conn = psycopg2.connect(**PCKEIBA)
    except Exception as e:
        print(f"ERROR: PC-KEIBA 接続失敗: {e}", file=sys.stderr)
        return 1
    cur = conn.cursor()
    cur.execute(
        """
        select keibajo_code, kaisai_kai, kaisai_nichime, race_bango,
               data_kubun, happyo_tsukihi_jifun, odds_tansho
        from jvd_o1
        where kaisai_nen = %s and kaisai_tsukihi = %s
        order by keibajo_code, race_bango
        """,
        (nen, tsukihi),
    )
    rows = cur.fetchall()

    # 馬番→馬名/騎手 (jvd_se: オッズと同じ馬番体系)。race_id ごとに集約。
    cur.execute(
        """
        select keibajo_code, kaisai_kai, kaisai_nichime, race_bango,
               umaban, bamei, kishumei_ryakusho
        from jvd_se
        where kaisai_nen = %s and kaisai_tsukihi = %s
        """,
        (nen, tsukihi),
    )
    names_by_race = {}
    for code, kai, nichime, bango, umaban, bamei, kishu in cur.fetchall():
        if code not in JRA_CODES:
            continue
        uma = (str(umaban).strip() if umaban is not None else "")
        if not uma.isdigit():
            continue
        nm = (bamei or "").strip()
        if not nm:
            continue
        race_id = f"{nen}{code}{int(kai):02d}{int(nichime):02d}{int(bango):02d}"
        names_by_race.setdefault(race_id, {})[str(int(uma))] = {
            "name": nm,
            "jockey": (kishu or "").strip(),
        }

    # 単勝票数 (jvd_h1: 実際の投票数=生の資金量)。
    cur.execute(
        """
        select keibajo_code, kaisai_kai, kaisai_nichime, race_bango,
               data_kubun, hyosu_tansho, hyosu_gokei_tansho
        from jvd_h1
        where kaisai_nen = %s and kaisai_tsukihi = %s
        """,
        (nen, tsukihi),
    )
    vote_rows = cur.fetchall()

    # レース表 (jvd_ra: 当日+翌日。netkeibaのレース一覧APIは開催日が近づくまで取れないため、
    # PC-KEIBA(週末カードを事前保持)から会場/R/発走時刻を供給し preview を確実に出す)
    ra_dates = [now.strftime("%Y%m%d"), (now + timedelta(days=1)).strftime("%Y%m%d")]
    cur.execute(
        """
        select kaisai_nen, kaisai_tsukihi, keibajo_code, kaisai_kai, kaisai_nichime,
               race_bango, hasso_jikoku, kyosomei_hondai, kyosomei_ryakusho_10
        from jvd_ra
        where (kaisai_nen || kaisai_tsukihi) = any(%s)
        """,
        (ra_dates,),
    )
    race_rows = cur.fetchall()

    cur.close(); conn.close()

    payload = []
    for code, kai, nichime, bango, kubun, happyo, odds_tansho in rows:
        if code not in JRA_CODES:
            continue
        race_id = f"{nen}{code}{int(kai):02d}{int(nichime):02d}{int(bango):02d}"
        odds = decode_tansho(odds_tansho or "")
        if not odds:
            continue
        happyo = (happyo or "").strip()
        snap = happyo_to_snapshot_at(happyo, year)
        if snap is None:
            continue
        payload.append({
            "race_id": race_id,
            "happyo": happyo,
            "data_kubun": str(kubun).strip() if kubun is not None else None,
            "snapshot_at": snap.astimezone(timezone.utc).isoformat(),
            "odds_data": odds,
        })

    # 単勝票数を votes_rt へ upsert (total変化点ごと1行=純増の時系列)
    snap_utc = now.astimezone(timezone.utc).isoformat()
    vote_payload = []
    for code, kai, nichime, bango, kubun, hyosu_tansho, gokei in vote_rows:
        if code not in JRA_CODES:
            continue
        votes = decode_hyosu(hyosu_tansho or "")
        if not votes:
            continue
        try:
            total = int(str(gokei).strip())
        except Exception:
            total = sum(votes.values())
        if total <= 0:
            continue
        race_id = f"{nen}{code}{int(kai):02d}{int(nichime):02d}{int(bango):02d}"
        vote_payload.append({
            "race_id": race_id,
            "total": total,
            "snapshot_at": snap_utc,
            "data_kubun": str(kubun).strip() if kubun is not None else None,
            "votes": votes,
        })
    if vote_payload:
        try:
            sb.table("votes_rt").upsert(vote_payload, on_conflict="race_id,total",
                                        ignore_duplicates=True).execute()
        except Exception as e:
            print(f"WARN: votes_rt upsert 失敗: {e}", file=sys.stderr)

    # レース表を races_rt へ upsert (当日+翌日。preview/番組表をnetkeiba非依存に)
    race_payload = []
    for r_nen, r_tsukihi, code, kai, nichime, bango, hasso, hondai, ryaku in race_rows:
        if code not in JRA_CODES:
            continue
        rid = f"{r_nen}{code}{int(kai):02d}{int(nichime):02d}{int(bango):02d}"
        hh = (str(hasso).strip() if hasso is not None else "")
        post = f"{hh[:2]}:{hh[2:4]}" if len(hh) >= 4 and hh[:4].isdigit() else ""
        rnm = (str(hondai).strip() if hondai else "") or (str(ryaku).strip() if ryaku else "")
        race_payload.append({
            "race_id": rid,
            "race_date": f"{r_nen}-{r_tsukihi[:2]}-{r_tsukihi[2:]}",
            "venue": VENUE_BY_CODE.get(code, ""),
            "race_number": int(bango) if str(bango).isdigit() else None,
            "post_time": post,
            "race_name": rnm,
        })
    if race_payload:
        try:
            sb.table("races_rt").upsert(race_payload, on_conflict="race_id").execute()
        except Exception as e:
            print(f"WARN: races_rt upsert 失敗: {e}", file=sys.stderr)

    # 馬名マップを race_names へ upsert (馬名は不変なので race_id ごと1行)
    if names_by_race:
        name_payload = [
            {"race_id": rid, "names": nm} for rid, nm in names_by_race.items()
        ]
        try:
            sb.table("race_names").upsert(name_payload, on_conflict="race_id").execute()
        except Exception as e:
            print(f"WARN: race_names upsert 失敗: {e}", file=sys.stderr)

    if not payload:
        if args.verbose:
            print(f"[{now:%H:%M:%S}] {date_str}: 対象オッズなし (馬名{len(names_by_race)}R / レース表{len(race_payload)})")
        return 0

    try:
        sb.table("odds_rt").upsert(payload, on_conflict="race_id,happyo").execute()
    except Exception as e:
        print(f"ERROR: Supabase upsert 失敗: {e}", file=sys.stderr)
        return 1

    if args.verbose:
        kubuns = {}
        for p in payload:
            kubuns[p["data_kubun"]] = kubuns.get(p["data_kubun"], 0) + 1
        print(f"[{now:%H:%M:%S}] upsert odds {len(payload)}件 {kubuns} / 票数 {len(vote_payload)}R / 馬名 {len(names_by_race)}R / レース表 {len(race_payload)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
