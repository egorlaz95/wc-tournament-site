from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS

import requests
from datetime import datetime, timezone
from pathlib import Path

import time

CACHE = {
    "matches": {
        "data": None,
        "timestamp": 0
    }
}

CACHE_TTL = 60  # секунд

import json

def log(title, data):
    print("\n" + "=" * 80)
    print(title)
    print("=" * 80)
    print(json.dumps(data, indent=2, ensure_ascii=False))

app = Flask(
    __name__,
    static_folder="public",
    static_url_path=""
)

CORS(app)

def today_date():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ==========================================
# FRONTEND
# ==========================================

@app.route("/")
def index():
    return send_from_directory("public", "index.html")


# ==========================================
# API MATCHES
# ==========================================

@app.route("/api/matches")
def matches():
    try:
        # ?date=YYYY-MM-DD overrides today (for testing / browsing other days)
        date_filter = request.args.get("date") or today_date()

        url = f"https://api.sstats.net/games/list?LeagueId=303&Year=2025&Date={date_filter}&Limit=100"

        response = requests.get(url, headers={"Accept": "application/json"}, timeout=20)
        data = response.json()

        log("RAW API RESPONSE (LIST)", data)

        matches_raw = unwrap(data)

        all_matches = []

        for item in matches_raw:
            match = normalize_match(item)
            if not match:
                continue
            if match["date"] != date_filter:
                continue
            match["odds"] = extract_match_odds(item.get("odds", []))
            all_matches.append(match)

        # Upcoming/live first (by kick-off asc), completed last (most recent first)
        not_ended = sorted(
            [m for m in all_matches if int(m.get("status", 1)) <= 7],
            key=lambda m: m["dateTimeRaw"]
        )
        completed = sorted(
            [m for m in all_matches if int(m.get("status", 1)) > 7],
            key=lambda m: m["dateTimeRaw"],
            reverse=True
        )

        result = not_ended + completed

        log("FINAL MATCHES RESULT", result)

        return jsonify(result)

    except Exception as e:
        print("\n❌ ERROR:\n", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/team/<team_id>")
def team(team_id):
    try:
        url = f"https://api.sstats.net/teams/{team_id}"

        res = requests.get(
            url,
            headers={"Accept": "application/json"},
            timeout=20
        )

        return jsonify(res.json())

    except Exception as e:
        return jsonify({"error": str(e)}), 500

def unwrap(data):
    if not data:
        return []

    if isinstance(data, list):
        return data

    if isinstance(data.get("data"), list):
        return data["data"]

    if isinstance(data.get("games"), list):
        return data["games"]

    if isinstance(data.get("response"), list):
        return data["response"]

    return []


# ==========================================
# NORMALIZE MATCH
# ==========================================

def normalize_match(item):
    try:
        date_raw = item.get("date")

        if not date_raw:
            return None

        dt = datetime.fromisoformat(
            date_raw.replace("Z", "+00:00")
        )

        home_team = item.get("homeTeam") or {}
        away_team = item.get("awayTeam") or {}

        # Status: 1=not scheduled, 2=not started, 3-7=live, 8-10=ended
        status = item.get("status") or 1

        # Full-time score — try the most common field name variants
        home_score = item.get("homeScore")
        if home_score is None:
            home_score = item.get("homeFullTimeScore")
        away_score = item.get("awayScore")
        if away_score is None:
            away_score = item.get("awayFullTimeScore")

        league_obj = item.get("league") or {}
        season_obj = item.get("season") or {}
        league_name = (
            league_obj.get("name")
            or (season_obj.get("league") or {}).get("name")
            or item.get("leagueName")
            or ""
        )

        return {
            "id": str(item.get("id")),

            "home": home_team.get("name") or "Home",
            "away": away_team.get("name") or "Away",

            "homeTeamId": str(home_team.get("id") or ""),
            "awayTeamId": str(away_team.get("id") or ""),

            "status": status,
            "homeScore": home_score,
            "awayScore": away_score,

            "time": dt.strftime("%H:%M"),
            "date": dt.strftime("%Y-%m-%d"),
            "dateTimeRaw": date_raw,

            "league": league_name,
            "group":  item.get("roundName") or "",

            "odds": extract_match_odds(item.get("odds", []))
        }

    except Exception as e:
        print("NORMALIZE ERROR:", e)
        return None


# ==========================================
# ODDS
# ==========================================
def extract_match_odds(odds_list):
    if not odds_list:
        return None

    # иногда odds может быть не списком маркетов
    if isinstance(odds_list, dict):
        odds_list = odds_list.get("markets", []) or []

    market = next(
        (m for m in odds_list if m.get("marketId") == 1),
        None
    )

    if not market:
        return None

    result = {"home": None, "draw": None, "away": None}

    for odd in market.get("odds", []):
        name = odd.get("name")
        value = odd.get("value")

        if name == "Home":
            result["home"] = value
        elif name == "Draw":
            result["draw"] = value
        elif name == "Away":
            result["away"] = value

    return result if any(result.values()) else None


# ==========================================
# LINEUPS
# ==========================================


def get_cached_matches():
    now = time.time()

    if (
        CACHE["matches"]["data"] is not None and
        now - CACHE["matches"]["timestamp"] < CACHE_TTL
    ):
        print("⚡ CACHE HIT")
        return CACHE["matches"]["data"]

    print("🔥 CACHE MISS - fetching API")

    url = "https://api.sstats.net/games/list?LeagueId=2&Year=2025"

    response = requests.get(
        url,
        headers={"Accept": "application/json"},
        timeout=20
    )

    data = response.json()
    matches_raw = unwrap(data)

    processed = []

    for item in matches_raw:
        match = normalize_match(item)
        if match and match["date"] == today_date():
            processed.append(match)

    processed.sort(key=lambda x: x["dateTimeRaw"])

    CACHE["matches"] = {
        "data": processed,
        "timestamp": now
    }

    return processed

# ==========================================
# START
# ==========================================

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 3000))
    app.run(host="0.0.0.0", port=port, debug=False)