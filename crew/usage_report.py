"""Total the crew's cost ledgers: every runs/*/usage.json, one row per run.

    python3 usage_report.py              # table on screen
    python3 usage_report.py --csv out.csv

Costs are at API list prices (pricing.py), whatever the run was billed to.
Runs from before 22 November 2026 have no usage.json and are skipped.
"""

import argparse
import csv
import glob
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv")
    args = ap.parse_args()
    rows = []
    for path in sorted(glob.glob(os.path.join(HERE, "runs", "*", "usage.json"))):
        u = json.load(open(path))
        if u.get("via") == "dry-run":
            continue
        t = u["totals"]
        row = {"run": os.path.basename(os.path.dirname(path)), "outcome": u["outcome"],
               "rounds": u["rounds"], "calls": u["agent_calls"], "wall_s": u["wall_seconds"],
               "fresh_in": t["fresh_input"], "cache_write": t["cache_write"],
               "cache_read": t["cache_read"], "output": t["output"], "api_usd": t["api_cost_usd"]}
        for agent, a in u["by_agent"].items():
            row[f"{agent}_usd"] = a["api_cost_usd"]
        rows.append(row)
    if not rows:
        print("no priced runs yet")
        return
    cols = list(dict.fromkeys(k for r in rows for k in r))
    if args.csv:
        with open(args.csv, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=cols)
            w.writeheader()
            w.writerows(rows)
        print(f"wrote {len(rows)} runs to {args.csv}")
    print("  ".join(cols))
    for r in rows:
        print("  ".join(str(r.get(c, "")) for c in cols))
    spent = [r["api_usd"] for r in rows if r["api_usd"] is not None]
    done = [r for r in rows if r["outcome"] in ("reviewed", "applied")]
    print(f"\n{len(rows)} runs, {len(done)} produced a storylet, ${sum(spent):.2f} at API rates"
          + (f", ${sum(spent) / len(done):.2f} per storylet that made it" if done else ""))


if __name__ == "__main__":
    main()
