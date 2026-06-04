#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""「オッズくん指数」の計算。backend venv で実行(エンジンを直接import)。

- 入力: needed_names.json (採点したい馬名の配列)
- 出力: score_cache.json {馬名: 指数(0-100, ナレッジ無しはnull)}
- 既にキャッシュ済みの名前は再計算しない。未計算が0なら**エンジンを読み込まず即終了**(軽量)。
- ※ブランド名は出さない方針。中身はD-Logicエンジンだが出力は「オッズくん指数」として扱う。

実行(VPS, cronから build_static_board.py が呼ぶ):
  /opt/dlogic/backend/venv/bin/python /opt/dlogic/odds-monitor/scripts/score_horses.py
"""
import json
import os
import sys

DATA = "/opt/dlogic/odds-monitor/data"
CACHE = os.path.join(DATA, "score_cache.json")
NEEDED = os.path.join(DATA, "needed_names.json")


def load(p, default):
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception:
        return default


def main():
    cache = load(CACHE, {})
    needed = load(NEEDED, [])
    missing = [n for n in dict.fromkeys(needed) if n and n not in cache]
    if not missing:
        print("score_horses: 未計算なし(skip)", flush=True)
        return

    sys.path.insert(0, "/opt/dlogic/backend")
    from services.fast_dlogic_engine import fast_engine_instance as fe  # noqa

    done = 0
    for nm in missing:
        val = None
        try:
            r = fe.analyze_single_horse(nm)
            if r.get("data_source") == "knowledge_base":  # ナレッジヒットのみ採用
                ts = r.get("total_score")
                if ts is not None:
                    val = round(float(ts), 1)
        except Exception:
            val = None
        cache[nm] = val
        done += 1

    os.makedirs(DATA, exist_ok=True)
    tmp = CACHE + ".tmp"
    json.dump(cache, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
    os.replace(tmp, CACHE)
    hit = len([1 for v in cache.values() if v is not None])
    print(f"score_horses: 計算 {done} / キャッシュ {len(cache)}(ナレッジ有 {hit})", flush=True)


if __name__ == "__main__":
    main()
