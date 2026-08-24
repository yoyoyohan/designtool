#!/usr/bin/env python3
"""Download school mascots for the NJ boys soccer ranking sheet.

Sources, in order:
1. MaxPreps public NJ soccer/football ranking JSON (includes mascot URLs)
2. MaxPreps public search JSON for leftovers
3. Generated lettermark if nothing public is found

Wikipedia is used only as a last-ditch pageimage lookup. Athletic marks for
these schools almost never live there.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import random
import re
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import certifi
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SCHOOLS_PATH = ROOT / "data" / "schools.json"
LOGO_DIR = ROOT / "public" / "sample" / "logos"
CSV_PATH = ROOT / "public" / "sample" / "teams.csv"
REPORT_PATH = ROOT / "data" / "logo-fetch-report.json"
SAMPLE_TABLE_PATH = ROOT / "src" / "sampleTable.ts"
CATALOG_PATH = ROOT / "data" / "maxpreps-nj-catalog.json"

UA = "RankingStudio/1.0 (local NJ soccer ranking graphics; +https://localhost)"
SSL_CTX = ssl.create_default_context(cafile=certifi.where())
WIKI_LOCK = threading.Lock()
STOPWORDS = {
    "high",
    "school",
    "hs",
    "prep",
    "preparatory",
    "academy",
    "regional",
    "township",
    "the",
    "of",
    "and",
    "for",
    "boys",
    "soccer",
}
PAREN_CITY = {
    "met": "metuchen",
    "eliz": "elizabeth",
    "pat": "paterson",
    "camd": "camden",
    "hamm": "hammonton",
    "mont": "montvale",
    "toms": "toms river",
}
NAME_ALIASES = {
    "st. benedict's": ["st benedicts prep", "saint benedicts"],
    "st. peter's prep": ["st peters prep", "saint peters prep"],
    "j.p. stevens": ["jp stevens", "john p stevens", "j p stevens"],
    "st. joseph (met.)": ["st joseph metuchen", "st joseph"],
    "christian brothers": ["christian brothers academy", "cba"],
    "montclair kimberley": ["montclair kimberley academy", "mka"],
    "seton hall prep": ["seton hall preparatory"],
    "gill st. bernard's": ["gill st bernards"],
    "hun": ["the hun school", "hun school"],
    "oratory": ["oratory prep"],
    "don bosco prep": ["don bosco"],
}


def slugify(value: str) -> str:
    text = value.lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "school"


def normalize(value: str) -> str:
    text = value.lower().replace("&", " and ")
    text = text.replace("st.", "st").replace("saint", "st")
    text = re.sub(r"\([^)]*\)", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    tokens = [tok for tok in text.split() if tok and tok not in STOPWORDS]
    return " ".join(tokens)


def paren_hint(value: str) -> str:
    match = re.search(r"\(([^)]+)\)", value)
    if not match:
        return ""
    token = re.sub(r"[^a-z]+", "", match.group(1).lower())
    return PAREN_CITY.get(token, token)


def get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as response:
        return json.loads(response.read())


def get_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as response:
        return response.read()


def maxpreps_build_id() -> str:
    html = get_bytes("https://www.maxpreps.com/").decode("utf-8", "replace")
    match = re.search(r'"buildId":"([^"]+)"', html)
    if not match:
        raise RuntimeError("Could not find MaxPreps buildId")
    return match.group(1).replace("\\n", "").replace("\n", "").strip()


def iter_rankings(build: str, path_prefix: str, delay: float = 0.25) -> list[dict]:
    page = 1
    rows: list[dict] = []
    total = None
    while True:
        url = f"https://www.maxpreps.com/_next/data/{build}/{path_prefix}/{page}.json"
        data = get_json(url)
        payload = data.get("pageProps", {}).get("rankingsListData") or {}
        chunk = payload.get("rankings") or []
        if total is None:
            total = int(payload.get("totalCount") or 0)
            print(f"  {path_prefix}: {total} schools")
        if not chunk:
            break
        rows.extend(chunk)
        if total and len(rows) >= total:
            break
        page += 1
        time.sleep(delay)
    # de-dupe by schoolId
    seen: dict[str, dict] = {}
    for row in rows:
        sid = row.get("schoolId") or row.get("schoolFormattedName") or row.get("schoolName")
        if sid:
            seen[str(sid)] = row
    return list(seen.values())


def catalog_record(row: dict, source: str) -> dict:
    url = row.get("schoolMascotUrl") or row.get("mascotUrl") or ""
    if url:
        url = re.sub(r"width=\d+", "width=400", url)
        url = re.sub(r"height=\d+", "height=400", url)
    return {
        "schoolId": row.get("schoolId") or "",
        "name": row.get("name") or row.get("schoolName") or "",
        "formatted": row.get("schoolFormattedName") or "",
        "city": row.get("city") or "",
        "state": (row.get("state") or row.get("stateCode") or "").upper(),
        "acronym": row.get("schoolNameAcronym") or "",
        "mascot": row.get("mascot") or "",
        "mascotUrl": url,
        "overall": row.get("overall") or "",
        "canonicalUrl": row.get("canonicalUrl") or row.get("teamLink") or "",
        "source": source,
        "norm": normalize(row.get("name") or row.get("schoolName") or ""),
        "formatted_norm": normalize(row.get("schoolFormattedName") or ""),
    }


def load_catalog(build: str) -> list[dict]:
    if CATALOG_PATH.exists():
        cached = json.loads(CATALOG_PATH.read_text())
        if cached.get("schools"):
            print(f"Using cached catalog ({len(cached['schools'])} schools)")
            return cached["schools"]
    print("Fetching MaxPreps NJ catalogs…")
    merged: dict[str, dict] = {}
    for prefix in ("nj/soccer/25-26/rankings", "nj/soccer/24-25/rankings", "nj/football/rankings"):
        for row in iter_rankings(build, prefix):
            rec = catalog_record(row, prefix)
            key = rec["schoolId"] or rec["norm"]
            existing = merged.get(key)
            if not existing:
                merged[key] = rec
            elif rec["mascotUrl"] and not existing["mascotUrl"]:
                merged[key] = rec
            elif rec.get("overall") and not existing.get("overall"):
                existing["overall"] = rec["overall"]
    schools = list(merged.values())
    CATALOG_PATH.write_text(json.dumps({"schools": schools}, indent=2))
    print(f"Catalog size: {len(schools)}")
    return schools


def search_maxpreps(build: str, query: str) -> list[dict]:
    q = urllib.parse.quote(query)
    url = f"https://www.maxpreps.com/_next/data/{build}/search.json?q={q}"
    data = get_json(url)
    rows = data.get("pageProps", {}).get("initialSchoolResults") or []
    return [catalog_record(row, "search") for row in rows]


def score_candidate(query: str, rec: dict) -> float:
    nq = normalize(query)
    names = {rec["norm"], rec["formatted_norm"]}
    aliases = NAME_ALIASES.get(query.lower(), [])
    alias_norms = {normalize(alias) for alias in aliases}
    if nq in names or names & alias_norms:
        score = 100.0
    elif any(nq and (nq in name or name in nq) for name in names if name):
        score = 82.0
    else:
        qt = set(nq.split())
        best = 0.0
        for name in names:
            nt = set(name.split())
            if not qt or not nt:
                continue
            best = max(best, 100.0 * len(qt & nt) / len(qt | nt))
        score = best
    hint = paren_hint(query)
    blob = f"{rec['formatted']} {rec['city']} {rec['canonicalUrl']}".lower()
    if hint and hint in blob:
        score += 12
    if rec.get("state") == "NJ":
        score += 8
    elif rec.get("state") and rec.get("state") != "NJ":
        score -= 15
    return score


def pick_match(query: str, catalog: list[dict], searched: list[dict] | None = None) -> dict | None:
    pool = catalog + (searched or [])
    ranked = sorted(pool, key=lambda rec: score_candidate(query, rec), reverse=True)
    if not ranked:
        return None
    best = ranked[0]
    score = score_candidate(query, best)
    if score < 70:
        return None
    return best


def search_queries(name: str) -> list[str]:
    base = re.sub(r"\s*\([^)]*\)", "", name).strip()
    queries = [base, base.lower()]
    queries.extend(NAME_ALIASES.get(name.lower(), []))
    if "'" in base:
        queries.append(base.replace("'", ""))
    if "St." in base:
        queries.append(base.replace("St.", "St"))
    # MaxPreps search is literal and often fails with "High"
    short = re.sub(r"\b(High|School|Prep|Academy)\b", "", base, flags=re.I).strip()
    if short and short not in queries:
        queries.append(short)
    seen: set[str] = set()
    out = []
    for item in queries:
        key = item.lower().strip()
        if item and key not in seen:
            seen.add(key)
            out.append(key)
    return out[:4]


def school_data_path(canonical: str) -> str:
    path = urllib.parse.urlparse(canonical).path.strip("/")
    parts = [p for p in path.split("/") if p]
    return "/".join(parts[:3]) if len(parts) >= 3 else path


def hex_color(value: str | None, fallback: str) -> str:
    if not value:
        return fallback
    text = re.sub(r"[^0-9A-Fa-f]", "", value)
    if len(text) != 6:
        return fallback
    return f"#{text.upper()}"


def maxpreps_school_colors(build: str, rec: dict) -> tuple[str, str] | None:
    path = school_data_path(rec.get("canonicalUrl") or "")
    if not path:
        return None
    url = f"https://www.maxpreps.com/_next/data/{build}/{path}.json"
    try:
        data = get_json(url)
    except Exception:
        return None
    info = (data.get("pageProps") or {}).get("schoolContext", {}).get("schoolInfo") or {}
    primary = hex_color(info.get("color1"), "")
    secondary = hex_color(info.get("color2"), "")
    if not primary:
        return None
    if not secondary or secondary in {primary, "#FFFFFF"}:
        secondary = "#F3EAD8" if primary != "#F3EAD8" else "#111111"
    return primary, secondary


def wikipedia_logo_url(name: str) -> str | None:
    queries = [
        f"{name} High School New Jersey",
        f"{name} School New Jersey",
        f"{name} Preparatory New Jersey",
        f"{name} Academy New Jersey",
    ]
    reject_title = re.compile(r"list of|county|township,|borough|city of", re.I)
    schoolish = re.compile(r"high school|preparatory|academy|\bprep\b|\bschool\b", re.I)
    reject_file = re.compile(
        r"commons-logo|wikimedia|flag of|map of|icon|edit-ltr|decrease|increase|location map|building|campus|aerial",
        re.I,
    )
    want_file = re.compile(r"logo|seal|mascot|athletic|coat of arms", re.I)
    for query in queries:
        qs = urllib.parse.urlencode(
            {"action": "query", "list": "search", "srsearch": query, "srlimit": 5, "format": "json"}
        )
        try:
            data = get_json(f"https://en.wikipedia.org/w/api.php?{qs}")
        except Exception:
            continue
        for hit in data.get("query", {}).get("search") or []:
            title = hit.get("title") or ""
            if not schoolish.search(title):
                continue
            if reject_title.search(title):
                continue
            qs = urllib.parse.urlencode(
                {
                    "action": "query",
                    "titles": title,
                    "prop": "images",
                    "imlimit": 40,
                    "format": "json",
                }
            )
            try:
                page_data = get_json(f"https://en.wikipedia.org/w/api.php?{qs}")
            except Exception:
                continue
            page = next(iter(page_data.get("query", {}).get("pages", {}).values()), {})
            files = [
                im.get("title", "")
                for im in page.get("images") or []
                if want_file.search(im.get("title", "")) and not reject_file.search(im.get("title", ""))
            ]
            if not files:
                continue
            qs = urllib.parse.urlencode(
                {
                    "action": "query",
                    "titles": files[0],
                    "prop": "imageinfo",
                    "iiprop": "url",
                    "iiurlwidth": 400,
                    "format": "json",
                }
            )
            info = get_json(f"https://en.wikipedia.org/w/api.php?{qs}")
            image_page = next(iter(info.get("query", {}).get("pages", {}).values()), {})
            imageinfo = (image_page.get("imageinfo") or [{}])[0]
            url = imageinfo.get("thumburl") or imageinfo.get("url")
            if url:
                return url
        time.sleep(0.2)
    return None


def initials(name: str) -> str:
    cleaned = name.replace("St.", "St").replace("J.P.", "JP")
    parts = [p for p in re.findall(r"[A-Za-z0-9]+", cleaned) if p.lower() not in STOPWORDS]
    if len(parts) >= 2:
        return (parts[0][0] + parts[1][0]).upper()
    if parts:
        return parts[0][:2].upper()
    return "HS"


def hash_colors(name: str) -> tuple[str, str]:
    digest = hashlib.md5(name.encode()).hexdigest()
    random.seed(digest)
    palettes = [
        ("#1B3A4B", "#E8D5A3"),
        ("#6B2B1F", "#F0D9B5"),
        ("#1F3D2B", "#C9D4C0"),
        ("#234E70", "#A7C7E7"),
        ("#5C2E2E", "#E6D5C3"),
        ("#1A1A1A", "#C4A574"),
        ("#0E4D5C", "#F4C542"),
        ("#3D1F4A", "#E2D4A8"),
        ("#7A1F1F", "#F2E6C9"),
        ("#163A2C", "#D7C48A"),
    ]
    return palettes[int(digest[:8], 16) % len(palettes)]


def lettermark_svg(name: str, primary: str, secondary: str) -> str:
    letters = initials(name)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="16" fill="{primary}"/>
  <rect x="10" y="10" width="108" height="108" rx="10" fill="none" stroke="{secondary}" stroke-width="3"/>
  <text x="64" y="78" text-anchor="middle" font-family="Oswald, Helvetica, sans-serif" font-size="42" font-weight="700" fill="{secondary}">{letters}</text>
</svg>
"""


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*rgb)


