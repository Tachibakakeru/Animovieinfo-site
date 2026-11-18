"""Update the Pages snapshot using publicly displayed Taiwanese animation listings."""
import hashlib
import json
import re
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, quote, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from bs4 import BeautifulSoup

SITE = Path(__file__).resolve().parents[1] / "site"
BASE = "https://dandadany.github.io/anime_movie_screening/"
CENTURY = "https://ticket.centuryasia.com.tw/"
CHIN = "https://www.ccmovie.com.tw/"
AMBASSADOR = "https://www.ambassador.com.tw/"
AT = "https://www.atmovies.com.tw/showtime/"
TZ = timezone(timedelta(hours=8))
TODAY = datetime.now(TZ).date().isoformat()
DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
TIME = re.compile(r"(?:[01]\d|2[0-3]):[0-5]\d")
BRANCHES = {
    "ximen": ("喜樂時代影城西門今日店", "臺北市", "臺北市萬華區峨眉街52號", 25.043803, 121.505399),
    "kaohsiung": ("喜樂時代影城高雄總圖店", "高雄市", "高雄市前鎮區林森四路189號", 22.609271, 120.302090),
}
# Short editorial summaries. New movies can use the linked cinema's factual credits.
NOTES = {
    "同級生：十週年重映": "草壁在放學後的教室撞見獨自練唱的佐条。一場校園合唱練習，拉近兩個性格相異的高中生。",
    "樂園追放 心之共鳴": "西元 2400 年，許多人將意識移往虛擬世界「迪瓦」。搜查官安吉拉的叛變，讓這個數位社會出現新的裂痕。",
    "名偵探柯南 第30號殺人事件": "一張新版萬圓鈔票，把柯南和服部平次帶進一樁橫跨長野與大阪的偽鈔疑案。",
    "致遙不可及彼方的你": "轉學到離島的和希，在海灣救起一名陌生少女。她的來歷，牽動了島上的神隱傳說。",
    "歡迎來到朵莉之家": "為了挽回人氣，網紅瑪莉亞公主與男友走進製偶師的宅邸。一場探訪，在臺灣手繪動畫的奇幻世界裡逐漸變調。",
    "Jim Queen：肌情四射": "健身網紅 Jim 的世界一夕崩解。他與新夥伴穿梭巴黎夜色，尋找一帖傳說中的解藥。",
    "劇場版 來自深淵：覺醒的神秘": "莉可與雷古一行人深入阿比斯，向深界七層前進。新的同行者和未知的生物，改變了這趟探窟之旅。",
    "庫洛魔法使 劇場版：被封印的卡片": "小櫻和小狼在友枝町重逢，原本準備登台的校園舞台，因為一張神祕卡片而陷入危機。",
    "歡迎光臨魔法秘境": "少女與母親誤闖女巫的世界。面對突然出現的魔法，她們得重新認識彼此。",
    "戴帽子的貓": "戴著紅白高帽的怪貓登上大銀幕，將蘇斯博士筆下的想像力與惡作劇帶進普通孩子的日常。",
    "憤怒鳥玩電影3：全家總動員": "《憤怒鳥玩電影》系列的第三部動畫長片，熟悉的鳥兒與綠豬再度登上大銀幕。",
    "劇場版 藥師少女的獨語 亡妃的秘寶": "藥師貓貓在系列首部原創劇場版中遇上亡妃留下的謎團，從宮廷線索追尋傳聞中的寶物。",
    "神隱少女": "千尋與父母誤闖神明的世界。為了帶父母回家，她在湯屋裡開始工作，也逐漸記起自己的名字。",
}
movies, cinemas, screenings, aliases = {}, {}, {}, {}


def web_url(url):
    return url if url and urlsplit(url).scheme in ("http", "https") else ""


def request(url):
    parts = urlsplit(url)
    uri = urlunsplit(parts._replace(path=quote(parts.path, safe="/%:@+")))
    req = Request(uri, headers={"User-Agent": "Animovieinfo/1.0 (public cinema listings)"})
    for attempt in range(3):
        try:
            with urlopen(req, timeout=25) as response:
                return response.read()
        except OSError as exc:
            if attempt == 2 or (isinstance(exc, HTTPError) and exc.code not in (408, 502, 503, 504)):
                raise
            time.sleep(2 ** attempt)


