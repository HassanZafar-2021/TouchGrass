import os
import random
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import requests

load_dotenv()

app = Flask(__name__, static_folder="static")
CORS(app)

# ── GitHub API ──────────────────────────────────────────────────────────────

def fetch_contributions(username):
    token = os.environ.get("TOKEN")
    if not token:
        return None, "TOKEN environment variable not set."

    headers = {"Authorization": f"Bearer {token}"}
    query = """
    query($login: String!) {
        user(login: $login) {
            name
            avatarUrl
            contributionsCollection {
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
    variables = {"login": username}
    try:
        response = requests.post(
            "https://api.github.com/graphql",
            json={"query": query, "variables": variables},
            headers=headers,
            timeout=10,
        )
    except requests.exceptions.RequestException:
        return None, "Could not reach GitHub API."

    if response.status_code != 200:
        return None, "GitHub API request failed."

    data = response.json()
    if "errors" in data:
        return None, "GitHub user not found."

    try:
        user = data["data"]["user"]
        if user is None:
            return None, "GitHub user not found."
        weeks = user["contributionsCollection"]["contributionCalendar"]["weeks"]
        days = []
        for week in weeks:
            for day in week["contributionDays"]:
                days.append({"count": day["contributionCount"], "date": day["date"]})
        return {
            "days": days,
            "name": user.get("name") or username,
            "avatar": user.get("avatarUrl", ""),
            "total": user["contributionsCollection"]["contributionCalendar"]["totalContributions"],
        }, None
    except Exception as e:
        return None, f"Error parsing data: {e}"


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
    if peak >= 20:
        return {
            "name": "Chaos Goblin",
            "emoji": "👺",
            "description": "You vanish for weeks then drop 30 commits in a night. Unhinged. Unstoppable.",
            "grass_level": 3,
            "touch_grass": False,
        }
    if brk >= 60:
        return {
            "name": "Wandering Sage",
            "emoji": "🌿",
            "description": "You've touched so much grass you ARE the grass. Git who? GitHub where?",
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
    app.run(debug=True, port=5000)