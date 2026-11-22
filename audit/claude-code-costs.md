# What building The Long Boil with Claude Code would cost at API prices

Source: `ccusage` 20.0.51, run on 22 November 2026 over this Mac's Claude Code logs (`claude-code-daily.json`, `claude-code-sessions.json`). The build ran on a Claude plan, so none of this was billed per token. The dollar figures are what the same tokens would cost on the Claude API at list prices (Opus 5.5: $4 input, $5 five-minute cache write, $8 one-hour cache write, $0.20 cache read, $20 output, per million tokens).

**Scope caveat.** ccusage counts every Claude Code session on the machine, not only this repository. Every day with usage but one (31 October, $17.26) also has commits to this repository, so most or all of it is the game. The crew's own runs (`claude -p --no-session-persistence`) are not in these logs; they are costed separately in `crew/runs/*/usage.json`.

## Totals, 21 October to 22 November 2026

| | |
| --- | ---: |
| Sessions | 221 |
| Days with usage | 21 |
| Tokens processed | 1.74 billion |
| Output tokens | 8.77 million |
| **Cost at API prices** | **$906.27** |
| Commits to the repository in the same window | 225 |
| Work orders run | 42 |
| Average per commit | about $4.03 |
| Average per work order | about $21.58 |

## By model

| Model | Cost | Share |
| --- | ---: | ---: |
| Claude Opus 5.5 (218 sessions) | $841.10 | 92.8% |
| Claude Fable 5.2 (3 sessions) | $62.42 | 6.9% |
| Claude Sonnet 5.5 (4 sessions) | $2.74 | 0.3% |

## Where the money went (Opus and Sonnet, $844.29)

| Component | Cost | Share |
| --- | ---: | ---: |
| Cache reads (1.66 billion tokens) | $315.12 | 37.3% |
| Cache writes, 5-minute | $220.78 | 26.1% |
| Cache writes, 1-hour | $142.50 | 16.9% |
| Output, thinking included | $165.81 | 19.6% |
| Fresh, uncached input | $0.08 | 0.0% |

96% of all input tokens were served from the prompt cache. Writing context into the cache (43%) cost more than everything the model wrote (20%). For an agentic build, the bill is driven by how much context each session carries and how often it changes, not by how much code comes out.

## Concentration

- The 10 most expensive sessions are 81% of the total. The largest, on 24 October (the AWS deployment push), cost $180.96 alone.
- The median session cost $0.10. Most sessions are short.
- Spend tracks the build plan: $581 in the ten days from 21 to 30 October (engine, infrastructure, Act I), $325 in November, falling to a few dollars a day once work orders became small and bounded.

## By day

| Date | Cost | Output tokens | Commits |
| --- | ---: | ---: | ---: |
| 2026-10-21 | 21.09 | 142,513 | 14 |
| 2026-10-22 | 91.18 | 719,400 | 24 |
| 2026-10-23 | 103.12 | 763,152 | 16 |
| 2026-10-24 | 76.80 | 664,418 | 21 |
| 2026-10-25 | 39.05 | 187,184 | 12 |
| 2026-10-27 | 53.01 | 603,386 | 32 |
| 2026-10-28 | 41.31 | 595,292 | 16 |
| 2026-10-29 | 19.61 | 155,392 | 10 |
| 2026-10-30 | 68.09 | 710,543 | 10 |
| 2026-10-31 | 17.26 | 203,126 | 0 |
| 2026-11-02 | 41.40 | 383,583 | 15 |
| 2026-11-03 | 107.57 | 1,174,358 | 17 |
| 2026-11-04 | 81.07 | 965,218 | 6 |
| 2026-11-05 | 15.23 | 110,575 | 4 |
| 2026-11-06 | 22.64 | 318,139 | 3 |
| 2026-11-08 | 4.20 | 53,253 | 4 |
| 2026-11-10 | 45.31 | 513,914 | 14 |
| 2026-11-13 | 41.21 | 363,636 | 2 |
| 2026-11-15 | 14.39 | 111,510 | 2 |
| 2026-11-18 | 2.49 | 28,528 | 2 |
| 2026-11-22 | 0.22 | 452 | 0 |
