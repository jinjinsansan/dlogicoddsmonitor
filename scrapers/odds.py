"""Odds scraping for JRA (Lightpanda + Playwright fallback) and NAR (HTTP)."""

import logging
import re
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from bs4 import BeautifulSoup

from config import NETKEIBA_JRA_BASE, NETKEIBA_NAR_BASE

logger = logging.getLogger(__name__)

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

LIGHTPANDA_BIN = shutil.which("lightpanda") or "/usr/local/bin/lightpanda"
LIGHTPANDA_WORKERS = 6
LIGHTPANDA_TIMEOUT = 20  # seconds per page


# ---------------------------------------------------------------------------
# NAR: HTTP scraping (odds in static HTML)
# ---------------------------------------------------------------------------

def fetch_nar_odds(race_id: str) -> dict[int, float] | None:
    """Fetch NAR odds via HTTP scraping. Returns {horse_number: odds}."""
    url = f"{NETKEIBA_NAR_BASE}/race/shutuba.html?race_id={race_id}"
    try:
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=15)
        resp.encoding = "euc-jp"
        soup = BeautifulSoup(resp.text, "lxml")
    except Exception:
        logger.debug(f"NAR fetch failed: {race_id}", exc_info=True)
        return None

    odds_map = {}
    for tr in soup.select("tr.HorseList"):
        tds = tr.select("td")
        if len(tds) < 2:
            continue
        num_text = tds[1].get_text(strip=True)
        if not num_text.isdigit():
            continue
        horse_num = int(num_text)

        odds_val = None
        odds_span = tr.select_one("span.Odds_Ninki")
        if odds_span:
            try:
                odds_val = float(odds_span.get_text(strip=True))
            except ValueError:
                pass

        if odds_val is None:
            pop_td = tr.select_one("td.Txt_R.Popular")
            if pop_td:
                m = re.search(r"(\d+\.?\d*)", pop_td.get_text(strip=True))
                if m:
                    try:
                        odds_val = float(m.group(1))
                    except ValueError:
                        pass

        if odds_val is not None:
            odds_map[horse_num] = odds_val

    return odds_map if odds_map else None


def fetch_nar_odds_batch(race_ids: list[str]) -> dict[str, dict[int, float]]:
    """Fetch odds for multiple NAR races."""
    results = {}
    for race_id in race_ids:
        odds = fetch_nar_odds(race_id)
        if odds:
            results[race_id] = odds
    return results


# ---------------------------------------------------------------------------
# JRA: Lightpanda (fast, parallel) + Playwright fallback
# ---------------------------------------------------------------------------

def _parse_odds_from_html(html: str) -> dict[int, float]:
    """Extract odds from HTML containing span[id^=odds-1_] elements."""
    odds_map = {}
    for m in re.finditer(r'odds-1_(\d+)"[^>]*>([\d.]+)', html):
        try:
            odds_map[int(m.group(1))] = float(m.group(2))
        except ValueError:
            pass
    return odds_map


def _fetch_jra_odds_lightpanda(race_id: str) -> dict[int, float] | None:
    """Fetch a single JRA race's odds using Lightpanda."""
    url = f"{NETKEIBA_JRA_BASE}/race/shutuba.html?race_id={race_id}"
    try:
        result = subprocess.run(
            [LIGHTPANDA_BIN, "fetch", "--dump", "html",
             "--http_timeout", str(LIGHTPANDA_TIMEOUT * 1000), url],
            capture_output=True, text=True,
            timeout=LIGHTPANDA_TIMEOUT + 10,
        )
        odds = _parse_odds_from_html(result.stdout)
        return odds if odds else None
    except Exception:
        logger.debug(f"Lightpanda fetch failed: {race_id}", exc_info=True)
        return None


def _fetch_jra_odds_playwright_batch(race_ids: list[str]) -> dict[str, dict[int, float]]:
    """Fetch odds for JRA races using Playwright (reliable fallback)."""
    if not race_ids:
        return {}

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        logger.error("playwright not installed")
        return {}

    results = {}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            for race_id in race_ids:
                url = f"{NETKEIBA_JRA_BASE}/race/shutuba.html?race_id={race_id}"
                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=20000)
                    page.wait_for_function(
                        """() => {
                            const spans = document.querySelectorAll("span[id^=odds-1_]");
                            return spans.length > 0 && spans[0].textContent.trim() !== "---.-";
                        }""",
                        timeout=10000,
                    )

                    odds_map = {}
                    for span in page.query_selector_all("span[id^=odds-1_]"):
                        span_id = span.get_attribute("id") or ""
                        text = span.inner_text().strip()
                        parts = span_id.split("_")
                        if len(parts) < 2:
                            continue
                        try:
                            horse_num = int(parts[1])
                        except ValueError:
                            continue
                        if text and text != "---.-":
                            try:
                                odds_map[horse_num] = float(text)
                            except ValueError:
                                pass

                    if odds_map:
                        results[race_id] = odds_map
                except Exception:
                    logger.debug(f"Playwright JRA odds failed: {race_id}", exc_info=True)

            browser.close()
    except Exception:
        logger.exception("Playwright session failed")

    return results