def extract_colors(image: Image.Image) -> tuple[str, str]:
    frame = image.convert("RGBA")
    frame.thumbnail((80, 80))
    counts: dict[tuple[int, int, int], int] = {}
    for r, g, b, a in frame.getdata():
        if a < 48:
            continue
        if r + g + b > 720 or r + g + b < 45:
            continue
        key = (r // 16 * 16, g // 16 * 16, b // 16 * 16)
        counts[key] = counts.get(key, 0) + 1
    if not counts:
        return "#1A1A1A", "#F3EAD8"
    ranked = sorted(counts, key=counts.get, reverse=True)
    primary = ranked[0]
    secondary = next((c for c in ranked[1:] if abs(sum(c) - sum(primary)) > 80), None)
    if secondary is None:
        secondary = (243, 234, 216)
    return rgb_to_hex(primary), rgb_to_hex(secondary)


def save_mascot(url: str, dest: Path) -> tuple[str, str] | None:
    raw = get_bytes(url)
    image = Image.open(io.BytesIO(raw))
    image = image.convert("RGBA")
    # flatten onto transparent-friendly PNG; keep transparency
    image.thumbnail((400, 400))
    dest.parent.mkdir(parents=True, exist_ok=True)
    image.save(dest, "PNG")
    return extract_colors(image)


def parse_record(overall: str) -> tuple[int, int, int]:
    parts = [int(x) for x in re.findall(r"\d+", overall or "")]
    w = parts[0] if len(parts) > 0 else 0
    l = parts[1] if len(parts) > 1 else 0
    d = parts[2] if len(parts) > 2 else 0
    return w, l, d


def write_sample_table(gmc: list[str], matches: dict[str, dict]) -> None:
    lines = ["Team\tW\tL\tD\tPTS\tGF\tGA\tGD"]
    for name in gmc:
        rec = matches.get(name) or {}
        w, l, d = parse_record(rec.get("overall") or "")
        pts = 3 * w + d
        gf = w * 2 + d
        ga = l * 2
        gd = gf - ga
        gd_txt = f"+{gd}" if gd > 0 else str(gd)
        lines.append(f"{name}\t{w}\t{l}\t{d}\t{pts}\t{gf}\t{ga}\t{gd_txt}")
    body = "\n".join(lines) + "\n"
    SAMPLE_TABLE_PATH.write_text(f"export const SAMPLE_TABLE = `{body}`;\n")


def main() -> None:
    payload = json.loads(SCHOOLS_PATH.read_text())
    schools: list[str] = payload["schools"]
    gmc: list[str] = payload["gmc"]
    print(f"{len(schools)} spreadsheet schools")

    build = maxpreps_build_id()
    print("MaxPreps buildId", build)
    catalog = load_catalog(build)

    matches: dict[str, dict] = {}
    missed: list[str] = []
    for name in schools:
        hit = pick_match(name, catalog)
        if hit:
            matches[name] = hit
            if not hit.get("mascotUrl"):
                missed.append(name)
        else:
            missed.append(name)
    print(f"Catalog matched {len(matches)}; {len(missed)} need search or a logo fill")

    unmatched = [name for name in schools if name not in matches]
    still_missed: list[str] = []
    print(f"Searching MaxPreps for {len(unmatched)} unmatched names…")
    for i, name in enumerate(unmatched, 1):
        found = None
        for query in search_queries(name):
            try:
                results = search_maxpreps(build, query)
            except urllib.error.HTTPError as err:
                print(f"  search fail {name!r} {query!r}: {err}")
                time.sleep(0.6)
                continue
            found = pick_match(name, [], results)
            if found:
                break
            time.sleep(0.2)
        if found:
            matches[name] = found
            print(f"  search [{i}/{len(unmatched)}] {name} -> {found['name']} ({found['state']})")
        else:
            still_missed.append(name)
            print(f"  miss [{i}/{len(unmatched)}] {name}")
        time.sleep(0.2)

    LOGO_DIR.mkdir(parents=True, exist_ok=True)

    rows_out: list[dict] = []
    report = {"found": [], "wikipedia": [], "fallback": [], "failed": []}

    def work(name: str) -> dict:
        slug = slugify(name)
        rec = matches.get(name)
        aliases = [a for a in NAME_ALIASES.get(name.lower(), [])]
        if rec:
            if rec.get("acronym"):
                aliases.append(rec["acronym"])
            if rec.get("mascot"):
                aliases.append(rec["mascot"])
            if rec.get("name") and rec["name"] != name:
                aliases.append(rec["name"])
        primary, secondary = hash_colors(name)
        png_path = LOGO_DIR / f"{slug}.png"
        svg_path = LOGO_DIR / f"{slug}.svg"
        logo_name = f"{slug}.svg"
        status = "fallback"

        if png_path.exists():
            try:
                with Image.open(png_path) as image:
                    primary, secondary = extract_colors(image)
            except Exception:
                pass
            logo_name = png_path.name
            status = "maxpreps"
        elif rec and rec.get("mascotUrl"):
            try:
                colors = save_mascot(rec["mascotUrl"], png_path)
                if colors:
                    primary, secondary = colors
                if svg_path.exists():
                    svg_path.unlink()
                logo_name = png_path.name
                status = "maxpreps"
            except Exception as err:
                print(f"  download fail {name}: {err}")
        if status == "fallback":
            wiki = None
            try:
                with WIKI_LOCK:
                    wiki = wikipedia_logo_url(name)
                    time.sleep(0.15)
            except Exception as err:
                print(f"  wiki fail {name}: {err}")
            if wiki:
                try:
                    colors = save_mascot(wiki, png_path)
                    if colors:
                        primary, secondary = colors
                    if svg_path.exists():
                        svg_path.unlink()
                    logo_name = png_path.name
                    status = "wikipedia"
                except Exception as err:
                    print(f"  wiki download fail {name}: {err}")
        if status == "fallback":
            if rec:
                colors = maxpreps_school_colors(build, rec)
                if colors:
                    primary, secondary = colors
            svg_path.write_text(lettermark_svg(name, primary, secondary))
            logo_name = svg_path.name
        return {
            "name": name,
            "aliases": ",".join(dict.fromkeys(aliases)),
            "primary": primary,
            "secondary": secondary,
            "logo": logo_name,
            "status": status,
            "matched": rec["name"] if rec else "",
            "mascotUrl": rec.get("mascotUrl", "") if rec else "",
            "overall": rec.get("overall", "") if rec else "",
        }

    # downloads in parallel; matching already finished
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(work, name): name for name in schools}
        for i, fut in enumerate(as_completed(futures), 1):
            row = fut.result()
            rows_out.append(row)
            bucket = "found" if row["status"] == "maxpreps" else row["status"]
            if bucket not in report:
                bucket = "fallback"
            report[bucket].append(row["name"])
            if i % 25 == 0 or i == len(schools):
                print(f"saved {i}/{len(schools)}")

    rows_out.sort(key=lambda r: schools.index(r["name"]))
    with CSV_PATH.open("w", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["name", "aliases", "primary", "secondary", "logo"],
        )
        writer.writeheader()
        for row in rows_out:
            writer.writerow(
                {
                    "name": row["name"],
                    "aliases": row["aliases"],
                    "primary": row["primary"],
                    "secondary": row["secondary"],
                    "logo": row["logo"],
                }
            )

    match_lookup = {name: matches[name] for name in gmc if name in matches}
    for row in rows_out:
        if row["name"] in gmc:
            match_lookup.setdefault(row["name"], {"overall": row.get("overall", "")})
            match_lookup[row["name"]]["overall"] = row.get("overall") or match_lookup[row["name"]].get("overall", "")
    write_sample_table(gmc, match_lookup)

    report["counts"] = {
        "schools": len(schools),
        "found": len(report["found"]),
        "wikipedia": len(report["wikipedia"]),
        "fallback": len(report["fallback"]),
        "search_missed": still_missed,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    print(
        f"Done. logos={len(report['found'])} wikipedia={len(report['wikipedia'])} "
        f"lettermarks={len(report['fallback'])} unmatched_after_search={len(still_missed)}"
    )
    print("CSV", CSV_PATH)
    print("report", REPORT_PATH)


if __name__ == "__main__":
    main()