def soup(url):
    return BeautifulSoup(request(url), "html.parser", from_encoding="utf-8")


def key(title):
    return re.sub(r"[^\w]", "", unicodedata.normalize("NFKC", title).casefold()).replace("十週年", "10週年").replace("神祕", "神秘")


def movie(title, release, poster, source, genres=None):
    date.fromisoformat(release)
    slug = aliases.get(key(title), key(title))
    mid = hashlib.sha256(slug.encode()).hexdigest()[:12]
    if mid not in movies:
        movies[mid] = dict(id=mid, title=title, releaseDate=release, posterSource=web_url(poster),
                           sourceUrl=web_url(source), genres=genres or ["動畫"], runtime=None,
                           description=NOTES.get(title, ""), poster="")
    return movies[mid]


def session(m, cid, day, time, version, source, room=""):
    date.fromisoformat(day)
    if not TIME.fullmatch(time) or not web_url(source):
        return
    version = version or "版本未標示"
    record = dict(movieId=m["id"], cinemaId=cid, date=day, time=time, version=version, sourceUrl=source, auditorium=room)
    screenings[m["id"], cid, day, time, version, room] = record


def reference():
    catalogue = json.loads(request(BASE + "data/movie_discovery.json"))
    schedule = json.loads(request(BASE + "data/locations.geojson"))
    by_title = {}
    for item in catalogue["movies"]:
        title = item["title"]
        for alias in item.get("aliases", []):
            aliases[key(alias)] = key(title)
        if not item["target_date"]:
            continue
        m = movie(title, item["target_date"], urljoin(BASE, item["poster_url"]) if item.get("poster_url") else "",
                  BASE + f'movie-{item["id"]}.html')
        m["posterCreditUrl"] = web_url(item.get("poster_source_url"))
        by_title[title] = m
    for title, days in schedule["movie_features_by_date"].items():
        m = by_title[title]
        for day, features in days.items():
            for feature in features:
                p = feature["properties"]
                if p["show_date"] != day:
                    raise ValueError("Mismatched schedule dates")
                cid = "ref-" + str(p["location_id"])
                lng, lat = feature["geometry"]["coordinates"]
                cinemas[cid] = dict(id=cid, name=p["location_name"], city=p["city"].replace("台", "臺"),
                                    brand=p["chain_name"], lat=lat, lng=lng, address=p.get("address", ""),
                                    sourceUrl=web_url(p.get("official_url")) or web_url(p["location_url"]))
                for s in p["showtimes"]:
                    fmt = s.get("format") or ""
                    if key(fmt) in {key(title), key(m["title"])}:
                        fmt = ""
                    session(m, cid, day, s["time"], fmt or s.get("language"),
                            s.get("booking_url") or p.get("crawl_url") or p["location_url"], s.get("auditorium") or "")
    return schedule["updated_at"]


def century():
    for code, (name, city, address, lat, lng) in BRANCHES.items():
        base = CENTURY + code + "/"
        listing = soup(base + "movie_info.aspx")
        rows = listing.select(".mls_left")
        if not rows:
            raise ValueError(f"Cannot read the film list at {base}")
        cid = "century-" + code
        cinemas[cid] = dict(id=cid, name=name, city=city, address=address, lat=lat, lng=lng, brand="喜樂時代影城", sourceUrl=base)
        seen = set()
        for row in rows:
            label = row.select_one(".mls_left_c_t")
            if not label or "動畫" not in label.get_text():
                continue
            url = urljoin(base, row.a["href"])
            if url in seen:
                continue
            seen.add(url)
            page = soup(url)
            title = row.select_one(".mls_left_c_fc").get_text(strip=True)
            release = DATE.search(row.select_one(".mls_left_c_d").get_text()).group()
            genres = re.split("[,、，]", re.split("[:：]", label.get_text(strip=True), 1)[-1])
            poster = urljoin(base, row.select_one(".mls_left_i img")["src"])
            m = movie(title, release, poster, url, genres)
            m.update(sourceUrl=url, genres=genres, posterSource=poster, posterCreditUrl=url)
            metadata = page.select_one(".movie_news_cts").get_text(" ", strip=True)
            duration = re.search(r"片長：\s*([1-9]\d*)\s*分鐘", metadata)
            if duration:
                m["runtime"] = int(duration[1])
            english = page.select_one(".movie_news_fce")
            if english:
                m["originalTitle"] = english.get_text(strip=True)
            director = re.search("導演：(.+?) 演員：", metadata)
            if director:
                m["director"] = director[1].strip()
            for group in page.select(".movie_timetable_select"):
                labels = [el.get_text(strip=True) for el in group.select(".mts_t")]
                for link in group.select("a[href]"):
                    query = parse_qs(urlsplit(link["href"]).query)
                    stamp = query.get("date", [""])[0]
                    if len(labels) >= 3 and re.fullmatch(r"\d{4}-\d\d-\d\d \d\d:\d\d", stamp):
                        if query.get("siteid", [""])[0].lower() != code:
                            continue
                        session(m, cid, *stamp.split(), labels[1], url, labels[2])


