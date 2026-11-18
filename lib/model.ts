// radar-3 value model: snapshot in, ranked pre-token board + live-token list out.
// implied = TVL x category_multiple x growth x maturity x chain. Everything derives from snapshot numbers.

export interface Protocol {
  slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number;
  change_7d: number | null; mcap_usd: number | null; listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
export interface Snapshot { as_of: string; source: string; floor_usd: number; protocols: Protocol[]; watchlist: string[] }

export const MODEL = {
  version: 'radar-3',
  shrink_k: 10, multiple_min: 0.1, multiple_cap_quantile: 0.9,
  growth_floor: -40, growth_cap: 60, growth_weight: 0.35,
  maturity_floor: 0.7, maturity_range: 0.3, maturity_days: 1095, unknown_age_days: 365,
  chain_step: 0.02, chain_max_extra: 5,
  implied_max: 100_000_000_000_000,
};
export const UNCATEGORIZED = 'Uncategorized';

/** Nearest-rank quantile of a sorted-ascending list. */
export function quantile(sorted: number[], q: number): number | null {
  return sorted.length === 0 ? null : sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)]!;
}

export interface CategoryStat { category: string; n: number; raw_median: number | null; weight: number; multiple: number }
export interface Factors { category_multiple: number; growth_pct: number; growth_multiplier: number; maturity_multiplier: number; chain_multiplier: number; age_days: number | null; age_used: number }
export interface BoardRow {
  rank: number; slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number; change_7d: number | null;
  mcap_usd: null; listed_at: string | null; token_status: 'pre-token'; watchlist: boolean; implied_value_usd: number;
  model: Factors; farm_steps: string[];
}
export interface LiveRow { slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number; change_7d: number | null; mcap_usd: number; mcap_tvl: number; listed_at: string | null; symbol: string | null }

const DAY = 86_400_000;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const catOf = (p: Protocol) => p.category ?? UNCATEGORIZED;
const bySlug = (a: { slug: string }, b: { slug: string }) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
const byCat = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`), b = Date.parse(`${listedAt}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.floor((a - b) / DAY)) : null;
}

export const isLive = (p: Protocol) => p.mcap_usd !== null;
export const isPre = (p: Protocol) => p.mcap_usd === null;

/** Category multiples from live-token mcap/TVL medians, shrunk toward the global median with weight n/(n+k). */
export function categoryTable(snapshot: Snapshot): { global_median: number; multiple_cap: number; stats: CategoryStat[]; lookup: Map<string, CategoryStat> } {
  const live = snapshot.protocols.filter((p) => isLive(p) && p.tvl_usd > 0);
  const ratios = new Map<string, number[]>();
  for (const p of live) {
    const k = catOf(p);
    if (!ratios.has(k)) ratios.set(k, []);
    ratios.get(k)!.push(p.mcap_usd! / p.tvl_usd);
  }
  const all = live.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const globalMedian = median(all) ?? 1;
  // Cap derived from the snapshot: the 90th percentile of individual live-token mcap/TVL ratios.
  const cap = Math.max(MODEL.multiple_min, quantile(all, MODEL.multiple_cap_quantile) ?? 1);
  const cats = new Set<string>(snapshot.protocols.map(catOf));
  const stats: CategoryStat[] = [...cats].sort(byCat).map((category) => {
    const r = ratios.get(category) ?? [];
    const n = r.length, raw = median(r);
    const w = n / (n + MODEL.shrink_k);
    const blended = raw === null ? globalMedian : w * raw + (1 - w) * globalMedian;
    return { category, n, raw_median: raw, weight: w, multiple: clamp(blended, MODEL.multiple_min, cap) };
  });
  return { global_median: globalMedian, multiple_cap: cap, stats, lookup: new Map(stats.map((s) => [s.category, s])) };
}

export function factors(p: Protocol, asOf: string, categoryMultiple: number): Factors {
  const age = ageDays(asOf, p.listed_at);
  const used = age ?? MODEL.unknown_age_days;
  const growthPct = clamp(p.change_7d ?? 0, MODEL.growth_floor, MODEL.growth_cap);
  return {
    category_multiple: categoryMultiple,
    growth_pct: growthPct,
    growth_multiplier: 1 + (growthPct / 100) * MODEL.growth_weight,
    maturity_multiplier: MODEL.maturity_floor + (MODEL.maturity_range * Math.min(Math.max(used, 0), MODEL.maturity_days)) / MODEL.maturity_days,
    chain_multiplier: 1 + MODEL.chain_step * clamp(p.chains.length - 1, 0, MODEL.chain_max_extra),
    age_days: age, age_used: used,
  };
}
export const impliedOf = (p: Protocol, f: Factors) =>
  clamp(Math.round(p.tvl_usd * f.category_multiple * f.growth_multiplier * f.maturity_multiplier * f.chain_multiplier), 1, MODEL.implied_max);

