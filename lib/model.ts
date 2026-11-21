// radar-2 value model: snapshot in, ranked pre-token board + live-token list out.
// implied = TVL x category_multiple x growth x maturity x chain. Everything derives from snapshot numbers.
// Display-only layers (drivers, execution econ, facets) are computed here at build time and never feed back into the model.
import { COST_RE, farmSteps } from './farm.ts';
import type { FarmStep } from './farm.ts';
import { breakdownFor, cohortPositions } from './breakdown.ts';
import type { Breakdown, CohortPosition } from './breakdown.ts';
import { watchCards, watchGroups } from './watchlist.ts';
import type { WatchCard, WatchGroup } from './watchlist.ts';
import { scenariosFor } from './scenarios.ts';
import type { PlanScenarios } from './scenarios.ts';
import { PRESETS, CAP_VALUES, MINS_VALUES, SIG_VALUES, TIER_VALUES, matchPreset } from './presets.ts';
import type { Preset } from './presets.ts';

export interface Protocol {
  slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number;
  change_7d: number | null; mcap_usd: number | null; listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
export interface Snapshot { as_of: string; source: string; floor_usd: number; protocols: Protocol[]; watchlist: string[] }

export const MODEL = {
  version: 'radar-2',
  shrink_k: 5, multiple_min: 0.1, multiple_max: 3.0,
  growth_floor: -40, growth_cap: 60, growth_weight: 0.35,
  maturity_floor: 0.7, maturity_range: 0.3, maturity_days: 1095, unknown_age_days: 365,
  chain_step: 0.02, chain_max_extra: 5,
  implied_max: 100_000_000_000_000,
};
export const UNCATEGORIZED = 'Uncategorized';

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
const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;
const cents = (n: number) => Math.round(n * 100) / 100;

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
export function categoryTable(snapshot: Snapshot): { global_median: number; stats: CategoryStat[]; lookup: Map<string, CategoryStat> } {
  const live = snapshot.protocols.filter((p) => isLive(p) && p.tvl_usd > 0);
  const ratios = new Map<string, number[]>();
  for (const p of live) {
    const k = catOf(p);
    if (!ratios.has(k)) ratios.set(k, []);
    ratios.get(k)!.push(p.mcap_usd! / p.tvl_usd);
  }
  const globalMedian = median(live.map((p) => p.mcap_usd! / p.tvl_usd)) ?? 1;
  const cats = new Set<string>(snapshot.protocols.map(catOf));
  const stats: CategoryStat[] = [...cats].sort(byCat).map((category) => {
    const r = ratios.get(category) ?? [];
    const n = r.length, raw = median(r);
    const w = n / (n + MODEL.shrink_k);
    const blended = raw === null ? globalMedian : w * raw + (1 - w) * globalMedian;
    return { category, n, raw_median: raw, weight: w, multiple: clamp(blended, MODEL.multiple_min, MODEL.multiple_max) };
  });
  return { global_median: globalMedian, stats, lookup: new Map(stats.map((s) => [s.category, s])) };
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

// ---- execution economics (data.js only): bound to the step parameters from lib/farm.ts, never parsed out of the prose ----
export interface EconStep { n: number; cap_usd: number; reused: boolean; additive: boolean; fee_usd: number; mins: number }
export interface Econ { peak_cap_usd: number; total_fee_usd: number; total_mins: number; cadence: 'one-shot' | 'weekly' | 'biweekly' | 'monthly'; steps: EconStep[] }

/** 7-day TVL change in percentage points as the snapshot reports it (change_7d), one decimal; null when absent. */
export function tvl7d(p: { change_7d: number | null }): number | null {
  if (p.change_7d === null || !Number.isFinite(p.change_7d)) return null;
  const v = Math.round(p.change_7d * 10) / 10;
  return v === 0 ? 0 : v;
}
export function cadenceOf(steps: string[]): Econ['cadence'] {
  const t = steps.join('\n').toLowerCase();
  if (/weekly|every 7 days/.test(t)) return 'weekly';
  if (/biweekly|every 2 weeks|every 14 days/.test(t)) return 'biweekly';
  if (/monthly|every 30 days/.test(t)) return 'monthly';
  return 'one-shot';
}
/** Peak working capital: recycled principal never raises the peak, additive reserves stack, zero-cash steps leave it alone. */
export function buildEcon(steps: FarmStep[]): Econ {
  let peak = 0;
  const out: EconStep[] = steps.map((s, i) => {
    let reused = false;
    if (s.cap === 0) { /* peak unchanged */ }
    else if (s.additive) peak += s.cap;
    else if (s.cap <= peak && peak > 0) reused = true;
    else peak = s.cap;
    return { n: i + 1, cap_usd: s.cap, reused, additive: s.additive && s.cap > 0, fee_usd: cents(s.fee), mins: s.mins };
  });
  return {
    peak_cap_usd: Math.round(peak), total_fee_usd: cents(out.reduce((a, s) => a + s.fee_usd, 0)),
    total_mins: out.reduce((a, s) => a + s.mins, 0), cadence: cadenceOf(steps.map((s) => s.text)), steps: out,
  };
}
/** Build-time reconciliation: ledger numbers must equal the "Cost: ... Time: ..." figures printed in each farm_steps sentence. Throws on any mismatch. */
export function assertEcon(slug: string, texts: string[], e: Econ): void {
  const fail = (m: string): never => { throw new Error(`econ ${slug}: ${m}`); };
  if (e.steps.length !== texts.length) fail(`${e.steps.length} econ steps vs ${texts.length} farm steps`);
  if (e.total_fee_usd !== cents(e.steps.reduce((a, s) => a + s.fee_usd, 0))) fail('fee total');
  if (e.total_mins !== e.steps.reduce((a, s) => a + s.mins, 0)) fail('minutes total');
  e.steps.forEach((s, i) => {
    const m = COST_RE.exec(texts[i]!);
    if (s.n !== i + 1) fail(`step number ${s.n} at ${i}`);
    if (m === null) return fail(`step ${s.n} has no cost line`);
    if (Number(m[1]) !== s.cap_usd) fail(`step ${s.n} capital ${s.cap_usd} vs text ${m[1]}`);
    if (Number(m[2]) !== s.fee_usd) fail(`step ${s.n} fee ${s.fee_usd} vs text ${m[2]}`);
    if (Number(m[3]) !== s.mins) fail(`step ${s.n} minutes ${s.mins} vs text ${m[3]}`);
  });
  const caps = e.steps.map((s) => s.cap_usd), mx = Math.max(0, ...caps), sum = caps.reduce((a, b) => a + b, 0);
  if (e.peak_cap_usd < mx || e.peak_cap_usd > sum) fail(`peak ${e.peak_cap_usd} outside ${mx}..${sum}`);
  if (e.steps.every((s) => !s.additive) && e.peak_cap_usd !== mx) fail('peak');
}

// ---- display-only drivers (v6): precomputed here, only formatted in the browser ----
export interface Drivers {
  mult: number | null; mult_basis: 'T'; mult_peer_median: number; mult_category_median: number;
  growth_pct: number | null; growth_start: number | null; growth_end: number | null;
  age_days: number | null; age_launch_date: string | null; age_factor: number;
}
/** mult = implied / TVL (the snapshot's only base metric); growth = reported 7-day TVL change (no 30-day field exists); age against as_of. */
export function driversOf(r: BoardRow, globalMedian: number): Drivers {
  const c = r.change_7d;
  return {
    mult: r.tvl_usd > 0 ? r4(r.implied_value_usd / r.tvl_usd) : null, mult_basis: 'T',
    mult_peer_median: r4(r.model.category_multiple), mult_category_median: r4(globalMedian),
    growth_pct: c, growth_start: c !== null && c > -100 ? Math.round(r.tvl_usd / (1 + c / 100)) : null, growth_end: c !== null ? Math.round(r.tvl_usd) : null,
    age_days: r.model.age_days, age_launch_date: r.listed_at, age_factor: r4(r.model.maturity_multiplier),
  };
}

// ---- board ----
export type Cohort = { cat: string; pc: string };
export type RadarRow = BoardRow & Cohort & { drivers: Drivers; tvl_7d_pct: number | null; econ: Econ; scen: PlanScenarios; bd: { b: Breakdown; c: CohortPosition }; wc: WatchCard | null };
export type RadarLive = LiveRow & Cohort & { tvl_7d_pct: number | null };
export interface Facets { categories: Array<{ id: string; pre: number; live: number; mult: number }>; chains: Array<{ id: string; pre: number; live: number }>; global_mult: number }
export interface Radar {
  as_of: string; source: string; floor_usd: number; model_version: string; constants: typeof MODEL;
  global_median: number; categories: CategoryStat[];
  watchlist_size: number; board_size: number; extra_size: number; live_size: number;
  rows: RadarRow[]; live: RadarLive[]; facets: Facets; watch_groups: WatchGroup[]; presets: Preset[];
}

// Facets are precomputed so the browser never recomputes counts or peer multiples. The snapshot has no per-chain TVL,
// so a protocol's primary chain ("pc") is its first listed chain.
function buildFacets(board: BoardRow[], live: LiveRow[], table: ReturnType<typeof categoryTable>): Facets {
  const cats = new Map<string, { pre: number; live: number }>();
  const chs = new Map<string, { pre: number; live: number }>();
  const bump = (m: Map<string, { pre: number; live: number }>, k: string, f: 'pre' | 'live') => {
    const e = m.get(k) ?? { pre: 0, live: 0 };
    e[f]++;
    m.set(k, e);
  };
  for (const [list, f] of [[board, 'pre'], [live, 'live']] as const) {
    for (const row of list) {
      bump(cats, row.category ?? UNCATEGORIZED, f);
      for (const c of new Set(row.chains)) bump(chs, c, f);
    }
  }
  const order = <T extends { id: string; pre: number }>(a: T, b: T) => b.pre - a.pre || byCat(a.id, b.id);
  return {
    categories: [...cats].map(([id, e]) => ({ id, pre: e.pre, live: e.live, mult: r4(table.lookup.get(id)?.multiple ?? table.global_median) })).sort(order),
    chains: [...chs].map(([id, e]) => ({ id, pre: e.pre, live: e.live })).sort(order),
    global_mult: r4(table.global_median),
  };
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
  const plans = ranked.map(({ p, f, implied }) => farmSteps(p, f, implied));
  const board: BoardRow[] = ranked.map(({ p, f, implied }, i) => ({
    rank: i + 1, slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, change_7d: p.change_7d,
    mcap_usd: null, listed_at: p.listed_at, token_status: 'pre-token', watchlist: wl.has(p.slug), implied_value_usd: implied,
    model: f, farm_steps: plans[i]!.map((s) => s.text),
  }));
  const cohorts = cohortPositions(board);
  // display-only watchlist layer (momentum tiers, category/watchlist ranks, category groups); never written to board.json
  const watchInputs = board.filter((b) => b.watchlist).map((b) => ({
    slug: b.slug, rank: b.rank, cat: b.category ?? UNCATEGORIZED, tvl_usd: b.tvl_usd, change_7d: b.change_7d, implied_value_usd: b.implied_value_usd,
  }));
  const wcards = watchCards(watchInputs);
  const wgroups = watchGroups(watchInputs);
  const rows: RadarRow[] = board.map((b, i) => {
    const econ = buildEcon(plans[i]!);
    assertEcon(b.slug, b.farm_steps, econ);
    const scen = scenariosFor(econ); // display-only planning ranges; mid must equal the econ ledger exactly
    const sm = scen.scenarios[1]!;
    if (sm.peak_cap_usd !== econ.peak_cap_usd || sm.total_fee_usd !== econ.total_fee_usd || sm.total_mins !== econ.total_mins) {
      throw new Error(`mid scenario diverges from econ for ${b.slug}`);
    }
    const p = ranked[i]!.p;
    const bd ={ b: breakdownFor(p, snapshot.as_of, table.lookup.get(catOf(p))!, table.global_median), c: cohorts.get(b.slug)! };
    if (bd.b.implied_value_usd !== b.implied_value_usd) throw new Error(`breakdown diverges from board for ${b.slug}`);
    return { ...b, cat: b.category ?? UNCATEGORIZED, pc: b.chains[0] ?? '—', drivers: driversOf(b, table.global_median), tvl_7d_pct: tvl7d(b), econ, scen, bd, wc: wcards.get(b.slug) ?? null };
  });
  if (wgroups.reduce((s, g) => s + g.count, 0) !== wl.size) throw new Error('watch_groups counts do not sum to watchlist_size');
  const wranks = rows.filter((r) => r.watchlist).map((r) => r.wc?.watch_rank ?? 0).sort((a, b) => a - b);
  if (wranks.length !== wl.size || wranks.some((v, i) => v !== i + 1)) throw new Error('watch_rank values are not exactly 1..watchlist_size');
  if (rows.some((r) => r.watchlist !== (r.wc !== null))) throw new Error('wc must be set on exactly the watchlist rows');
  if (new Set(PRESETS.map((p) => p.id)).size !== PRESETS.length) throw new Error('preset ids are not unique');
  for (const p of PRESETS) {
    const s = p.state;
    if (!CAP_VALUES.includes(s.cap) || !MINS_VALUES.includes(s.mins) || !SIG_VALUES.includes(s.sig) || !TIER_VALUES.includes(s.tier)) throw new Error(`preset ${p.id} state outside allow-lists`);
    if (matchPreset(s) !== p.id) throw new Error(`preset ${p.id} does not match itself`);
  }
  const live: LiveRow[] = snapshot.protocols.filter(isLive).sort((a, b) => b.mcap_usd! - a.mcap_usd! || bySlug(a, b)).map((p) => ({
    slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, change_7d: p.change_7d, mcap_usd: p.mcap_usd!,
    mcap_tvl: p.tvl_usd > 0 ? r4(p.mcap_usd! / p.tvl_usd) : 0, listed_at: p.listed_at, symbol: p.symbol,
  }));
  const radar: Radar = {
    as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd, model_version: MODEL.version, constants: MODEL,
    global_median: table.global_median, categories: table.stats,
    watchlist_size: wl.size, board_size: board.length, extra_size: board.filter((r) => !r.watchlist).length, live_size: live.length,
    rows, live: live.map((l) => ({ ...l, cat: l.category ?? UNCATEGORIZED, pc: l.chains[0] ?? '—', tvl_7d_pct: tvl7d(l) })),
    facets: buildFacets(board, live, table), watch_groups: wgroups, presets: PRESETS,
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