def chin_chin():
    listing_url = CHIN + "product.php?_path=product_list&lan_id=1&language=zh-TW&page=1&upid=32"
    schedule_url = CHIN + "product.php?_path=product_showtimes&all=1"
    cid = "ref-70"
    cinemas[cid] = dict(id=cid, name="親親影城", city="臺中市", brand="親親影城", address="臺中市北區北屯路14號",
                        lat=24.1603157, lng=120.6921689, sourceUrl=CHIN)
    items = soup(schedule_url).select(".showtime-item")
    listing = soup(listing_url).select("a.list")
    if not listing or not items:
        raise ValueError("Cannot read Chin Chin's programme")
    links = {urljoin(CHIN, a["href"]): None for a in listing if "product_detail" in a.get("href", "")}
    for row in items:
        tag = row.select_one(".movie_tag")
        if tag and "動畫" in tag.get_text():
            links[urljoin(CHIN, row.select_one(".poster-img")["href"])] = row
    for url, row in links.items():
        page = soup(url)
        fields = page.select_one(".movie_detail")
        if not fields:
            raise ValueError(f"Cannot read movie details at {url}")
        genres = re.search(r"類型：\s*(.+?)\s*片長：", fields.get_text(" ", strip=True))
        if not genres or "動畫" not in genres[1]:
            continue
        title = page.select_one(".ch_title").get_text(strip=True)
        release = DATE.search(fields.get_text())
        if not release:
            continue
        poster = urljoin(CHIN, page.select_one(".ipbox_detail_bpic img")["src"])
        m = movie(title, release[0], poster, url)
        m.update(releaseDate=release[0], sourceUrl=url, genres=re.split(r"[、,，/]+", genres[1].strip()), posterSource=poster, posterCreditUrl=url)
        length = re.search(r"片長：\s*([1-9]\d*)\s*分鐘", fields.get_text(" ", strip=True))
        if length:
            m["runtime"] = int(length[1])
        if row:
            for pane in row.select(".tab-pane"):
                day = pane.select_one(".dateDisplay")
                if not day:
                    continue
                for times in pane.select(".movie_showtimes"):
                    version = times.find_previous_sibling(class_="dateMovie")
                    for el in times.select(".sky_word .info"):
                        t = el.get_text(strip=True)
                        # Early-morning shows may belong to the next calendar day.
                        if TIME.fullmatch(t) and t >= "06:00":
                            session(m, cid, day.get_text(strip=True), t, version.get_text(strip=True) if version else "", schedule_url + "#" + row["id"])


