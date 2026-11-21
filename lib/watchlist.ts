// Same definition as lib/model.ts median (even count = mean of the two middle values); kept local so this module has no import cycle.
function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

// Momentum tier labels
export type MomentumTier = 'surging' | 'rising' | 'flat' | 'falling' | 'dropping' | 'unknown';

export interface WatchInput {
  slug: string;
  rank: number;
  cat: string;
  tvl_usd: number;
  change_7d: number | null;
  implied_value_usd: number;
}

export interface WatchCard {
  slug: string;
  watch_rank: number;
  cat_rank: number;
  cat_size: number;
  tier: MomentumTier;
  label: string;
  pct: number | null;
}

export function momentumFor(change_7d: number | null): { tier: MomentumTier; label: string; pct: number | null } {
  if (change_7d === null || !Number.isFinite(change_7d)) {
    return { tier: 'unknown', label: 'No 7d reading', pct: null };
  }
  const tier =
    change_7d >= 10 ? 'surging' :
    change_7d >= 2 ? 'rising' :
    change_7d >= -2 ? 'flat' :
    change_7d >= -10 ? 'falling' :
    'dropping';
  const label =
    tier === 'surging' ? 'Surging' :
    tier === 'rising' ? 'Rising' :
    tier === 'flat' ? 'Flat' :
    tier === 'falling' ? 'Falling' :
    tier === 'dropping' ? 'Dropping' :
    'No 7d reading';
  let pct = Math.round(change_7d * 10) / 10;
  if (pct === 0) pct = 0; // normalise -0 to 0 (-0 === 0 is true)
  return { tier, label, pct };
}

export function watchCards(rows: WatchInput[]): Map<string, WatchCard> {
  // Count per category first
  const catCount = new Map<string, number>();
  for (const r of rows) {
    catCount.set(r.cat, (catCount.get(r.cat) ?? 0) + 1);
  }
  // Copy and sort rows by rank asc, slug asc
  const sorted = [...rows].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.slug < b.slug) return -1;
    if (a.slug > b.slug) return 1;
    return 0;
  });
  const catRank = new Map<string, number>();
  const out = new Map<string, WatchCard>();
  sorted.forEach((r, i) => {
    const watch_rank = i + 1;
    const cat_size = catCount.get(r.cat)!;
    const currCatRank = (catRank.get(r.cat) ?? 0) + 1;
    catRank.set(r.cat, currCatRank);
    const { tier, label, pct } = momentumFor(r.change_7d);
    out.set(r.slug, {
      slug: r.slug,
      watch_rank,
      cat_rank: currCatRank,
      cat_size,
      tier,
      label,
      pct,
    });
  });
  return out;
}

export interface WatchGroup {
  category: string;
  count: number;
  slugs: string[];
  best_rank: number;
  total_tvl_usd: number;
  total_implied_usd: number;
  median_change_7d: number | null;
  tiers: Record<MomentumTier, number>;
}

export function watchGroups(rows: WatchInput[]): WatchGroup[] {
  const groups = new Map<string, WatchInput[]>();
  for (const r of rows) {
    const arr = groups.get(r.cat) ?? [];
    arr.push(r);
    groups.set(r.cat, arr);
  }
  const result: WatchGroup[] = [];
  for (const [cat, groupRows] of groups.entries()) {
    // sort by rank asc, slug asc for slugs array and to find best_rank
    const sorted = [...groupRows].sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.slug < b.slug) return -1;
      if (a.slug > b.slug) return 1;
      return 0;
    });
    const slugs = sorted.map(r => r.slug);
    const best_rank = sorted[0]!.rank;
    const count = groupRows.length;
    const total_tvl_usd = groupRows.reduce((s, r) => s + r.tvl_usd, 0);
    const total_implied_usd = groupRows.reduce((s, r) => s + r.implied_value_usd, 0);
    const changeValues = groupRows
      .map(r => r.change_7d)
      .filter((v): v is number => v !== null && Number.isFinite(v));
    let median_change_7d: number | null;
    if (changeValues.length === 0) {
      median_change_7d = null;
    } else {
      const m = median(changeValues);
      if (m === null) median_change_7d = null;
      else {
        let r = Math.round(m * 10) / 10;
        if (r === 0) r = 0;
        median_change_7d = r;
      }
    }
    const tiers: Record<MomentumTier, number> = { surging: 0, rising: 0, flat: 0, falling: 0, dropping: 0, unknown: 0 };
    for (const r of groupRows) tiers[momentumFor(r.change_7d).tier]++;
    result.push({
      category: cat,
      count,
      slugs,
      best_rank,
      total_tvl_usd,
      total_implied_usd,
      median_change_7d,
      tiers,
    });
  }
  result.sort((a, b) => {
    if (a.best_rank !== b.best_rank) return a.best_rank - b.best_rank;
    if (a.category < b.category) return -1;
    if (a.category > b.category) return 1;
    return 0;
  });
  return result;
}
