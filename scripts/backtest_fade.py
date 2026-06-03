#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""案C: 「消し(危険信号)」検証 — オッズ揃え(odds-matched)で surge/drop を評価。

全馬の最終オッズ(odds_snapshots の最新)× 着順(race_results.top3)で
「オッズ帯別の着内率ベースライン」を作り、surge/drop シグナル馬の着内率と比較。
surge馬が同帯ベースラインを明確に下回れば = 危険信号(消し)として価値。

対象: JRA。Usage: python scripts/backtest_fade.py
"""
import json
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import config
from supabase import create_client

JRA_VENUES = ['東京', '中山', '阪神', '京都', '中京', '新潟', '福島', '小倉', '札幌', '函館']
PAGE = 1000


def fetch_all(c, table, select, flt=None):
    rows, start = [], 0
    while True:
        q = c.table(table).select(select)
        if flt:
            q = flt(q)
        r = q.range(start, start + PAGE - 1).execute()
        rows.extend(r.data)
        if len(r.data) < PAGE:
            break
        start += PAGE
    return rows


def band(o):
    if not o or o <= 0: return None
    if o < 5: return '1) ~5'
    if o < 10: return '2) 5-10'
    if o < 20: return '3) 10-20'
    if o < 50: return '4) 20-50'
    return '5) 50+'


def ikey(race_date, venue, race_number):
    return f"{(race_date or '').replace('-', '')}-{venue}-{race_number}"


def main():
    c = create_client(config.SUPABASE_URL, config.SUPABASE_KEY)

    # 結果 (内部キー -> top3set)
    results = fetch_all(c, 'race_results', 'race_id,winner_number,result_json',
                        flt=lambda q: q.eq('race_type', 'jra'))
    res = {}
    for r in results:
        if r.get('winner_number') is None:
            continue
        rj = r.get('result_json')
        if isinstance(rj, str):
            try: rj = json.loads(rj)
            except Exception: rj = {}
        top3 = {t['horse_number'] for t in (rj or {}).get('top3', []) if t.get('horse_number')}
        res[r['race_id']] = top3
    print(f"結果: {len(res)}レース")

    # 全JRAスナップショット -> レースごと最新の odds_data
    snaps = fetch_all(c, 'odds_snapshots', 'race_date,venue,race_number,snapshot_at,odds_data',
                      flt=lambda q: q.in_('venue', JRA_VENUES))
    latest = {}
    for s in snaps:
        k = ikey(s['race_date'], s['venue'], s['race_number'])
        if k not in latest or s['snapshot_at'] > latest[k]['snapshot_at']:
            latest[k] = s
    print(f"JRAスナップショット {len(snaps)}行 -> {len(latest)}レースの最終オッズ")

    # ベースライン: 全馬を最終オッズ帯で集計
    base = defaultdict(lambda: {'n': 0, 'place': 0})
    for k, s in latest.items():
        top3 = res.get(k)
        if top3 is None:
            continue
        od = s['odds_data']
        if isinstance(od, str):
            try: od = json.loads(od)
            except Exception: od = {}
        for num_s, o in od.items():
            b = band(o)
            if not b:
                continue
            bb = base[b]
            bb['n'] += 1
            if int(num_s) in top3:
                bb['place'] += 1

    # シグナル: surge/drop を curr_odds帯で着内率集計
    sigs = fetch_all(c, 'odds_signals',
                     'race_id,venue,race_number,signal_type,horse_number,detail,race_date',
                     flt=lambda q: q.in_('venue', JRA_VENUES))
    uniq = {}
    for s in sigs:
        uniq.setdefault((s['race_id'], s['horse_number'], s['signal_type']), s)

    sig_agg = defaultdict(lambda: {'n': 0, 'place': 0})
    for (rid, hn, st), s in uniq.items():
        k = ikey(s['race_date'], s['venue'], s['race_number'])
        top3 = res.get(k)
        if top3 is None:
            continue
        try:
            d = json.loads(s['detail']) if isinstance(s['detail'], str) else (s['detail'] or {})
            o = d.get('curr_odds') or d.get('new_fav_odds_curr') or 0
        except Exception:
            o = 0
        b = band(o)
        if not b:
            continue
        a = sig_agg[(st, b)]
        a['n'] += 1
        if hn in top3:
            a['place'] += 1

    print("\n" + "=" * 76)
    print("案C: オッズ帯別 着内率 (ベースライン vs surge vs drop) — odds-matched")
    print("=" * 76)
    print(f"{'オッズ帯':<10}{'母数':>8}{'ベース複勝':>11}{'surge複勝(n)':>16}{'drop複勝(n)':>16}")
    for b in ['1) ~5', '2) 5-10', '3) 10-20', '4) 20-50', '5) 50+']:
        bb = base[b]
        if bb['n'] == 0:
            continue
        base_pr = bb['place'] / bb['n'] * 100
        su = sig_agg.get(('surge', b), {'n': 0, 'place': 0})
        dr = sig_agg.get(('drop', b), {'n': 0, 'place': 0})
        su_pr = (su['place'] / su['n'] * 100) if su['n'] else 0
        dr_pr = (dr['place'] / dr['n'] * 100) if dr['n'] else 0
        su_diff = su_pr - base_pr
        dr_diff = dr_pr - base_pr
        print(f"{b:<10}{bb['n']:>8}{base_pr:>10.1f}%"
              f"{su_pr:>9.1f}%({su['n']:>4}){dr_pr:>9.1f}%({dr['n']:>4})")
    print("\n(surge複勝がベース複勝を下回る = 危険信号=消しの根拠 / dropが上回る = 買い)")


if __name__ == '__main__':
    main()