def ambassador():
    listing = soup(AMBASSADOR + "home/MovieList")
    links = listing.select(".movie-list a[href*='MovieContent']:not(.poster)")
    if not links:
        raise ValueError("Cannot read Ambassador's programme")
    master_url = "https://raw.githubusercontent.com/DandaDany/anime_movie_screening/main/data/control/cinema_master.json"
    master = json.loads(request(master_url))
    cinema_map = {p["source_location_code"]: p for p in master["locations"]
                  if p["active"] and p.get("latitude") and "國賓" in p["location_name"]}
    until = (date.fromisoformat(TODAY) + timedelta(days=14)).isoformat()
    def fetch(link):
        return soup(urljoin(AMBASSADOR, link["href"]))

    # Two concurrent read-only requests keep the chain-wide detail scan bounded.
    with ThreadPoolExecutor(max_workers=2) as pool:
        for link, page in zip(links, pool.map(fetch, links)):
            fields = page.select("#movie-info .note")
            genres = next((el.get_text(strip=True).partition("：")[2] for el in fields if "影片類型：" in el.get_text()), "")
            if "動畫" not in genres:
                continue
            raw_date = next((el.get_text(strip=True).partition("：")[2] for el in fields if "上映日期：" in el.get_text()), "")
            if not DATE.fullmatch(raw_date.replace("/", "-")):
                continue
            url = urljoin(AMBASSADOR, link["href"])
            title = re.sub(r"^[（(][^）)]*(?:特別場|VISION)[）)]", "", link.get_text(strip=True))
            art = link.find_previous("a", class_="poster").img["src"]
            m = movie(title, raw_date.replace("/", "-"), urljoin(AMBASSADOR,art), url)
            bg = page.select_one(".movie-img[style]")
            if bg:
                match = re.search(r"url\(['\"]?(https://[^)'\"]+)", bg["style"])
                if match:
                    m.update(backdropSource=match[1], backdropCreditUrl=url)
            selections = page.select("#search-bar-page ul.scrollbar a[href*='MovieContent']")
            dates = {urljoin(AMBASSADOR,a["href"]) for a in selections
                     if TODAY <= parse_qs(urlsplit(a["href"]).query).get("DT", [""])[0].replace("/", "-") <= until}
            for detail in sorted(dates | {url}):
                dated_page = page if detail == url else soup(detail)
                # Theater links always target today's theater page, even on a future movie schedule.
                chosen = dated_page.select_one("#search-bar-page .has-submenu > a[href*='MovieContent']")
                if not chosen:
                    continue
                selected_date = re.search(r"\d{4}/\d{2}/\d{2}", chosen.get_text(strip=True))
                if not selected_date or selected_date[0] != parse_qs(urlsplit(detail).query)["DT"][0]:
                    continue
                day = selected_date[0].replace("/", "-")
                for box in dated_page.select(".theater-list .theater-box"):
                    a = box.select_one("h3 a[href*='Showtime']")
                    if not a:
                        continue
                    source = urljoin(AMBASSADOR, a["href"])
                    params = parse_qs(urlsplit(source).query)
                    place = cinema_map.get(params["ID"][0])
                    if not place:
                        continue
                    cid = "ref-" + str(place["id"])
                    cinemas[cid] = dict(id=cid,name=a.get_text(strip=True), city=place["city"].replace("台","臺"),
                                        brand="國賓影城", address=place["address"], lat=place["latitude"], lng=place["longitude"],
                                        sourceUrl=source.split("&DT=")[0])
                    for group in box.select("ul.seat-list"):
                        version = group.find_previous_sibling(class_="tag-seat")
                        match = re.match(r"[（(]([^）)]+)", version.get_text(strip=True)) if version else None
                        for clock in group.select("h6"):
                            room = clock.find_next_sibling("p")
                            label = room.select_one(".info") if room else None
                            session(m,cid,day,clock.get_text(strip=True),match[1] if match else "",detail,
                                    label.get_text(strip=True) if label else "")
    return master


