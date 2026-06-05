#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""急騰急落オッズくん / netkeita の稼働状況を公開エンドポイントから確認して整形出力。
Hermesが実行し、出力をそのまま日本語で報告する。調査・報告のみ(修正はしない)。"""
import json
import ssl
import urllib.request
from datetime import datetime, timezone

KNOWN = {"東京", "中山", "阪神", "京都", "中京", "新潟", "福島", "小倉", "札幌", "函館",
         "大井", "川崎", "船橋", "浦和", "園田", "姫路", "名古屋", "笠松",
         "高知", "佐賀", "水沢", "盛岡", "門別", "帯広", "金沢"}
_ctx = ssl.create_default_context()


def get(url, asjson=True):
    req = urllib.request.Request(url, headers={"User-Agent": "hermes-dlogic"})
    with urllib.request.urlopen(req, timeout=15, context=_ctx) as r:
        b = r.read()
        return r.status, (json.loads(b) if asjson else b)


def age_min(iso):
    try:
        s = str(iso).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).total_seconds() / 60
    except Exception:
        return None


def has_sur(s):
    return any(0xD800 <= ord(c) <= 0xDFFF for c in str(s))


def main():
    lines = ["📊 dlogic 稼働チェック"]

    # オッズくん
    try:
        _, d = get("https://bot.dlogicai.in/kyuraku/board.json")
        a = age_min(d.get("updatedAt"))
        fresh = "🟢" if (a is not None and a < 20) else "🔴(更新停止の疑い)"
        lines.append(f"・オッズくん: {d.get('targetLabel','')} [{d.get('mode','')}] "
                     f"更新{(a if a is not None else -1):.0f}分前{fresh} / 急変{len(d.get('signals',[]))}件・レース{len(d.get('races',[]))}件")
    except Exception as e:
        lines.append(f"・オッズくん: 取得失敗🔴 ({e})")

    # netkeita
    try:
        _, d = get("https://bot.dlogicai.in/nk/api/races")
        rs = d.get("races", [])
        venues = set(r.get("venue", "") for r in rs)
        unknown = [v for v in venues if v and v not in KNOWN]
        bad = any(has_sur(r.get("race_name", "")) or has_sur(r.get("venue", "")) for r in rs)
        moji = "🔴文字化け疑い" if (bad or unknown) else "🟢"
        extra = f" 未知会場={unknown[:3]}" if unknown else ""
        lines.append(f"・netkeita: {d.get('date','')} {len(rs)}レース 文字化け{moji}{extra}")
    except Exception as e:
        lines.append(f"・netkeita: 取得失敗🔴 ({e})")

    # 公開サイト
    for name, url in [("oddskun.com", "https://www.oddskun.com/"),
                      ("netkeita.com", "https://www.netkeita.com/")]:
        try:
            st, _ = get(url, asjson=False)
            lines.append(f"・{name}: HTTP{st} {'🟢' if st < 500 else '🔴'}")
        except Exception:
            lines.append(f"・{name}: 接続失敗🔴")

    lines.append("(これは手動確認。15分毎のVPS常時監視が別途Telegramへ自動通知します)")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
