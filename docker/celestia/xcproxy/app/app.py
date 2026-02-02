#!/usr/bin/env python3
# xcproxy/app.py Xtream Codesâcompatible shim for TiviMate


import os, re, time, unicodedata, logging, html, json, difflib, threading
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote_plus
import requests
from fastapi import FastAPI, Request, Query
from fastapi.responses import JSONResponse, PlainTextResponse, Response, StreamingResponse

# ----------------------------
# Config
# ----------------------------
XC_VERSION        = os.getenv("XC_VERSION", "xcproxy-2025-09-09k14")

MOVIE_M3U_URL     = os.getenv("MOVIE_M3U_URL", "").strip()
SERIES_M3U_URL    = os.getenv("SERIES_M3U_URL", "").strip()
M3U_URL_FALLBACK  = os.getenv("M3U_URL", "").strip()

XC_USER           = os.getenv("XC_USER", "U")
XC_PASS           = os.getenv("XC_PASS", "P")
CACHE_TTL         = int(os.getenv("CACHE_TTL", "900"))

MOVIE_CAT_ID      = os.getenv("MOVIE_CAT_ID", "4292684328")
SERIES_CAT_ID     = os.getenv("SERIES_CAT_ID", "4292684329")

TMDB_API_KEY      = os.getenv("TMDB_API_KEY", "").strip()
TMDB_LANG         = os.getenv("TMDB_LANG", "en-US")
TMDB_IMG_BASE     = os.getenv("TMDB_IMG_BASE", "https://image.tmdb.org/t/p/w500")
TMDB_IMG_BACKDROP = os.getenv("TMDB_IMG_BACKDROP", "https://image.tmdb.org/t/p/w780")
POSTER_PREFERENCE = os.getenv("POSTER_PREFERENCE", "tmdb").lower()  # tmdb | m3u

ENRICH_DETAILS    = os.getenv("XC_ENRICH_DETAILS", "0").lower() in ("1", "true", "yes")

CACHE_FILE        = os.getenv("META_CACHE_FILE", "/cache/tmdb_cache.json")
STREAM_MODE       = os.getenv("STREAM_MODE", "redirect").lower()     # redirect | proxy
STREAM_CHUNK      = int(os.getenv("STREAM_CHUNK", "65536"))

# --- Category & Dedupe Options ---
CATEGORY_MODE      = os.getenv("CATEGORY_MODE", "default").lower()  # default | genre
CATEGORY_PICK_FIRST= os.getenv("CATEGORY_PICK_FIRST", "true").lower() in ("1","true","yes","on")
DEDUPE             = os.getenv("DEDUPE", "false").lower() in ("1","true","yes","on")
TMDB_ON_LIST       = os.getenv("TMDB_ON_LIST", "false").lower() in ("1","true","yes","on")

def _parse_pref_list(val: str, defaults: str) -> list:
    s = (val or defaults or "").strip()
    if not s: return []
    return [x.strip().lower() for x in s.split(",") if x.strip()]

PREF_QUALITY       = _parse_pref_list(os.getenv("PREF_QUALITY", ""), "2160p,1080p,720p,480p")
PREF_SOURCE        = _parse_pref_list(os.getenv("PREF_SOURCE", ""), "remux,bluray,web,webrip,other")

# ----------------------------
# App / logging
# ----------------------------
app = FastAPI()
log = logging.getLogger("xcproxy")
if not log.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# ----------------------------
# Caches (parsed lists + metadata)
# ----------------------------
_cache_movies: List[Dict[str, Any]] = []
_cache_series_eps: List[Dict[str, Any]] = []  # flat episode items
_cache_series_index: Dict[str, Any] = {}      # series_id -> dict
_cache_expiry_movies: float = 0.0
_cache_expiry_series: float = 0.0

_meta_lock = threading.Lock()
# key: "movie:<stream_id>" or "series:<series_title_lower>"
_meta: Dict[str, Dict[str, Any]] = {}

# ----------------------------
# Regex + helpers
# ----------------------------
YEAR_RX       = re.compile(r'(\b19\d{2}\b|\b20\d{2}\b)')
SE_EP_RX      = re.compile(r'(?i)\bS(\d{1,2})E(\d{1,2})\b')
SEASON_RX     = re.compile(r'(?i)\bseason\s*(\d{1,2})\b')
BRACKETED_RX  = re.compile(r'[\(\[][^)\]]{1,40}[\)\]]')
DUST_RX       = re.compile(r'(?i)\b(1080p|720p|2160p|4k|webrip|web[- ]?dl|blu[- ]?ray|brrip|bdrip|remux|hdr|hevc|x264|x265|h\.?264|h\.?265|av1|aac|dts|truehd|atmos|extended|unrated|proper|repack|limited|imax|hdr10\+?|dolby|vision|director.?s? ?cut|dual ?audio|multi ?audio|subbed|dubbed)\b')
SPACE_RX      = re.compile(r'\s{2,}')

