import os
import random
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import requests
from datetime import datetime
import sys 

load_dotenv()

app = Flask(__name__, static_folder="static")
CORS(app)

# ── GitHub API ──────────────────────────────────────────────────────────────

def fetch_contributions(username):
    token = os.environ.get("TOKEN")
    if not token:
        return None, "TOKEN environment variable not set."

    headers = {"Authorization": f"Bearer {token}"}

    # First, get user info + account creation year
    user_query = """
    query($login: String!) {
        user(login: $login) {
            name
            avatarUrl
            createdAt
        }
    }
    """
    try:
        resp = requests.post(
            "https://api.github.com/graphql",
            json={"query": user_query, "variables": {"login": username}},
            headers=headers,
            timeout=10,
        )
    except requests.exceptions.RequestException:
        return None, "Could not reach GitHub API."

    if resp.status_code != 200:
        return None, "GitHub API request failed."

    data = resp.json()
    if "errors" in data or data["data"]["user"] is None:
        return None, "GitHub user not found."

    user = data["data"]["user"]
    created_year = int(user["createdAt"][:4])
    current_year = datetime.now().year

    # Query contributions year by year
    year_query = """
    query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
            contributionsCollection(from: $from, to: $to) {
                contributionCalendar {
                    totalContributions
                    weeks {
                        contributionDays {
                            contributionCount
                            date
                        }
                    }
                }
            }
        }
    }
    """

    all_days = []
    total_contributions = 0

    for year in range(created_year, current_year + 1):
        variables = {
            "login": username,
            "from": f"{year}-01-01T00:00:00Z",
            "to": f"{year}-12-31T23:59:59Z",
        }
        try:
            resp = requests.post(
                "https://api.github.com/graphql",
                json={"query": year_query, "variables": variables},
                headers=headers,
                timeout=10,
            )
        except requests.exceptions.RequestException:
            continue  # skip failed years, don't abort entirely

        if resp.status_code != 200:
            continue

        data = resp.json()
        try:
            cal = data["data"]["user"]["contributionsCollection"]["contributionCalendar"]
            total_contributions += cal["totalContributions"]
            for week in cal["weeks"]:
                for day in week["contributionDays"]:
                    all_days.append({
                        "count": day["contributionCount"],
                        "date": day["date"],
                    })
        except Exception:
            continue

    if not all_days:
        return None, "No contribution data found."

    # Deduplicate by date (years can overlap at boundaries)
    seen = set()
    deduped = []
    for day in all_days:
        if day["date"] not in seen:
            seen.add(day["date"])
            deduped.append(day)

    deduped.sort(key=lambda d: d["date"])

    return {
        "days": deduped,
        "name": user.get("name") or username,
        "avatar": user.get("avatarUrl", ""),
        "total": total_contributions,
    }, None


# ── Score logic ─────────────────────────────────────────────────────────────

def calculate_score(days):
    counts = [d["count"] for d in days]

    # Current streak (from today backwards)
    streak = 0
    for c in reversed(counts):
        if c > 0:
            streak += 1
        else:
            break

    # Max streak ever
    max_streak, cur = 0, 0
    for c in counts:
        cur = cur + 1 if c > 0 else 0
        max_streak = max(max_streak, cur)

    # Longest break
    max_break, brk = 0, 0
    for c in counts:
        brk = brk + 1 if c == 0 else 0
        max_break = max(max_break, brk)

    total = sum(counts)
    avg = total / len(counts) if counts else 0

    # Busiest single day
    peak = max(counts) if counts else 0

    return {
        "streak": streak,
        "max_streak": max_streak,
        "max_break": max_break,
        "total": total,
        "avg": round(avg, 2),
        "peak": peak,
    }


# ── RPG class system ────────────────────────────────────────────────────────

