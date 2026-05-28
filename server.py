from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

import requests
from datetime import datetime
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

TARGET_DATE = "2026-05-30"


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
        url = "https://api.sstats.net/games/list?LeagueId=2&Year=2025"

        response = requests.get(url, headers={"Accept": "application/json"}, timeout=20)
        data = response.json()

        log("RAW API RESPONSE (LIST)", data)

        matches_raw = unwrap(data)

        log("UNWRAPPED MATCHES", matches_raw[:5])  # чтобы не заспамить

        matches = []

        for idx, item in enumerate(matches_raw):

            log(f"MATCH RAW #{idx}", item)

            match = normalize_match(item)


            log(f"NORMALIZED MATCH #{idx}", match)

            if not match:
                continue

            if match["date"] != TARGET_DATE:
                continue

            # ===== DETAILS =====

            odds = extract_match_odds(item.get("odds", []))

            log(f"ODDS MATCH ID {match['id']}", odds)

            match["odds"] = odds

            matches.append(match)

        log("FINAL MATCHES RESULT", matches)

        matches.sort(key=lambda x: x["dateTimeRaw"])

        return jsonify(matches[:3])

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

        return {
            "id": str(item.get("id")),

            "home":
                item.get("homeTeam", {}).get("name")
                or "Home",

            "away":
                item.get("awayTeam", {}).get("name")
                or "Away",

            "time":
                dt.strftime("%H:%M"),

            "date":
                dt.strftime("%Y-%m-%d"),

            "dateTimeRaw":
                date_raw,

            "group":
                item.get("roundName")
                or "World Cup",

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
        if match and match["date"] == TARGET_DATE:
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
    app.run(
        host="0.0.0.0",
        port=3000,
        debug=True
    )