_TMDB_GENRES_MOV = {28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",18:"Drama",10751:"Family",14:"Fantasy",36:"History",27:"Horror",10402:"Music",9648:"Mystery",10749:"Romance",878:"Science Fiction",10770:"TV Movie",53:"Thriller",10752:"War",37:"Western"}
_TMDB_GENRES_TV  = {10759:"Action & Adventure",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",18:"Drama",10751:"Family",10762:"Kids",9648:"Mystery",10763:"News",10764:"Reality",10765:"Sci-Fi & Fantasy",10766:"Soap",10767:"Talk",10768:"War & Politics",37:"Western",10759:"Action & Adventure"}

def now_ts() -> int: return int(time.time())

def _clean_title(s: str) -> str:
    leak = s.find('" tvg-')
    if leak != -1:
        s = s[:leak]
    s = unicodedata.normalize("NFC", s).strip().strip('"').strip()
    s = "".join(ch for ch in s if ch == "\t" or ch == "\n" or (0x20 <= ord(ch) <= 0x10FFFF))
    return s[:300]

def _clean_query_title(raw: str) -> str:
    s = BRACKETED_RX.sub(' ', raw)
    s = DUST_RX.sub(' ', s)
    s = s.replace('.', ' ').replace('_',' ')
    s = re.sub(r'\s+\b(19\d{2}|20\d{2})\b\s*$', ' ', s)
    s = SPACE_RX.sub(' ', s).strip()
    return s

def _extract_year_token(raw: str) -> str:
    m = YEAR_RX.search(raw or "")
    return m.group(1) if m else ""

def _guess_year(title: str, meta: Dict[str,str]) -> str:
    y = (meta.get("tvg-year") or meta.get("tvg_year") or "").strip()
    if y and YEAR_RX.fullmatch(y): return y
    m = YEAR_RX.search(title or "")
    return m.group(1) if m else ""

def _json(data: Any) -> JSONResponse:
    return JSONResponse(data, media_type="application/json",
                        headers={"Cache-Control": "no-store", "X-Server": XC_VERSION})

def _user_info() -> Dict[str, Any]:
    return {"auth":1,"status":"Active","username":XC_USER,"password":XC_PASS,
            "active_cons":0,"max_connections":1,"is_trial":0,"exp_date":"2147483647","message":""}

def _server_info(host_header: str, client_host: Optional[str]) -> Dict[str, Any]:
    host = "xcproxy.${CLUSTER_DOMAIN}"
    return {"url":host,"port":"443","https_port":"443","server_protocol":"https",
            "rtmp_port":"0","timezone":"UTC","timestamp_now":now_ts(),
            "time_now":time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),
            "process":True,"api_version":2,
            "allowed_output_formats":["m3u8","ts","mp4","mkv"]}

def _infer_ext(url: str) -> str:
    u = url.lower()
    for ext in ("m3u8","mp4","mkv","ts"):
        if u.endswith("." + ext) or f".{ext}?" in u:
            return ext
    return "mp4"

def _proxy_stream(url: str):
    def iterator():
        with requests.get(url, stream=True, timeout=20) as r:
            r.raise_for_status()
            for chunk in r.iter_content(chunk_size=STREAM_CHUNK):
                if chunk: yield chunk
    return StreamingResponse(iterator(), media_type="application/octet-stream")

def _load_meta_disk():
    global _meta
    try:
        if os.path.exists(CACHE_FILE):
            _meta = json.load(open(CACHE_FILE, "r", encoding="utf-8")) or {}
            if not isinstance(_meta, dict): _meta = {}
            log.info("Loaded TMDb cache: %d entries", len(_meta))
    except Exception as e:
        log.warning("TMDb cache load failed: %s", e); _meta = {}

def _save_meta_disk():
    try:
        os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
        tmp = CACHE_FILE + ".tmp"
        json.dump(_meta, open(tmp, "w", encoding="utf-8"))
        os.replace(tmp, CACHE_FILE)
    except Exception as e:
        log.warning("TMDb cache save failed: %s", e)

_load_meta_disk()

# ----------------------------
# Fetch helpers (URL or file)
# ----------------------------
def _read_text(src: str) -> str:
    if src.startswith("http://") or src.startswith("https://"):
        r = requests.get(src, timeout=25)
        r.raise_for_status()
        return r.text
    with open(src, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()

# ---------- NEW helpers for quality/source & dedupe ----------
def _norm_token(s: str) -> str:
    return (s or "").strip().lower()

def _extract_quality(title: str) -> str:
    t = _norm_token(title)
    if "2160p" in t or re.search(r'\b4k\b', t): return "2160p"
    if "1080p" in t: return "1080p"
    if "720p" in t: return "720p"
    if "480p" in t or re.search(r'\bsd\b', t): return "480p"
    return "other"

_SOURCE_PATTERNS = [
    ("remux",   re.compile(r'(?i)\bremux\b')),
    ("bluray",  re.compile(r'(?i)\bblu[- ]?ray|bdrip|brrip|bdremux\b')),
    ("webrip",  re.compile(r'(?i)\bweb[- ]?rip\b')),
    ("web",     re.compile(r'(?i)\bweb[- ]?dl\b|\bweb\b')),
    ("dvd",     re.compile(r'(?i)\bdvd|dvdrip\b')),
    ("hdtv",    re.compile(r'(?i)\bhdtv\b')),
    ("ts",      re.compile(r'(?i)\bts\b')),
    ("tc",      re.compile(r'(?i)\btc\b')),
    ("cam",     re.compile(r'(?i)\bcam\b')),
]

def _extract_source(title: str) -> str:
    t = _norm_token(title)
    for name, rx in _SOURCE_PATTERNS:
        if rx.search(t): return name
    return "other"

def _pref_index(val: str, ordered: list) -> int:
    try:
        return ordered.index(_norm_token(val))
    except Exception:
        return len(ordered) + 5

def _norm_title_for_grouping(title: str) -> str:
    return _clean_query_title(title).lower()

def _choose_best(items, get_title):
    def sort_key(it):
        q = _extract_quality(get_title(it))
        s = _extract_source(get_title(it))
        return (_pref_index(q, PREF_QUALITY), _pref_index(s, PREF_SOURCE), get_title(it))
    return sorted(items, key=sort_key)[0] if items else None

def _dedupe_movies(items: list) -> list:
    groups = {}
    for it in items:
        base = _norm_title_for_grouping(it.get("title",""))
        y = it.get("year") or _extract_year_token(it.get("title",""))
        key = (base, y or "")
        groups.setdefault(key, []).append(it)
    out = []
    for key, lst in groups.items():
        keep = _choose_best(lst, lambda x: x.get("title",""))
        if keep: out.append(keep)
    for i, it in enumerate(out, 1):
        it["num"] = i
    return out

def _dedupe_episodes(eps: list) -> list:
    groups = {}
    for it in eps:
        key = (it.get("series_id"), it.get("season"), it.get("episode"))
        groups.setdefault(key, []).append(it)
    out = []
    for key, lst in groups.items():
        keep = _choose_best(lst, lambda x: x.get("title",""))
        if keep: out.append(keep)
    return out

def _rebuild_series_index(orig_idx: dict, eps: list) -> dict:
    idx = {}
    for it in eps:
        sid = str(it.get("series_id"))
        s = idx.setdefault(sid, {
            "series_id": it.get("series_id"),
            "series_name": (orig_idx.get(sid) or {}).get("series_name",""),
            "poster": (orig_idx.get(sid) or {}).get("poster",""),
            "seasons": {},
        })
        season = it.get("season") or 1
        s["seasons"].setdefault(season, []).append(it)
    return idx

def _genre_category_id(kind: str, name: str) -> str:
    return str(abs(hash(f"{kind}-genre:{_norm_token(name)}")) % (2**31))

def _get_meta_if_cached(kind: str, key: str) -> dict:
    k = f"{kind}:{key}"
    with _meta_lock:
        return _meta.get(k) or {}

# ----------------------------
# TMDb client
# ----------------------------
MAX_PLOT = 600

def _tmdb_get(path: str, params: Dict[str, Any]) -> Dict[str, Any]:
    if not TMDB_API_KEY: return {}
    url = f"https://api.themoviedb.org/3{path}"
    params = {"api_key": TMDB_API_KEY, "language": TMDB_LANG, **params}
    try:
        r = requests.get(url, params=params, timeout=20)
        r.raise_for_status()
        return r.json() or {}
    except Exception as e:
        log.info("TMDb GET failed %s: %s", path, e)
        return {}

def _tmdb_search_movie(title: str, year_hint: str) -> Dict[str, Any]:
    q = _clean_query_title(title)
    y = year_hint.strip()[:4] if year_hint else ""
    res = _tmdb_get("/search/movie", {"query": q, **({"year": y} if y else {})})
    if not res or not res.get("results"): return {}
    return res["results"][0]

def _tmdb_search_tv(title: str) -> Dict[str, Any]:
    q = _clean_query_title(title)
    res = _tmdb_get("/search/tv", {"query": q})
    if not res or not res.get("results"): return {}
    # rank: higher vote_count, closer title
    best = None; best_score = -1
    for r in res["results"]:
        score = (r.get("vote_count") or 0) * 2
        score -= difflib.SequenceMatcher(None, q.lower(), (r.get("name") or "").lower()).ratio()
        if best is None or score > best_score:
            best, best_score = r, score
    return best or {}

def _tmdb_movie_details(movie_id: int) -> Dict[str, Any]:
    det = _tmdb_get(f"/movie/{movie_id}", {"append_to_response": "credits"})
    return det or {}

def _tmdb_tv_details(tv_id: int) -> Dict[str, Any]:
    det = _tmdb_get(f"/tv/{tv_id}", {"append_to_response": "aggregate_credits,credits"})
    return det or {}

def _enrich_movie(title: str, year_hint: str) -> Dict[str, Any]:
    res = _tmdb_search_movie(title, year_hint)
    if not res:
        return {"year": year_hint, "genres": [], "plot": "", "poster": "", "backdrop": ""}

    genres = [_TMDB_GENRES_MOV.get(gid, "") for gid in (res.get("genre_ids") or [])]
    genres = [g for g in genres if g]
    plot = (res.get("overview") or "").strip()
    if plot and len(plot) > MAX_PLOT: plot = plot[:MAX_PLOT] + "…"
    poster = f"{TMDB_IMG_BASE}{res['poster_path']}" if res.get("poster_path") else ""
    backdrop = f"{TMDB_IMG_BACKDROP}{res['backdrop_path']}" if res.get("backdrop_path") else ""
    year = (res.get("release_date") or "")[:4] if res.get("release_date") else year_hint

    enriched = {"year": year, "genres": genres, "plot": plot, "poster": poster, "backdrop": backdrop}

    if ENRICH_DETAILS:
        try:
            det = _tmdb_movie_details(int(res.get("id") or 0)) or {}
        except Exception:
            det = {}
        if det:
            try:
                run_list = [int(x.get("runtime") or 0) for x in [det] if x.get("runtime")]
                if run_list:
                    enriched["runtime_minutes"] = int(sum(run_list) / len(run_list))
            except Exception:
                pass
            vote_avg = det.get("vote_average")
            if vote_avg is not None:
                enriched["rating_tmdb"] = vote_avg
            cast = (det.get("credits") or {}).get("cast") or []
            cast_names = [c.get("name") for c in cast if c.get("name")][:8]
            if cast_names:
                enriched["cast"] = ", ".join(cast_names)
    return enriched

def _enrich_series(title: str) -> Dict[str, Any]:
    res = _tmdb_search_tv(title)
    if not res:
        return {"first_air_year": "", "genres": [], "plot": "", "poster": "", "backdrop": ""}

    genres = [_TMDB_GENRES_TV.get(gid, "") for gid in (res.get("genre_ids") or [])]
    genres = [g for g in genres if g]
    plot = (res.get("overview") or "").strip()
    if plot and len(plot) > MAX_PLOT: plot = plot[:MAX_PLOT] + "…"
    poster = f"{TMDB_IMG_BASE}{res['poster_path']}" if res.get("poster_path") else ""
    backdrop = f"{TMDB_IMG_BACKDROP}{res['backdrop_path']}" if res.get("backdrop_path") else ""
    first_air = (res.get("first_air_date") or "")[:4]

    enriched = {"first_air_year": first_air, "genres": genres, "plot": plot, "poster": poster, "backdrop": backdrop}

    if ENRICH_DETAILS:
        try:
            det = _tmdb_tv_details(int(res.get("id") or 0)) or {}
        except Exception:
            det = {}
        if det:
            vote_avg = det.get("vote_average")
            if vote_avg is not None:
                enriched["rating_tmdb"] = vote_avg
            cast_agg = (det.get("aggregate_credits") or {}).get("cast") or []
            cast_std = (det.get("credits") or {}).get("cast") or []
            cast_src = cast_agg if cast_agg else cast_std
            cast_names = [c.get("name") for c in cast_src if c.get("name")][:8]
            if cast_names:
                enriched["cast"] = ", ".join(cast_names)
    return enriched

def _get_meta(kind: str, key: str, builder) -> Dict[str, Any]:
    k = f"{kind}:{key}"
    with _meta_lock:
        hit = _meta.get(k)
    if hit: return hit
    info = builder()
    with _meta_lock:
        _meta[k] = info
        if len(_meta) % 20 == 0: _save_meta_disk()
    return info

# ----------------------------
# Poster selection
# ----------------------------
def _pick_poster(feed_logo: str, md: Dict[str, Any]) -> str:
    if POSTER_PREFERENCE == "m3u" and feed_logo and feed_logo != "NONE":
        return feed_logo
    if md.get("poster"): return md["poster"]
    if feed_logo and feed_logo != "NONE": return feed_logo
    return ""

# ----------------------------
# M3U parsing
# ----------------------------
def _parse_m3u_movies(text: str) -> List[Dict[str, Any]]:
    extinf_re = re.compile(r'#EXTINF:-?\d+\s*(?P<attrs>[^,]*)\s*,(?P<title>.*)$')
    attr_re   = re.compile(r'(\w[\w-]*)="([^"]*)"')
    items: List[Dict[str, Any]] = []
    meta: Dict[str,str] = {}; title: Optional[str] = None
    for line in text.splitlines():
        if line.startswith("#EXTINF:"):
            m = extinf_re.match(line)
            if not m: meta = {}; title = None; continue
            attrs_raw = m.group("attrs") or ""; raw_title = m.group("title") or ""
            meta = {k.lower(): v for (k, v) in attr_re.findall(attrs_raw)}
            if "tvg_logo" in meta and "tvg-logo" not in meta: meta["tvg-logo"] = meta["tvg_logo"]
            title = _clean_title(raw_title)
        elif line and not line.startswith("#"):
            if not title: continue
            url = line.strip()
            hid = abs(hash("movie:" + url)) % (2**31)
            poster = meta.get("tvg-logo") or "NONE"
            year   = _guess_year(title, meta)
            ext = _infer_ext(url)
            items.append({
                "num": len(items)+1,
                "stream_id": hid,
                "title": title,
                "stream_icon": poster,
                "year": year,
                "category_id": MOVIE_CAT_ID,
                "container_extension": ext,
                "direct_source": url,
            })
            meta = {}; title = None
    return items

def _parse_m3u_series(text: str) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Return (episodes_list, series_index) where series_index[series_id] = {..., seasons{season:[eps...]}}"""
    extinf_re = re.compile(r'#EXTINF:-?\d+\s*(?P<attrs>[^,]*)\s*,(?P<title>.*)$')
    attr_re   = re.compile(r'(\w[\w-]*)="([^"]*)"')
    eps: List[Dict[str, Any]] = []
    idx: Dict[str, Any] = {}
    meta: Dict[str,str] = {}; title: Optional[str] = None

    def put_episode(series_name: str, season: int, episode: int, ep_title: str, url: str, poster: str, meta: Dict[str,str]):
        sid = str(abs(hash("series:" + series_name.lower())) % (2**31))
        eid = abs(hash("ep:" + url)) % (2**31)
        show = idx.setdefault(sid, {
            "series_id": int(sid),
            "series_name": series_name,
            "poster": poster,
            "seasons": {},   # season_number -> [episode dicts]
        })
        ext = _infer_ext(url)
        ep = {
            "id": eid,
            "title": ep_title or f"S{season:02d}E{episode:02d}",
            "season": season,
            "episode": episode,
            "series_id": int(sid),
            "poster": poster,
            "container_extension": ext,
            "direct_source": url,
        }
        show["seasons"].setdefault(season, []).append(ep)
        eps.append({"series_id": int(sid), **ep})

    for line in text.splitlines():
        if line.startswith("#EXTINF:"):
            m = extinf_re.match(line)
            if not m: meta = {}; title = None; continue
            attrs_raw = m.group("attrs") or ""; raw_title = m.group("title") or ""
            meta = {k.lower(): v for (k, v) in attr_re.findall(attrs_raw)}
            if "tvg_logo" in meta and "tvg-logo" not in meta: meta["tvg-logo"] = meta["tvg_logo"]
            title = _clean_title(raw_title)
        elif line and not line.startswith("#"):
            if not title: continue
            url = line.strip()
            poster = meta.get("tvg-logo") or "NONE"
            raw = title

            s = e = None
            m2 = SE_EP_RX.search(raw or "")
            if m2:
                s = int(m2.group(1)); e = int(m2.group(2))
                show_name = SE_EP_RX.sub('', raw).strip(" -–:_")
                ep_title = raw
            else:
                m3 = SEASON_RX.search(raw or "")
                if m3:
                    s = int(m3.group(1)); e = 1
                    show_name = SEASON_RX.sub('', raw).strip(" -–:_")
                    ep_title = raw
                else:
                    s, e = 1, 1
                    show_name = raw
                    ep_title = raw
            put_episode(show_name.strip(), s, e, ep_title.strip(), url, poster, meta)
            meta = {}; title = None
    return eps, idx

# ----------------------------
# Loaders with caching
# ----------------------------
def load_movies() -> List[Dict[str, Any]]:
    global _cache_movies, _cache_expiry_movies
    if _cache_movies and time.time() < _cache_expiry_movies:
        return _cache_movies
    source = MOVIE_M3U_URL or M3U_URL_FALLBACK
    if not source:
        _cache_movies, _cache_expiry_movies = [], time.time()+60
        return _cache_movies
    try:
        text = _read_text(source)
        items = _parse_m3u_movies(text)
        if DEDUPE:
            items = _dedupe_movies(items)
        _cache_movies = items
        _cache_expiry_movies = time.time() + CACHE_TTL
        log.info("Loaded %d movies from %s", len(_cache_movies), ("URL" if source.startswith("http") else "file"))
    except Exception as e:
        log.info("Failed to load movies feed: %s", e)
        _cache_movies, _cache_expiry_movies = [], time.time() + 60
    return _cache_movies

def load_series() -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    global _cache_series_eps, _cache_series_index, _cache_expiry_series
    if _cache_series_eps and time.time() < _cache_expiry_series:
        return _cache_series_eps, _cache_series_index
    source = SERIES_M3U_URL or ""
    if not source:
        _cache_series_eps, _cache_series_index, _cache_expiry_series = [], {}, time.time()+60
        return _cache_series_eps, _cache_series_index
    try:
        text = _read_text(source)
        eps, idx = _parse_m3u_series(text)
        if DEDUPE:
            eps = _dedupe_episodes(eps)
            idx = _rebuild_series_index(idx, eps)
        _cache_series_eps, _cache_series_index = eps, idx
        _cache_expiry_series = time.time() + CACHE_TTL
        log.info("Loaded %d series episodes (%d series) from %s", len(eps), len(idx), ("URL" if source.startswith("http") else "file"))
    except Exception as e:
        log.info("Failed to load series feed: %s", e)
        _cache_series_eps, _cache_series_index, _cache_expiry_series = [], {}, time.time() + 60
    return _cache_series_eps, _cache_series_index

# ----------------------------
# Merge helpers (apply enrichment to XC responses)
# ----------------------------
def _apply_enrichment_xtream_movie(item: Dict[str, Any], md: Dict[str, Any]) -> Dict[str, Any]:
    if not md: return item

    r = md.get("rating_tmdb")
    if r is not None:
        try:
            rv = float(r)
            item["rating"] = f"{round(rv, 1):.1f}"
            item["rating_5based"] = f"{round(rv/2.0, 1):.1f}"
        except Exception:
            pass
    if md.get("runtime_minutes"):
        try:
            mins = int(md["runtime_minutes"])
            item["duration"] = str(mins)
            item["duration_secs"] = mins * 60
        except Exception:
            pass
    if md.get("cast"): item["cast"] = md["cast"]
    return item

def _apply_enrichment_xtream_tv(item: Dict[str, Any], md: Dict[str, Any]) -> Dict[str, Any]:
    if not md: return item

    r = md.get("rating_tmdb")
    if r is not None:
        try:
            rv = float(r)
            item["rating"] = f"{round(rv, 1):.1f}"
            item["rating_5based"] = f"{round(rv/2.0, 1):.1f}"
        except Exception:
            pass
    if md.get("cast"): item["cast"] = md["cast"]
    return item

# ----------------------------
# Diagnostics / health
# ----------------------------
@app.get("/health")
def health():
    m, (eps, sidx) = load_movies(), load_series()
    return _json({"ok": True, "movies": len(m), "episodes": len(eps), "series": len(sidx), "time": now_ts()})

@app.get("/diag/series_lookup")
def diag_series_lookup(title: str):
    md = _enrich_series(title)
    return _json(md)

@app.get("/debug_sample")
def debug_sample():
    movies = load_movies()
    out = []
    for it in movies[:10]:
        md = _get_meta("movie", str(it["stream_id"]), lambda: _enrich_movie(it["title"], it.get("year","")))
        out.append({"title": it["title"], "genres": md.get("genres")})
    return _json(out)

# ----------------------------
# Xtream Codes endpoints
# ----------------------------
@app.get("/panel_api.php")
def panel_api():
    server = _server_info("", None)
    return _json({"user_info": _user_info(), "server_info": server})

@app.get("/player_api.php")
def player_api(
    request: Request,
    action: Optional[str] = Query(None),
    username: Optional[str] = None,
    password: Optional[str] = None,
    category_id: Optional[str] = None,
    vod_id: Optional[int] = None,
    series_id: Optional[int] = None,
    limit: Optional[int] = None,
):
    movies = load_movies()
    eps, sidx = load_series()

    if not action:
        server = _server_info(request.headers.get("host",""), request.client.host if request.client else None)
        return _json({"user_info": _user_info(), "server_info": server})
    if action == "get_live_categories" or action == "get_live_streams":
        return _json([])

    if action == "get_vod_categories":
        if CATEGORY_MODE != "genre":
            return _json([{"category_id": MOVIE_CAT_ID, "category_name": "Movie VOD", "parent_id": "0"}])
        # Build genre categories
        cats = {}
        for it in movies:
            if TMDB_ON_LIST:
                def build(): return _enrich_movie(it["title"], it.get("year",""))
                md = _get_meta("movie", str(it["stream_id"]), build)
            else:
                md = _get_meta_if_cached("movie", str(it["stream_id"]))
            genres = md.get("genres") or []
            if not genres:
                cats.setdefault("Uncategorized", _genre_category_id("movie","Uncategorized"))
            else:
                if CATEGORY_PICK_FIRST:
                    g = sorted(genres, key=lambda s: s.lower())[0]
                    cats.setdefault(g, _genre_category_id("movie", g))
                else:
                    for g in genres:
                        cats.setdefault(g, _genre_category_id("movie", g))
        out = [{"category_id": v, "category_name": k, "parent_id": "0"} for k,v in sorted(cats.items(), key=lambda kv: kv[0].lower())]
        if not out:
            out = [{"category_id": MOVIE_CAT_ID, "category_name": "Movie VOD", "parent_id": "0"}]
        return _json(out)
    if action == "get_series_categories":
        if CATEGORY_MODE != "genre":
            return _json([{"category_id": SERIES_CAT_ID, "category_name": "Series VOD", "parent_id": "0"}] if sidx else [])
        cats = {}
        for sid, s in sidx.items():
            series_title = s.get("series_name","")
            if not series_title: continue
            if TMDB_ON_LIST:
                def build_tv(): return _enrich_series(series_title)
                md = _get_meta("series", series_title.lower(), build_tv)
            else:
                md = _get_meta_if_cached("series", series_title.lower())
            genres = md.get("genres") or []
            if not genres:
                cats.setdefault("Uncategorized", _genre_category_id("series","Uncategorized"))
            else:
                if CATEGORY_PICK_FIRST:
                    g = sorted(genres, key=lambda s: s.lower())[0]
                    cats.setdefault(g, _genre_category_id("series", g))
                else:
                    for g in genres:
                        cats.setdefault(g, _genre_category_id("series", g))
        out = [{"category_id": v, "category_name": k, "parent_id": "0"} for k,v in sorted(cats.items(), key=lambda kv: kv[0].lower())]
        return _json(out)

    if action == "get_vod_streams":
        m = movies[:limit] if (isinstance(limit,int) and limit>0) else movies
        out = []
        for it in m:
            def build():
                return _enrich_movie(it["title"], it.get("year",""))
            md = _get_meta("movie", str(it["stream_id"]), build) or {"year": it.get("year",""), "genres": [], "plot": "", "poster": "", "backdrop": ""}
            poster_final = _pick_poster(it["stream_icon"], md)

            # Compute category id
            cat_id = str(MOVIE_CAT_ID)
            if CATEGORY_MODE == "genre":
                genres = md.get("genres") or []
                if not genres:
                    cat_id = _genre_category_id("movie","Uncategorized")
                else:
                    g = sorted(genres, key=lambda s: s.lower())[0] if CATEGORY_PICK_FIRST else (genres[0] if genres else "Uncategorized")
                    cat_id = _genre_category_id("movie", g)

            item = {
                "num": it.get("num", 0),
                "name": it["title"],
                "title": it["title"],
                "stream_type": "movie",
                "stream_id": int(it["stream_id"]),
                "stream_icon": poster_final,
                "rating": "0.0", "rating_5based": "0.0",
                "added": str(now_ts()),
                "category_id": cat_id,
                "container_extension": it["container_extension"],
                "year": md.get("year") or it.get("year") or "",
                "genre": ", ".join(md.get("genres") or []),
                "plot": md.get("plot") or "",
                "backdrop_path": md.get("backdrop") or "",
                "direct_source": "",
            }
            item = _apply_enrichment_xtream_movie(item, md)
            out.append(item)
        return _json(out)

    if action == "get_vod_info":
        if vod_id is None: return _json({"info": {}, "movie_data": {}})
        it = next((x for x in movies if x["stream_id"] == vod_id), None)
        if not it: return _json({"info": {}, "movie_data": {}})
        def build(): return _enrich_movie(it["title"], it.get("year",""))
        md = _get_meta("movie", str(it["stream_id"]), build) or {"year": it.get("year",""), "genres": [], "plot": "", "poster": "", "backdrop": ""}
        poster_final = _pick_poster(it["stream_icon"], md)
        info = {"movie_image": poster_final, "tmdb_id": "", "youtube_trailer":"","genre":", ".join(md.get("genres") or []), "plot": md.get("plot") or "", "releasedate": md.get("year") or "", "duration_secs": 0, "duration": "", "video": {}, "audio": {}}
        info = _apply_enrichment_xtream_movie(info, md)
        movie_data = {
            "stream_id": it["stream_id"],
            "name": it["title"],
            "extension": it["container_extension"],
            "info": {"name": it["title"], "year": md.get("year") or it.get("year") or "", "tmdb": "", "releaseDate": md.get("year") or "" },
            "added": str(now_ts()),
            "category_id": cat_id if 'cat_id' in locals() else str(MOVIE_CAT_ID), "container_extension": it["container_extension"],
            "custom_sid": "", "direct_source": "",
        }
        return _json({"info": info, "movie_data": movie_data})

    if action == "get_series":
        out = []
        src = list(sidx.items())
        if isinstance(limit, int) and limit > 0:
            src = src[:limit]
        for sid, s in src:
            series_title = s["series_name"]
            def build_tv():
                return _enrich_series(series_title)
            md = _get_meta("series", series_title.lower(), build_tv) or {"genres": [], "plot": "", "poster": "", "backdrop": "", "first_air_year": ""}
            poster = _pick_poster(s.get("poster") or "", md)

            # Compute series category id
            cat_id = str(SERIES_CAT_ID)
            if CATEGORY_MODE == "genre":
                genres = md.get("genres") or []
                if not genres:
                    cat_id = _genre_category_id("series","Uncategorized")
                else:
                    g = sorted(genres, key=lambda s: s.lower())[0] if CATEGORY_PICK_FIRST else (genres[0] if genres else "Uncategorized")
                    cat_id = _genre_category_id("series", g)

            item = {
                "num": 0,
                "name": series_title,
                "series_name": series_title,
                "series_id": int(sid),
                "cover": poster,
                "plot": md.get("plot") or "",
                "genre": ", ".join(md.get("genres") or []),
                "releaseDate": md.get("first_air_year") or "",
                "rating": "0.0", "rating_5based": "0.0",
                "category_id": cat_id,
                "backdrop_path": md.get("backdrop") or "",
                "stream_icon": poster,
            }
            item = _apply_enrichment_xtream_tv(item, md)
            out.append(item)
        return _json(out)

    if action == "get_series_info":
        if series_id is None: return _json({"episodes": {}, "info": {}, "seasons": []})
        s = sidx.get(str(series_id))
        if not s: return _json({"episodes": {}, "info": {}, "seasons": []})
        series_title = s["series_name"]
        def build_tv():
            return _enrich_series(series_title)
        md = _get_meta("series", series_title.lower(), build_tv) or {"genres": [], "plot": "", "poster": "", "backdrop": "", "first_air_year": ""}
        poster = _pick_poster(s.get("poster") or "", md)

        episodes_out: Dict[str, List[Dict[str, Any]]] = {}
        seasons = []
        for season, eps_list in sorted(s["seasons"].items()):
            seasons.append({"air_date": "", "season_number": season, "name": f"Season {season}"})
            for ep in sorted(eps_list, key=lambda x: x.get("episode", 1)):
                ep_title = ep.get("title") or ep.get("group_title") or f"S{(ep.get('season') or 1):02d}E{(ep.get('episode') or 1):02d}"
                ep_title = re.sub(r"\[.*?\]", "", ep_title).strip()
                item = {
                    "id": ep["id"],
                    "episode_num": ep.get("episode") or 1,
                    "title": ep_title,
                    "container_extension": ep.get("container_extension") or "mp4",
                    "episode_run_time": ep.get("episode_run_time") or 30,
                    "_keys": list(ep.keys())
                }
                for k, v in ep.items():
                    if k not in item:
                        item[k] = v
                episodes_out.setdefault(str(season), []).append(item)

        info = {
            "name": series_title, "cover": poster, "plot": md.get("plot") or "",
            "genre": ", ".join(md.get("genres") or []), "releaseDate": md.get("first_air_year") or "",
            "rating": "0.0", "rating_5based": "0.0",
        }
        info = _apply_enrichment_xtream_tv(info, md)

        return _json({"episodes": episodes_out, "info": info, "seasons": seasons})

    return _json({"user_info": _user_info(), "server_info": _server_info("", None)})

@app.get("/xmltv.php")
def xmltv():
    movies = load_movies()
    eps, sidx = load_series()
    # Minimal XMLTV (unchanged)
    xml = '<?xml version="1.0" encoding="UTF-8"?><tv>'
    for it in movies:
        xml += f'<channel id="movie-{it["stream_id"]}"><display-name>{html.escape(it["title"])}</display-name></channel>'
    for sid, s in sidx.items():
        xml += f'<channel id="series-{sid}"><display-name>{html.escape(s["series_name"])}</display-name></channel>'
    xml += "</tv>"
    return Response(content=xml, media_type="application/xml",
                    headers={"Cache-Control":"no-store","X-Server":XC_VERSION})

@app.head("/xmltv.php")
def xmltv_head(username: str, password: str):
    return Response(status_code=200, headers={"X-Server": XC_VERSION})

# ----------------------------
# Playback (HEAD/GET)
# ----------------------------
@app.head("/movie/{username}/{password}/{stream_id}.{ext}")
@app.get ("/movie/{username}/{password}/{stream_id}.{ext}")
def movie_proxy(username: str, password: str, stream_id: int, ext: str = "mp4"):
    if username != XC_USER or password != XC_PASS:
        return PlainTextResponse("Unauthorized", status_code=401)
    it = next((x for x in load_movies() if x["stream_id"] == stream_id), None)
    if not it: return PlainTextResponse("Not Found", status_code=404)
    url = it["direct_source"]
    return _proxy_stream(url) if STREAM_MODE == "proxy" else PlainTextResponse("", status_code=302, headers={"Location": url})

@app.head("/series/{username}/{password}/{episode_id}.{ext}")
@app.get ("/series/{username}/{password}/{episode_id}.{ext}")
def series_proxy(username: str, password: str, episode_id: int, ext: str = "mp4"):
    if username != XC_USER or password != XC_PASS:
        return PlainTextResponse("Unauthorized", status_code=401)
    eps, _ = load_series()
    ep = next((x for x in eps if x["id"] == episode_id), None)
    if not ep: return PlainTextResponse("Not Found", status_code=404)
    url = ep["direct_source"]
    return _proxy_stream(url) if STREAM_MODE == "proxy" else PlainTextResponse("", status_code=302, headers={"Location": url})

# ----------------------------
# get.php tester
# ----------------------------
@app.get("/get.php")
def get_php(username: str, password: str, type: str = "m3u", output: str = "m3u8"):
    if username != XC_USER or password != XC_PASS:
        return PlainTextResponse("# Unauthorized\n", media_type="audio/x-mpegurl")
    host = f"https://xcproxy.${CLUSTER_DOMAIN}"
    lines = ["#EXTM3U"]
    # Movie entries
    for it in load_movies():
        name = it["title"]
        url = f"{host}/movie/{quote_plus(username)}/{quote_plus(password)}/{it['stream_id']}.{it['container_extension']}"
        lines.append(f'#EXTINF:-1 tvg-id="" tvg-name="{name}" tvg-logo="{it["stream_icon"]}" group-title="Movie VOD",{name}')
        lines.append(url)
    # Series entries: we expose episodes with series title in group
    eps, sidx = load_series()
    for ep in eps:
        s = sidx.get(str(ep["series_id"])) or {}
        series_name = s.get("series_name") or "Series"
        name = f'{series_name} - {ep.get("title")}'
        url = f"{host}/series/{quote_plus(username)}/{quote_plus(password)}/{ep['id']}.{ep.get('container_extension') or 'mp4'}"
        lines.append(f'#EXTINF:-1 tvg-id="" tvg-name="{name}" tvg-logo="{ep.get("poster") or ""}" group-title="{series_name}",{name}')
        lines.append(url)
    return PlainTextResponse("\n".join(lines) + "\n", media_type="audio/x-mpegurl")

@app.get("/")
def root_compat():
    return PlainTextResponse("OK")