// ---- extra-row eligibility (rule-based on category / name / slug; no per-protocol lists) ----
// Token-free (no mcap, gecko id or symbol) AND not a wrapped / staked / bridged / versioned product AND not a CEX or exchange-branded entry.
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const DERIVATIVE_CATEGORY = /bridge|staking|restaked|wrapper|anchor btc|decentralized btc|^cex$/i;
const DERIVATIVE_NAME = /\b(wrapped|staked|bridged?|bridges?|gateway)\b|\b(lst|lsd)s?\b/i;
const LST_TICKER_NAME = /^st[A-Z][A-Za-z0-9]*$/; // liquid-staking ticker style, e.g. a name that is one token starting with lowercase "st" + capital
export function isTokenless(p: Protocol) { return p.mcap_usd === null && p.gecko_id === null && p.symbol === null; }
/** Exchange brand tokens, learned from the snapshot itself: the first word of every CEX-category name (>= 4 chars). */
export function exchangeBrands(protocols: Protocol[]): Set<string> {
  const brands = new Set<string>();
  for (const p of protocols) {
    if (p.category !== 'CEX') continue;
    const w = p.name.toLowerCase().split(/[^a-z0-9]+/)[0] ?? '';
    if (w.length >= 4) brands.add(w);
  }
  return brands;
}
export function isExtraEligible(p: Protocol, brands: Set<string>) {
  if (!isTokenless(p)) return false;
  if (DERIVATIVE_CATEGORY.test(p.category ?? '') || VERSIONED.test(p.name) || DERIVATIVE_NAME.test(p.name) || LST_TICKER_NAME.test(p.name)) return false;
  const words = `${p.name} ${p.slug}`.toLowerCase().split(/[^a-z0-9]+/);
  return !words.some((w) => brands.has(w));
}

// ---- farm plan ----
type Kit = { act: string; ask: string; verb: string };
const KITS: Record<string, Kit> = {
  dex: { act: 'swap and provide liquidity', ask: 'a stable pair LP position', verb: 'swaps' },
  lend: { act: 'supply and borrow', ask: 'a supply position with a small borrow', verb: 'loan actions' },
  yield: { act: 'deposit into a vault', ask: 'a single vault deposit', verb: 'vault actions' },
  stake: { act: 'stake or restake', ask: 'a staking deposit', verb: 'stake actions' },
  bridge: { act: 'bridge assets', ask: 'a round-trip bridge transfer', verb: 'bridge transfers' },
  deriv: { act: 'trade a small perp or option position', ask: 'a low-leverage position', verb: 'trades' },
  cdp: { act: 'mint the stablecoin against collateral', ask: 'an over-collateralised mint', verb: 'mint and repay cycles' },
  rwa: { act: 'subscribe to a tokenised asset', ask: 'a small primary subscription', verb: 'subscriptions' },
  generic: { act: 'use the core product', ask: 'a small deposit', verb: 'core actions' },
};
function kitFor(category: string | null): Kit {
  const c = (category ?? '').toLowerCase();
  if (/dex|liquidity|amm|farm|launchpad/.test(c)) return KITS.dex!;
  if (/lend|credit|collateral|allocator|curator/.test(c)) return KITS.lend!;
  if (/yield|vault|basis|index|aggregator|cedefi/.test(c)) return KITS.yield!;
  if (/stak|restak|chain/.test(c)) return KITS.stake!;
  if (/bridge/.test(c)) return KITS.bridge!;
  if (/deriv|option|perp|synthetic|prediction|rate/.test(c)) return KITS.deriv!;
  if (/cdp|stable|algo|reserve/.test(c)) return KITS.cdp!;
  if (/rwa|real|asset|payment|card/.test(c)) return KITS.rwa!;
  return KITS.generic!;
}
export function capitalFor(tvl: number): number { return tvl < 25e6 ? 50 : tvl < 100e6 ? 100 : tvl < 500e6 ? 150 : 250; }
export function holdDaysFor(age: number | null): number { const a = age ?? MODEL.unknown_age_days; return a < 90 ? 14 : a < 365 ? 30 : a < 1095 ? 45 : 60; }
const fmtM = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : `$${(n / 1e6).toFixed(1)}M`);