def showtimes_cinemas(master):
    host = "https://www.showtimes.com.tw"
    feed = json.loads(request("https://capi.showtimes.com.tw/4/app/bootstrap"))["payload"]
    programs = {}
    known = {key(m["title"]): m for m in movies.values()}
    for item in feed["programs"]:
        # Language and special-event variants carry separate programme IDs.
        title = re.sub(r"\s*(?:[（(](?:國語|日語|英語)版[）)]|粉絲特典場|特別場)$", "", item["name"]).strip()
        canonical = aliases.get(key(title), key(title))
        m = known.get(canonical)
        if not m and "animation" not in (item.get("genres") or []):
            continue
        if not m:
            release = (item.get("availableAt") or "")[:10]
            if not DATE.fullmatch(release):
                continue
            url = f"{host}/programs/{item['id']}/"
            poster = (item.get("coverImagePortrait") or {}).get("url")
            m = movie(title, release, poster, url)
            m.update(originalTitle=item.get("nameAlternative"), runtime=(item.get("duration") or 0) // 60,
                     posterCreditUrl=url, director="、".join((item.get("meta") or {}).get("directors") or []))
            known[canonical] = m
        programs[item["id"]] = m

    locations = {str(p["source_location_code"]): p for p in master["locations"]
                 if p["active"] and "秀泰" in p["location_name"] and p.get("latitude")}
    bundles = feed["eventsForCorporations"]
    if not locations.keys() & bundles.keys() or not programs:
        raise ValueError("Cannot match ShowTimes locations or programmes")
    for code, bundle in bundles.items():
        place = locations.get(code)
        if not place:
            continue
        cid = "ref-" + str(place["id"])
        url = f"{host}/cinemas/{code}/"
        city = place.get("city") or ("花蓮縣" if place["address"].startswith("花蓮市") else "縣市未標示")
        rooms = {v["id"]: str(v.get("room") or "") for v in bundle["venues"]}
        for event in bundle["events"]:
            m = programs.get(event["programId"])
            if not m or event["status"] != "active" or str(event["corporationId"]) != code:
                continue
            start = datetime.fromisoformat(event["startedAt"].replace("Z", "+00:00"))
            if start.tzinfo is None:
                raise ValueError("ShowTimes event has no timezone")
            start = start.astimezone(TZ)
            if start.date().isoformat() < TODAY:
                continue
            cinemas[cid] = dict(id=cid, name=place["location_name"], brand="秀泰影城",
                                city=city.replace("台", "臺"), address=place["address"],
                                lat=place["latitude"], lng=place["longitude"], sourceUrl=url)
            session(m, cid, start.date().isoformat(), start.strftime("%H:%M"),
                    (event.get("meta") or {}).get("format"), url, rooms.get(event["venueId"], ""))


def atmovies_chains(master):
    # The directory and the location catalogue use different branch names.
    alternate = {"台中老虎城威秀": "MUVIE CINEMAS 台中TIGER CITY",
                 "林口三井OUTLET威秀影城": "林口MITSUI OUTLET PARK威秀影城",
                 "MUVIE CINEMAS台北松仁威秀": "MUVIE CINEMAS 台北松仁",
                 "台北新光影城": "新光影城台北獅子林", "台北天母新光影城": "新光影城台北天母",
                 "桃園新光影城": "新光影城桃園青埔", "台中新光影城": "新光影城台中中港",
                 "台南新光影城": "新光影城台南西門"}
    areas = {"02": "02", "033": "03", "035": "35", "037": "37", "038": "38",
             "044": "04", "066": "06", "077": "07"}
    def branch_key(name):
        return key(alternate.get(name, name).removesuffix("影城"))
    branches = {branch_key(p["location_name"]):p for p in master["locations"]
                if p["active"] and p["latitude"] and any(t in p["location_name"] for t in ("威秀", "MUVIE", "新光"))}
    menu = request(AT).decode("utf-8")
    choices = re.findall(r"""new Option\("([^"]*(?:威秀|MUVIE|新光)[^"]*)"\);\s*NewOpt\[\d+\].value = '(\w+)'""", menu)
    # Taiwan release of this revival is independently confirmed in Vieshow's film detail.
    dawn = movie("來自深淵 深沉靈魂的黎明", "2026-11-13",
                 "https://www.unicornpopcorn.com.tw/ForVsWeb/upload/film/film_20261028024.jpg",
                 "https://www.vscinemas.com.tw/VsWeb/film/detail.aspx?id=9074")
    dawn.update(runtime=119, director="小島正幸", description="為了尋找母親，莉可與雷古、娜娜奇來到深界第五層，在那裡遇見黎明卿與他的女兒普魯修卡。", posterCreditUrl=dawn["sourceUrl"])
    films = {key(m["title"]):m for m in movies.values()}
    for alias, canonical in aliases.items():
        if canonical in films:
            films[alias] = films[canonical]
    tomorrow = (date.fromisoformat(TODAY) + timedelta(days=1)).isoformat()
    jobs = []
    for name, code in choices:
        place = branches.get(branch_key(name))
        area = next((area for prefix,area in areas.items() if code[1:].startswith(prefix)), None)
        if place and area:
            jobs.append((place, AT + f"{code}/a{area}/"))
    if not jobs:
        raise ValueError("Cannot map Vieshow branches in the AtMovies directory")
    def fetch_branch(job):
        place, base = job
        current = soup(base)
        upcoming = base + tomorrow.replace("-", "") + "/"
        pages = [(base, current)]
        if current.find("a",href=urlsplit(upcoming).path):
            pages.append((upcoming,soup(upcoming)))
        return place, base, pages
    checked = set()
    with ThreadPoolExecutor(max_workers=2) as pool:
        for place, base, pages in pool.map(fetch_branch,jobs):
            cid = "ref-" + str(place["id"])
            brand = "新光影城" if "新光" in place["location_name"] else "威秀影城"
            official = "https://www.skcinemas.com/sessions" if brand == "新光影城" else "https://www.vscinemas.com.tw/ShowTimes/"
            for source, page in pages:
                heading = next((h.get_text(strip=True) for h in page.select("h3")
                                if re.match(r"^\d{4}/\d{2}/\d{2}",h.get_text(strip=True))), "")
                if not heading:
                    continue
                day = heading[:10].replace("/", "-")
                if day != (TODAY if source == base else tomorrow):
                    continue
                checked.add(brand)
                for table in page.select("ul#theaterShowtimeTable"):
                    title = table.select_one(".filmTitle a")
                    m = films.get(key(title.get_text(strip=True))) if title else None
                    if not m:
                        continue
                    cinemas[cid] = dict(id=cid, name=place["location_name"], city=place["city"].replace("台","臺"),
                                        brand=brand, address=place["address"], lat=place["latitude"], lng=place["longitude"],
                                        sourceUrl=official)
                    for times in table.select("li > ul"):
                        version = ""
                        for item in times.find_all("li", recursive=False):
                            text = item.get_text(strip=True).replace("：",":")
                            if "filmVersion" in item.get("class",[]):
                                version = text
                            elif TIME.fullmatch(text) and text >= "06:00":
                                session(m,cid,day,text,version,source)
    if checked != {"新光影城", "威秀影城"}:
        raise ValueError(f"Missing dated AtMovies schedules for { {'新光影城', '威秀影城'} - checked }")


