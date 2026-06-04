#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""指定日(YYYYMMDD)のJRAレース一覧をJSONで出力。odds-monitor venv で実行。

build_static_board.py(linebot venv) は scrapers.jra(出馬表) を使うため、
同名パッケージ衝突で scrapers.odds(レース表) を直接importできない。
そこでレース表取得はこのスクリプトをサブプロセスで呼んで分離する。

Usage: /opt/dlogic/odds-monitor/venv/bin/python scripts/list_races.py 20260607
"""
import json
import sys

sys.path.insert(0, "/opt/dlogic/odds-monitor")
from scrapers.odds import fetch_jra_race_list


def main():
    if len(sys.argv) < 2:
        print("[]")
        return
    try:
        races = fetch_jra_race_list(sys.argv[1]) or []
    except Exception:
        races = []
    print(json.dumps(races, ensure_ascii=False))


if __name__ == "__main__":
    main()
