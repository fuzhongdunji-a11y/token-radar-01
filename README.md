# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/fuzhongdunji-a11y/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/fuzhongdunji-a11y/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar. It reads a sealed snapshot of DeFi protocols and ranks the ones with no token yet by what a launch could be worth, each with a costed farm plan. Protocols whose token already trades are shown in a separate view with their market cap as it is. The dashboard is static and works offline.

## Model: radar-2

```
implied = TVL × category_multiple × growth × maturity × chain
```

Everything comes from the snapshot's own numbers; no protocol is named in the code.

| Term | Definition | Constants |
|---|---|---|
| `category_multiple` | median mcap/TVL of live-token protocols in the category, shrunk to the global median with weight `n/(n+k)`, then clamped | k = 5, clamp 0.10–3.00 |
| `growth` | `1 + clamp(change_7d, −40, 60)/100 × 0.35`; null counts as 0 | floor −40, cap 60, weight 0.35 |
| `maturity` | `0.7 + 0.3 × min(age_days, 1095)/1095`, age from `listed_at` to the snapshot's `as_of`; unknown age counts as 365 days | floor 0.7, range 0.3, 1095 days |
| `chain` | `1 + 0.02 × min(chains − 1, 5)` | step 0.02, max 5 extra chains |

The result is rounded to an integer and clamped to 1..1e14. Ties break by slug, ascending.

**Board rows** are the whole watchlist plus every extra protocol that has no mcap, gecko id or symbol and is not a wrapped, staked, bridged, versioned or CEX product. The rules are on category and name patterns, and exchange brands come from the snapshot's own CEX category. There are no per-protocol lists. The current snapshot gives 191 rows: 40 watchlist and 151 extra. 144 live-token protocols are set aside.

**Farm plan:** 7 steps per row, built from category, chains, TVL band and age. Each step states a Cost and a Time.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../kit/token-radar-01-kit/input/snapshot.json
```

Needs Node 22 only; there are no dependencies. In the sandbox the defaults are `/input/snapshot.json` and `/output`. The run has no network and no clock or randomness, so two runs give identical bytes.

## Output

| Path | Content |
|---|---|
| `board.json` | the ranked rows with implied value and farm steps |
| `data.js` | data for the dashboard, beside it so the dashboard source stays small |
| `dashboard/` | `index.html`, `app.css`, `app.js` |
| `screenshots/` | three PNGs, the first is the cover |
| `dossier.json` | written last by `buildDossier` from `vendor/makefun-board.ts` |

`scripts/check-board.ts` is a development check of the board's gate rules: `node scripts/check-board.ts <outdir> <snapshot.json>`.

## License

MIT, see [LICENSE](LICENSE).

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
