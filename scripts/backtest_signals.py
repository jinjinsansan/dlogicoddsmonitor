#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""JRA オッズ急変シグナル バックテスト (Phase 0 有効性検証).

odds_signals を race_results と照合し、シグナル種別ごとの
- 単勝: 的中率 + 回収率 (win_payout列は信頼可)
- 複勝: 着3内率 (result_json.top3 は信頼可)。※複勝配当は result_json.payouts が
  壊れているため回収率は別途再取得が必要。本スクリプトは「着内率 vs ベースライン」を出す。

対象: JRA (venue判定)。重複排除: (race_id, horse_number, signal_type)。
Usage: python scripts/backtest_signals.py
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


def odds_band(s):
    try:
        d = json.loads(s['detail']) if isinstance(s['detail'], str) else (s['detail'] or {})
        o = d.get('curr_odds') or d.get('new_fav_odds_curr') or 0
    except Exception:
        o = 0
    if o <= 0: return '不明'
    if o < 5: return '1) ~5'
    if o < 10: return '2) 5-10'
    if o < 20: return '3) 10-20'
    if o < 50: return '4) 20-50'
    return '5) 50+'


def main():
    c = create_client(config.SUPABASE_URL, config.SUPABASE_KEY)

    results = fetch_all(
        c, 'race_results', 'race_id,winner_number,win_payout,result_json',
        flt=lambda q: q.eq('race_type', 'jra'),
    )
    res_map = {}
    for r in results:
        if r.get('winner_number') is None:
            continue
        rj = r.get('result_json')
        if isinstance(rj, str):
            try: rj = json.loads(rj)
            except Exception: rj = {}
        top3 = {t['horse_number'] for t in (rj or {}).get('top3', []) if t.get('horse_number')}
        res_map[r['race_id']] = {
            'winner': r['winner_number'],
            'payout': r.get('win_payout') or 0,
            'top3': top3,
            'field': (rj or {}).get('total_horses') or 0,
        }
    print(f"JRA race_results: {len(results)}行, 着順確定 {len(res_map)}レース")

    def result_for(s):
        if s['race_id'] in res_map:
            return res_map[s['race_id']]
        rd = (s.get('race_date') or '').replace('-', '')
        return res_map.get(f"{rd}-{s.get('venue')}-{s.get('race_number')}")

    sigs = fetch_all(
        c, 'odds_signals', 'race_id,venue,race_number,signal_type,horse_number,detail,race_date',
        flt=lambda q: q.in_('venue', JRA_VENUES),
    )
    print(f"JRAシグナル: {len(sigs)}件")

    uniq = {}
    for s in sigs:
        key = (s['race_id'], s['horse_number'], s['signal_type'])
        uniq.setdefault(key, s)
    print(f"重複排除後: {len(uniq)}ベット\n")

    # 集計: 種別ごと
    agg = defaultdict(lambda: {'n': 0, 'win': 0, 'win_pay': 0, 'place': 0, 'base': 0.0})
    band = defaultdict(lambda: {'n': 0, 'win': 0, 'win_pay': 0, 'place': 0, 'base': 0.0})

    for (rid, hn, st), s in uniq.items():
        res = result_for(s)
        if not res:
            continue
        won = (hn == res['winner'])
        placed = (hn in res['top3']) if res['top3'] else won
        field = res['field'] or 0
        base_place = (3.0 / field) if field >= 4 else 0.0  # ランダム着内率の目安

        for bucket in (agg[st], band[(st, odds_band(s))]):
            bucket['n'] += 1
            bucket['base'] += base_place
            if won:
                bucket['win'] += 1
                bucket['win_pay'] += res['payout']
            if placed:
                bucket['place'] += 1

    print("=" * 72)
    print("JRA オッズ急変シグナル バックテスト")
    print("=" * 72)
    print(f"{'種別':<9}{'n':>6}{'単勝率':>8}{'単回収':>8}{'複勝率':>8}{'複ベース':>9}{'複勝差':>8}")
    for st in ['drop', 'surge', 'reversal']:
        a = agg.get(st)
        if not a or a['n'] == 0:
            print(f"{st:<9} (no data)"); continue
        wr = a['win'] / a['n'] * 100
        rec = a['win_pay'] / (a['n'] * 100) * 100
        pr = a['place'] / a['n'] * 100
        bp = a['base'] / a['n'] * 100
        print(f"{st:<9}{a['n']:>6}{wr:>7.1f}%{rec:>7.1f}%{pr:>7.1f}%{bp:>8.1f}%{pr-bp:>+7.1f}%")

    print("\n--- オッズ帯別 (複勝率 vs ベースライン) ---")
    print(f"{'種別/帯':<18}{'n':>6}{'複勝率':>8}{'複ベース':>9}{'差':>8}{'単回収':>8}")
    for (st, b) in sorted(band.keys()):
        d = band[(st, b)]
        if d['n'] < 20:
            continue
        pr = d['place'] / d['n'] * 100
        bp = d['base'] / d['n'] * 100
        rec = d['win_pay'] / (d['n'] * 100) * 100
        print(f"{st+'/'+b:<18}{d['n']:>6}{pr:>7.1f}%{bp:>8.1f}%{pr-bp:>+7.1f}%{rec:>7.1f}%")

    # === Round2: drop を 変動幅(change_pct) × オッズ帯 で切る(利益ニッチ探索) ===
    def chg_pct(s):
        try:
            d = json.loads(s['detail']) if isinstance(s['detail'], str) else (s['detail'] or {})
            return d.get('change_pct')
        except Exception:
            return None

    def mag_band(p):
        if p is None: return '?'
        ap = abs(p)
        if ap < 30: return 'a)20-30'
        if ap < 40: return 'b)30-40'
        if ap < 50: return 'c)40-50'
        return 'd)50+'

    mag = defaultdict(lambda: {'n': 0, 'win': 0, 'win_pay': 0, 'place': 0})
    for (rid, hn, st), s in uniq.items():
        if st != 'drop':
            continue
        res = result_for(s)
        if not res:
            continue
        cell = (mag_band(chg_pct(s)), odds_band(s))
        m = mag[cell]
        m['n'] += 1
        if hn == res['winner']:
            m['win'] += 1
            m['win_pay'] += res['payout']
        if (hn in res['top3']) if res['top3'] else (hn == res['winner']):
            m['place'] += 1

    print("\n--- drop: 変動幅 × オッズ帯 (単勝回収率, n>=15) ---")
    print(f"{'幅/オッズ':<22}{'n':>5}{'単勝率':>8}{'単回収':>8}{'複勝率':>8}")
    for cell in sorted(mag.keys()):
        m = mag[cell]
        if m['n'] < 15:
            continue
        wr = m['win'] / m['n'] * 100
        rec = m['win_pay'] / (m['n'] * 100) * 100
        pr = m['place'] / m['n'] * 100
        flag = '  <<<' if rec >= 90 else ''
        print(f"{cell[0]+' '+cell[1]:<22}{m['n']:>5}{wr:>7.1f}%{rec:>7.1f}%{pr:>7.1f}%{flag}")


if __name__ == '__main__':
    main()
