import argparse
import requests
import sys
import os
import random
from dotenv import load_dotenv

def fetch_contributions(username, verbose=False):
        load_dotenv()
        token = os.environ.get("TOKEN")
        if not token:
                print("Please set a TOKEN environment variable in your .env file with your GitHub personal access token.")
                return None
        headers = {"Authorization": f"Bearer {token}"}
        query = """
        query($login: String!) {
            user(login: $login) {
                contributionsCollection {
                    contributionCalendar {
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
        url = "https://api.github.com/graphql"
        response = requests.post(url, json={"query": query, "variables": variables}, headers=headers)
        if response.status_code != 200:
                print("Failed to fetch contribution data from GitHub API.")
                return None
        data = response.json()
        try:
                weeks = data["data"]["user"]["contributionsCollection"]["contributionCalendar"]["weeks"]
                contributions = []
                for week in weeks:
                        for day in week["contributionDays"]:
                                contributions.append(day["contributionCount"])
                if verbose:
                        print(f"Found {len(contributions)} days in contribution graph.")
                        if contributions:
                                print(f"Sample day count: {contributions[0]}")
                return contributions
        except Exception as e:
                print("Error parsing contribution data:", e)
                return None

def calculate_grass_score(contributions):
    # Example: streak calculation
    streak = 0
    max_streak = 0
    break_streak = 0
    max_break = 0
    total_commits = 0
    for count in contributions[::-1]:
        if count > 0:
            streak += 1
            max_streak = max(max_streak, streak)
            break_streak = 0
        else:
            streak = 0
            break_streak += 1
            max_break = max(max_break, break_streak)
        total_commits += count
    avg_per_day = sum(contributions) / len(contributions) if contributions else 0
    return max_streak, avg_per_day, max_break, total_commits

def main():
    
    parser = argparse.ArgumentParser(description="Check a GitHub user's grass score.")
    parser.add_argument("username", nargs="?", help="GitHub username")
    parser.add_argument("--verbose", action="store_true", help="Show debug output")
    args = parser.parse_args()

    if args.username:
        username = args.username
    else:
        username = input("Enter your GitHub username: ")

    contributions = fetch_contributions(username, verbose=args.verbose)
    if contributions is None:
        sys.exit(1)
    max_streak, avg_per_day, max_break, total_commits = calculate_grass_score(contributions)
    print(f"Max streak: {max_streak} days")
    print(f"Average commits per day: {avg_per_day:.2f}")
    print(f"Longest break: {max_break} days without a commit")
    print(f"Total commits: {total_commits}")

    touch_grass_msgs = [
        "Go outside and touch grass! 🌱",
        "Step away from the keyboard and get some fresh air! 🍃",
        "Your code is too green, time for some sun! ☀️",
        "Take a walk, the grass misses you! 🚶‍♂️🌳",
        "Touch some grass, not just your keyboard! 🖥️➡️🌱"
    ]
    keep_coding_msgs = [
        "Code some more! 💻, make sure to hydrate 💧",
        "Keep going, but remember to take breaks! 🕒",
        "You're doing great, but don't forget to stretch! 🧘‍♂️",
        "Stay productive, but balance is key! ⚖️",
        "Keep coding, but remember: health first! 🍀"
    ]

    print("----------------------------------------")
    if max_streak > 10 or avg_per_day > 5:
        print(random.choice(touch_grass_msgs))
    else:
        print(random.choice(keep_coding_msgs))

if __name__ == "__main__":
    main()