def fetch_jra_odds_batch(race_ids: list[str]) -> dict[str, dict[int, float]]:
    """Fetch odds for multiple JRA races.

    Strategy: Lightpanda parallel first, Playwright fallback for failures.
    """
    if not race_ids:
        return {}

    # --- Phase 1: Lightpanda parallel fetch ---
    results = {}
    failed_ids = []

    with ThreadPoolExecutor(max_workers=LIGHTPANDA_WORKERS) as pool:
        futures = {
            pool.submit(_fetch_jra_odds_lightpanda, rid): rid
            for rid in race_ids
        }
        for future in as_completed(futures):
            rid = futures[future]
            try:
                odds = future.result()
                if odds:
                    results[rid] = odds
                else:
                    failed_ids.append(rid)
            except Exception:
                failed_ids.append(rid)

    logger.info(
        f"Lightpanda: {len(results)}/{len(race_ids)} OK, "
        f"{len(failed_ids)} failed"
    )

    # --- Phase 2: Playwright fallback for failures ---
    if failed_ids:
        logger.info(f"Playwright fallback for {len(failed_ids)} races")
        fallback = _fetch_jra_odds_playwright_batch(failed_ids)
        results.update(fallback)
        logger.info(
            f"Playwright fallback: {len(fallback)}/{len(failed_ids)} recovered"
        )

    return results


# ---------------------------------------------------------------------------
# Race list helpers
# ---------------------------------------------------------------------------

def fetch_jra_race_list(date_str: str) -> list[dict]:
    """Fetch JRA race list for a date. Returns list of race info dicts."""
    races = []
    # Get groups
    url = f"{NETKEIBA_JRA_BASE}/top/race_list_get_date_list.html?kaisai_date={date_str}"
    try:
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=15)
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "lxml")
    except Exception:
        return races

    groups = []
    for a in soup.select("a"):
        href = a.get("href", "")
        if "current_group=" in href:
            gid = href.split("current_group=")[-1].split("&")[0]
            if gid and gid not in groups:
                groups.append(gid)

    for group in groups:
        list_url = f"{NETKEIBA_JRA_BASE}/top/race_list_sub.html?kaisai_date={date_str}&current_group={group}"
        try:
            resp = requests.get(list_url, headers={"User-Agent": USER_AGENT}, timeout=15)
            resp.encoding = "utf-8"
            soup = BeautifulSoup(resp.text, "lxml")
        except Exception:
            continue

        venue = ""
        header = soup.select_one(".RaceList_DataHeader")
        if header:
            for v in ["札幌", "函館", "福島", "新潟", "東京", "中山", "中京", "京都", "阪神", "小倉"]:
                if v in header.get_text():
                    venue = v
                    break

        for dl in soup.select("dl.RaceList_DataList"):
            for li in dl.select("li"):
                a = li.select_one("a")
                if not a or "race_id=" not in a.get("href", ""):
                    continue
                race_id = a["href"].split("race_id=")[-1].split("&")[0]

                race_num = 0
                rn_el = li.select_one(".Race_Num")
                if rn_el:
                    t = rn_el.get_text(strip=True).replace("R", "")
                    if t.isdigit():
                        race_num = int(t)

                race_name = ""
                rn_el2 = li.select_one(".ItemTitle")
                if rn_el2:
                    race_name = rn_el2.get_text(strip=True)

                post_time = ""
                time_el = li.select_one(".RaceList_Itemtime, .RaceList_ItemTime")
                if time_el:
                    post_time = time_el.get_text(strip=True)

                races.append({
                    "race_id": race_id,
                    "race_number": race_num,
                    "race_name": race_name or f"{race_num}R",
                    "venue": venue,
                    "post_time": post_time,
                    "race_type": "jra",
                })

    return races


def fetch_nar_race_list(date_str: str) -> list[dict]:
    """Fetch NAR race list for a date."""
    races = []
    url = f"{NETKEIBA_NAR_BASE}/top/race_list_sub.html?kaisai_date={date_str}"
    try:
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=15)
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "lxml")
    except Exception:
        return races

    venue = ""
    for dl in soup.select("dl.RaceList_DataList"):
        header = dl.select_one("p.RaceList_DataHeader, dt")
        if header:
            for v in ["大井", "川崎", "船橋", "浦和", "園田", "姫路", "名古屋", "笠松",
                       "高知", "佐賀", "水沢", "盛岡", "門別", "帯広", "金沢"]:
                if v in header.get_text():
                    venue = v
                    break

        for li in dl.select("li"):
            a = li.select_one("a")
            if not a or "race_id=" not in a.get("href", ""):
                continue
            race_id = a["href"].split("race_id=")[-1].split("&")[0]

            race_num = 0
            rn_el = li.select_one(".Race_Num")
            if rn_el:
                t = rn_el.get_text(strip=True).replace("R", "")
                if t.isdigit():
                    race_num = int(t)

            race_name = ""
            rn_el2 = li.select_one(".ItemTitle")
            if rn_el2:
                race_name = rn_el2.get_text(strip=True)

            post_time = ""
            time_el = li.select_one(".RaceList_Itemtime, .RaceList_ItemTime")
            if time_el:
                post_time = time_el.get_text(strip=True)
            else:
                # NAR: time is in a plain <span> inside .RaceData
                race_data = li.select_one(".RaceData")
                if race_data:
                    for span in race_data.select("span"):
                        txt = span.get_text(strip=True)
                        if re.match(r"^\d{1,2}:\d{2}$", txt):
                            post_time = txt
                            break

            races.append({
                "race_id": race_id,
                "race_number": race_num,
                "race_name": race_name or f"{race_num}R",
                "venue": venue,
                "post_time": post_time,
                "race_type": "nar",
            })

    return races