def get_class(stats):
    streak = stats["streak"]
    avg    = stats["avg"]
    brk    = stats["max_break"]
    peak   = stats["peak"]
    max_streak = stats["max_streak"]

    # ── Heavy committers (need to touch grass) ──
    if streak >= 30 and avg >= 5:
        return {
            "name": "Code Lich",
            "emoji": "💀",
            "description": "You have transcended humanity. The keyboard is your phylactery. Grass is a myth.",
            "grass_level": 0,
            "touch_grass": True,
        }
    if streak >= 14 and avg >= 3:
        return {
            "name": "Iron Monk",
            "emoji": "⚔️",
            "description": "Discipline incarnate. You commit like clockwork. Sunlight is a legend you've heard of.",
            "grass_level": 1,
            "touch_grass": True,
        }
    if max_streak >= 5 or avg >= 3:
        return {
            "name": "Terminal Goblin",
            "emoji": "👾",
            "description": "You live in the terminal. Your skin is keyboard grey. Grass is just a texture you saw in a video game.",
            "grass_level": 2,
            "touch_grass": True,
        }

    # ── Chaotic committers ──
    if peak >= 20:
        return {
            "name": "Chaos Goblin",
            "emoji": "👺",
            "description": "You vanish for weeks then drop 30 commits in a night. Unhinged. Unstoppable.",
            "grass_level": 3,
            "touch_grass": False,
        }

    # ── Grass touchers ──
    if brk >= 60:
        return {
            "name": "Grass Lord",
            "emoji": "🌿",
            "description": "You have achieved true grass enlightenment. GitHub is a distant memory. The outside world knows your name.",
            "grass_level": 10,
            "touch_grass": False,
        }
    if brk >= 30:
        return {
            "name": "Forest Dweller",
            "emoji": "🌲",
            "description": "A developer of balance. Mostly nature, occasionally code. Very zen.",
            "grass_level": 8,
            "touch_grass": False,
        }
    if avg >= 2 and streak >= 7:
        return {
            "name": "Casual Adventurer",
            "emoji": "🧭",
            "description": "Steady, consistent, healthy. You might even go outside sometimes. Respect.",
            "grass_level": 5,
            "touch_grass": False,
        }
    if avg < 0.5:
        return {
            "name": "Ghost Dev",
            "emoji": "👻",
            "description": "Are you even real? GitHub thinks you might be a bot that forgot to run.",
            "grass_level": 9,
            "touch_grass": False,
        }
    return {
        "name": "Rookie Coder",
        "emoji": "🌱",
        "description": "Just getting started. Every legend begins somewhere. Keep pushing.",
        "grass_level": 6,
        "touch_grass": False,
    }


TOUCH_GRASS_MSGS = [
    "Bro. Step away from the screen. 🌱",
    "Your commit streak is a cry for help. Go outside. ☀️",
    "The grass misses you. It's been a while. 🍃",
    "Touch grass. Doctor's orders. 🩺🌿",
    "You are legally required to take a walk. 🚶",
]

KEEP_CODING_MSGS = [
    "You're doing great. Hydrate though. 💧",
    "Balance is good. Stay the course. ⚖️",
    "Solid effort. Don't forget to stretch. 🧘",
    "Keep it up — but get some sun too! ☀️",
    "Healthy dev detected. Keep it going. 🍀",
]


# ── Routes ───────────────────────────────────────────────────────────────────

@app.route("/api/score/<username>")
def score(username):
    result, error = fetch_contributions(username)
    if error:
        return jsonify({"error": error}), 404

    stats = calculate_score(result["days"])
    cls   = get_class(stats)

    msg = random.choice(TOUCH_GRASS_MSGS if cls["touch_grass"] else KEEP_CODING_MSGS)

    return jsonify({
        "username": username,
        "name": result["name"],
        "avatar": result["avatar"],
        "stats": stats,
        "class": cls,
        "message": msg,
        "grid": result["days"],
    })


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("static", path)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="TouchGrass — check a GitHub user's grass score.")
    parser.add_argument("username", nargs="?", help="GitHub username (omit to run Flask server)")
    parser.add_argument("--verbose", action="store_true", help="Show debug output")
    args = parser.parse_args()

    if args.username:
        # ── CLI mode ──
        result, error = fetch_contributions(args.username)
        if error:
            print(f"Error: {error}")
            sys.exit(1)

        if args.verbose:
            print(f"Found {len(result['days'])} days in contribution graph.")

        stats = calculate_score(result["days"])
        cls   = get_class(stats)

        print(f"\n👤 {result['name']} (@{args.username})")
        print(f"{cls['emoji']}  Class: {cls['name']}")
        print(f"   {cls['description']}")
        print(f"\n🔥 Current streak:  {stats['streak']} days")
        print(f"⚡ Longest streak:  {stats['max_streak']} days")
        print(f"📝 Total commits:   {stats['total']}")
        print(f"📊 Avg per day:     {stats['avg']}")
        print(f"🌊 Peak day:        {stats['peak']}")
        print(f"😴 Longest break:   {stats['max_break']} days")
        print(f"\n{random.choice(TOUCH_GRASS_MSGS if cls['touch_grass'] else KEEP_CODING_MSGS)}")

    else:
        # ── Server mode ──
        app.run(debug=True, port=5000)