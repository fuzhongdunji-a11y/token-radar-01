// Display-only valuation breakdown + cohort position. Factors and the implied value come straight from model.ts
// (factors / impliedOf), so the breakdown cannot drift from the board. Computed at build time; the browser never recomputes the model.
import type { Protocol, CategoryStat } from './model.ts';
import { MODEL, UNCATEGORIZED, median, factors, impliedOf } from './model.ts';

export interface Breakdown {
  slug: string;
  tvl_usd: number;
  category: { category: string; n: number; raw_median: number | null; global_median: number; weight: number; blended: number; multiple: number };
  growth: { change_7d: number | null; pct_used: number; multiplier: number };
  maturity: { age_days: number | null; age_used: number; multiplier: number };
  chain: { count: number; extra: number; multiplier: number };
  product: number;
  implied_value_usd: number;
}

export function breakdownFor(p: Protocol, asOf: string, stat: CategoryStat, globalMedian: number): Breakdown {
  const f = factors(p, asOf, stat.multiple);
  const count = p.chains.length;
  return {
    slug: p.slug,
    tvl_usd: p.tvl_usd,
    category: {
      category: stat.category,
      n: stat.n,
      raw_median: stat.raw_median,
      global_median: globalMedian,
      weight: stat.weight,
      // unclamped shrunk value (same expression as categoryTable); `multiple` is this clamped to multiple_min..multiple_max
      blended: stat.raw_median === null ? globalMedian : stat.weight * stat.raw_median + (1 - stat.weight) * globalMedian,
      multiple: f.category_multiple,
    },
    growth: { change_7d: p.change_7d, pct_used: f.growth_pct, multiplier: f.growth_multiplier },
    maturity: { age_days: f.age_days, age_used: f.age_used, multiplier: f.maturity_multiplier },
    chain: { count, extra: Math.min(Math.max(count - 1, 0), MODEL.chain_max_extra), multiplier: f.chain_multiplier },
    product: p.tvl_usd * f.category_multiple * f.growth_multiplier * f.maturity_multiplier * f.chain_multiplier,
    implied_value_usd: impliedOf(p, f),
  };
}

export interface CohortPosition {
  category: string;
  cohort_size: number;
  rank_by_implied: number;
  percentile: number; // 100 = top of the cohort, 0 = bottom; one decimal
  median_implied_usd: number | null;
}

type CohortRow = { slug: string; category: string | null; implied_value_usd: number };

/** Rank of every row inside its own category cohort (implied desc, slug asc), computed once for the whole board. */
export function cohortPositions(rows: CohortRow[]): Map<string, CohortPosition> {
  const groups = new Map<string, CohortRow[]>();
  for (const r of rows) {
    const k = r.category ?? UNCATEGORIZED;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const out = new Map<string, CohortPosition>();
  for (const [category, g] of [...groups].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    const sorted = g.slice().sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    const med = median(g.map((r) => r.implied_value_usd));
    sorted.forEach((r, i) => {
      const rank = i + 1;
      const percentile = sorted.length === 1 ? 100 : Math.round(((sorted.length - rank) / (sorted.length - 1)) * 1000) / 10;
      out.set(r.slug, { category, cohort_size: sorted.length, rank_by_implied: rank, percentile, median_implied_usd: med });
    });
  }
  return out;
}