def main():
    upstream_time = reference()
    century()
    chin_chin()
    master = ambassador()
    showtimes_cinemas(master)
    atmovies_chains(master)
    active = {s["movieId"] for s in screenings.values() if s["date"] >= TODAY}
    recent = {s["movieId"] for s in screenings.values()}
    selected = [m for m in movies.values() if m["releaseDate"] > TODAY or m["id"] in recent]
    for m in selected:
        m["status"] = "upcoming" if m["releaseDate"] > TODAY else ("now" if m["id"] in active else "past")
        if not m["description"]:
            m["description"] = f'《{m["title"]}》的臺灣上映日期是 {m["releaseDate"]}。'
        m["poster"] = m["posterSource"]
        if m.get("backdropSource"):
            m["backdrop"] = m["backdropSource"]
    selected.sort(key=lambda m: (m["status"] != "now", m["releaseDate"], m["title"]))
    sessions = sorted(screenings.values(), key=lambda s: (s["date"], s["time"], s["cinemaId"], s["movieId"]))
    used = {s["cinemaId"] for s in sessions}
    assert selected and all(s["movieId"] in movies and s["cinemaId"] in cinemas for s in sessions)
    assert all(m["sourceUrl"] and m["releaseDate"] for m in selected)
    out = dict(updatedAt=datetime.now(TZ).isoformat(timespec="seconds"), referenceUpdatedAt=upstream_time,
               sourceName="國賓影城、喜樂時代影城、親親影城、秀泰影城、開眼電影網（新光、威秀及 MUVIE）、動畫電影上映地圖", sourceUrl=BASE,
               movies=selected, cinemas=[c for cid,c in cinemas.items() if cid in used], sessions=sessions)
    dest = SITE / "data.json"
    temp = dest.with_suffix(".json.tmp")
    temp.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(dest)
    print(f'{len(selected)} movies, {len(used)} cinemas, {len(sessions)} sessions')


if __name__ == "__main__":
    main()