export function farmPlan(p: Protocol, f: Factors, implied: number): string[] {
  const kit = kitFor(p.category);
  const chain = p.chains[0] ?? 'its main chain';
  const cap = capitalFor(p.tvl_usd), hold = holdDaysFor(f.age_days);
  const gas = chain === 'Ethereum' ? 12 : 2;
  const slice = Math.round(cap * 0.4), reserve = cap - slice;
  const trend = p.change_7d === null ? 'no 7-day TVL reading' : `TVL ${p.change_7d >= 0 ? '+' : ''}${p.change_7d.toFixed(1)}% over 7 days`;
  const ageTxt = f.age_days === null ? 'unknown listing age' : `${f.age_days} days tracked`;
  const hold2 = Math.max(7, Math.round(hold / 2));
  const steps = [
    `Scope ${p.name} (${p.category ?? 'uncategorised'}): ${fmtM(p.tvl_usd)} TVL on ${chain}, ${trend}, ${ageTxt}. Model value ${fmtM(implied)}. Read the docs and last 20 transactions and confirm the app is live and there is no token yet. Cost: $0. Time: 30 min.`,
    `Fund a fresh ${chain} wallet with $${cap} of stable capital plus about $${gas} of native gas for ${p.name}. Keep it separate from main funds so activity stays attributable. Cost: $${cap + gas} deployed ($${gas} gas, recoverable principal). Time: 20 min.`,
    `First action on ${p.name}: ${kit.act} with $${slice} (${kit.ask}). Check the quote before signing and keep slippage under 0.5%. Cost: about $${(gas * 0.4).toFixed(2)} gas plus fees. Time: 15 min.`,
    `Add a second, different action on ${p.name} using $${reserve - Math.round(reserve / 2)}, such as a withdrawal and re-entry, so the wallet shows more than one kind of ${kit.verb}. Cost: about $${(gas * 0.5).toFixed(2)} gas. Time: 15 min.`,
    `Repeat ${kit.verb} on ${p.name} weekly: 3 rounds of $${Math.max(5, Math.round(cap * 0.1))} or less, spaced 7 days apart, to build a steady record rather than one burst. Cost: about $${(gas * 1.2).toFixed(2)} gas across the rounds. Time: 10 min per round, 3 weeks.`,
    `Keep the position open for ${hold} days (the hold for ${f.age_days === null ? 'an unknown-age' : f.age_days + '-day-old'} protocols). Check at day ${hold2} and exit if TVL drops below ${fmtM(p.tvl_usd * 0.6)}. Cost: $0 beyond the opportunity cost of $${cap} locked. Time: 5 min per check, ${hold} days elapsed.`,
    `Exit ${p.name}: withdraw everything, record the cost basis (about $${Math.round(gas * 3)} gas in total), and screenshot the wallet's history. Watch the protocol's announcements for a points programme or claim page. Cost: about $${gas} gas. Time: 20 min.`,
  ];
  return steps;
}

// ---- board ----
export interface Radar {
  as_of: string; source: string; floor_usd: number; model_version: string; constants: typeof MODEL;
  global_median: number; multiple_cap: number; categories: CategoryStat[];
  watchlist_size: number; board_size: number; extra_size: number; live_size: number;
  rows: BoardRow[]; live: LiveRow[];
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const table = categoryTable(snapshot);
  const wl = new Set(snapshot.watchlist);
  const score = (p: Protocol) => {
    const f = factors(p, snapshot.as_of, table.lookup.get(catOf(p))!.multiple);
    return { p, f, implied: impliedOf(p, f) };
  };
  const byImplied = (a: { p: Protocol; implied: number }, b: { p: Protocol; implied: number }) => b.implied - a.implied || bySlug(a.p, b.p);
  const known = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const must = [...wl].sort().map((s) => {
    const p = known.get(s);
    if (!p) throw new Error(`watchlist slug ${s} is not in protocols`);
    return score(p);
  });
  const brands = exchangeBrands(snapshot.protocols);
  const extras = snapshot.protocols
    .filter((p) => !wl.has(p.slug) && isExtraEligible(p, brands))
    .map(score).sort(byImplied); // board = watchlist + every eligible extra (no fixed row count)
  const ranked = [...must, ...extras].sort(byImplied);
  const board: BoardRow[] = ranked.map(({ p, f, implied }, i) => ({
    rank: i + 1, slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, change_7d: p.change_7d,
    mcap_usd: null, listed_at: p.listed_at, token_status: 'pre-token', watchlist: wl.has(p.slug), implied_value_usd: implied,
    model: f, farm_steps: farmPlan(p, f, implied),
  }));
  const live: LiveRow[] = snapshot.protocols.filter(isLive).sort((a, b) => b.mcap_usd! - a.mcap_usd! || bySlug(a, b)).map((p) => ({
    slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, change_7d: p.change_7d, mcap_usd: p.mcap_usd!,
    mcap_tvl: p.tvl_usd > 0 ? p.mcap_usd! / p.tvl_usd : 0, listed_at: p.listed_at, symbol: p.symbol,
  }));
  const radar: Radar = {
    as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd, model_version: MODEL.version, constants: MODEL,
    global_median: table.global_median, multiple_cap: table.multiple_cap, categories: table.stats,
    watchlist_size: wl.size, board_size: board.length, extra_size: board.filter((r) => !r.watchlist).length, live_size: live.length,
    rows: board, live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  const o = JSON.parse(text);
  if (typeof o?.as_of !== 'string' || !Array.isArray(o.protocols) || !Array.isArray(o.watchlist)) throw new Error('snapshot.json: need as_of, protocols, watchlist');
  return o as Snapshot;
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows`;
  const slugs = new Set(board.map((r) => r.slug));
  const miss = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (miss.length) return `missing watchlist slugs: ${miss.slice(0, 5).join(', ')}`;
  for (let i = 0; i < board.length; i++) if (board[i]!.rank !== i + 1) return `rank ${board[i]!.rank} at row ${i + 1}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i}`;
  if (new Set(board.map((r) => r.implied_value_usd)).size === 1) return 'all rows share one implied value';
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} implied ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} steps`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} step of ${s.trim().length} chars`;
  }
  return null;
}

export const dataScript = (radar: Radar) => `window.RADAR=${JSON.stringify(radar)};\n`;
