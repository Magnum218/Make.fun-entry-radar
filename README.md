# Make.fun-entry-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Magnum218/Make.fun-entry-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Magnum218/Make.fun-entry-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

UNMINTED is a token launch radar. It reads the sealed DefiLlama snapshot of every protocol the
competition tracks, works out which ones still record no token (and are not a wrapped or staked
product of one that trades), and ranks 226 of them by what their launch would be worth.

The ranking model is **radar-2**: the house spine — implied value from TVL, 7-day growth and time
tokenless — blended with one snapshot-derived factor, the category's own median market-cap/TVL
ratio priced from the protocols in the same snapshot that already trade. Every figure comes from
the snapshot alone; the dashboard's methodology section prints the whole category table and every
protocol's detail view multiplies its factors out, so the number can be checked from the page.

The dashboard is a static page (no framework, no network): a sortable, filterable board with the
40-protocol watchlist badged as the top tier, a detail view per protocol with its value waterfall
and a concrete farm plan (six steps, each with a cost and a time), a separate live-tokens view,
and the model stated in full. `main.ts` (Node 22, standard library only) computes the board and
writes `board.json`, the dashboard's `data.js`, and the `dossier.json` the judge reads.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=chocolatos-eth&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
