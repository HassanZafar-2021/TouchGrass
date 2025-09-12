import argparse
import requests
from bs4 import BeautifulSoup
import sys

def fetch_contributions(username):
    url = f"https://github.com/users/{username}/contributions"
    response = requests.get(url)
    if response.status_code != 200:
        print("Failed to fetch contribution graph.")
        return None
    soup = BeautifulSoup(response.text, "html.parser")
    # Parse SVG rects for contribution data (robust: look for 'rect' with 'data-date')
    days = soup.find_all("rect", attrs={"data-date": True})
    contributions = [int(day.get("data-count", 0)) for day in days]
    return contributions

def calculate_grass_score(contributions):
    # Example: streak calculation
    streak = 0
    max_streak = 0
    for count in contributions[::-1]:
        if count > 0:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0
    avg_per_day = sum(contributions) / len(contributions) if contributions else 0
    return max_streak, avg_per_day

def main():
    parser = argparse.ArgumentParser(description="Check a GitHub user's grass score.")
    parser.add_argument("username", help="GitHub username")
    args = parser.parse_args()

    contributions = fetch_contributions(args.username)
    if contributions is None:
        sys.exit(1)
    max_streak, avg_per_day = calculate_grass_score(contributions)
    print(f"Max streak: {max_streak} days")
    print(f"Average commits per day: {avg_per_day:.2f}")

    if max_streak > 10 or avg_per_day > 5:
        print("Touch grass! 🌱")

if __name__ == "__main__":
    main()