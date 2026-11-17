// radar-2 value model: snapshot in, ranked pre-token board + live-token list out.
// implied = TVL x category_multiple x growth x maturity x chain. Everything derives from snapshot numbers.

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

// ---- farm plan ----
// Seven steps per row. Wording depends on the category kit (what the wallet actually does) and on bands derived from
// snapshot numbers only: TVL band -> capital, listing age -> hold period, 7-day TVL change -> monitoring cadence.
// No APYs, program names or addresses are asserted; every Cost / Time figure is an estimate from the band rules.
interface Ctx {
  p: Protocol; name: string; cat: string; chain: string; more: string; tvl: string; trend: string; age: string; implied: string;
  cap: number; slice: number; half: number; rest: number; gas: number; hold: number; every: number; checks: number; round: number; floorTvl: string; pace: string;
}
interface Kit { key: string; read: string; asset: string; steps: [(c: Ctx) => string, (c: Ctx) => string, (c: Ctx) => string]; points: string }
const g = (n: number) => n.toFixed(2);
const KITS: Kit[] = [
  { key: 'curator', read: 'the curator list, which vaults each curator allocates to and the fee each one takes', asset: 'a stablecoin the vaults accept',
    points: 'the points or rewards page for curator vault depositors',
    steps: [
      (c) => `Pick one curator vault on ${c.name} and deposit $${c.slice} of your stable balance. Before signing, read which markets the curator allocates into and which collateral sits behind them, then confirm that the deposit shows in the points counter within a day. Cost: about $${g(c.gas * 0.4)} gas, no entry fee expected. Time: 25 min plus a 10 min points check the next day.`,
      (c) => `Split the remaining deposit on ${c.name}: put $${c.half} into a second curator vault with a different risk profile, so the wallet is seen to compare curators rather than sit in one. Withdraw $${Math.max(5, Math.round(c.half / 4))} and redeposit it to test the exit path. Cost: about $${g(c.gas * 0.6)} gas across three transactions. Time: 20 min.`,
      (c) => `Every 7 days for 3 weeks, top up one vault by $${c.round} or less and note the vault share price and the points total. If a curator changes its allocation, log it. This builds a steady deposit history without a single large burst. Cost: about $${g(c.gas * 1.2)} gas over the rounds. Time: 10 min per round, 3 weeks.`,
    ] },
  { key: 'dex', read: 'the pool list, fee tiers and the volume to TVL ratio of the deepest stable pair', asset: 'two stablecoins for a stable pair, or the pair the pool needs',
    points: 'the liquidity or trading points page',
    steps: [
      (c) => `Provide liquidity on ${c.name}: open one stable-pair pool and add $${c.slice} split evenly between the two sides. Preview the price impact before signing, keep slippage under 0.5%, and check that the position shows up on the pool page. Cost: about $${g(c.gas * 0.5)} gas, the pool fee is earned rather than paid. Time: 20 min.`,
      (c) => `Trade on ${c.name} as a user too: do three swaps of about $${Math.max(5, Math.round(c.half / 3))} each through different routes, then add $${c.half} to a second pool. Swap volume and liquidity are the two signals a DEX can count, so cover both. Cost: swap fees near 0.3% of volume plus about $${g(c.gas * 0.8)} gas. Time: 25 min.`,
      (c) => `Each week for 3 weeks, rebalance the LP position on ${c.name} and make one swap of $${c.round}. Read the position's accrued fees and the pool's volume, and widen or narrow the range only if the price drifts out of it. Cost: about $${g(c.gas * 1.2)} gas in total. Time: 10 min per round, 3 weeks.`,
    ] },
  { key: 'lend', read: 'the markets, loan-to-value limits, borrow caps and the liquidation penalty', asset: 'a stablecoin plus a blue-chip collateral asset',
    points: 'the lender and borrower points or rewards page',
    steps: [
      (c) => `Supply $${c.slice} to the deepest stablecoin market on ${c.name}. Check the market's utilisation and the supply cap, and enable it as collateral only if you plan to borrow. Cost: about $${g(c.gas * 0.4)} gas, no supply fee. Time: 15 min.`,
      (c) => `Borrow a small amount against the supply on ${c.name}: $${Math.max(5, Math.round(c.half * 0.4))} at most, which keeps loan-to-value under 30% of the allowed limit, then repay it two days later. Borrowing and repaying are separate on-chain actions, so keep spare borrow capacity of at least 70%. Cost: about $${g(c.gas * 0.8)} gas plus a few cents of interest. Time: 20 min, over 2 days.`,
      (c) => `Once a week for 3 weeks, top up supply by $${c.round} and check the health factor, the borrow capacity left and utilisation on ${c.name}. If the factor falls near the liquidation line, repay first. Cost: about $${g(c.gas * 1.2)} gas in total. Time: 10 min per round, 3 weeks.`,
    ] },
  { key: 'yield', read: 'the vault list, the strategy behind each vault, withdrawal terms and any lock-up', asset: 'the single asset the chosen vault takes',
    points: 'the depositor points or rewards page',
    steps: [
      (c) => `Stake $${c.slice} in the main vault on ${c.name} and read the strategy description first: which assets it holds and how it compounds. Note the share price at entry so later growth can be measured, and confirm that withdrawals carry no lock-up you did not expect. Cost: about $${g(c.gas * 0.4)} gas. Time: 20 min.`,
      (c) => `Add a second vault on ${c.name} with $${c.half}, and compound once by claiming and redepositing whatever the vault pays out. Compounding is the action a yield protocol most plainly wants repeated, so do it by hand at least once. Cost: about $${g(c.gas * 0.6)} gas. Time: 20 min.`,
      (c) => `Every 7 days for 3 weeks, compound and add $${c.round} on ${c.name}. Log the share price after each round, so you can see actual growth rather than a quoted figure, and stop adding if it falls. Cost: about $${g(c.gas * 1.2)} gas. Time: 10 min per round, 3 weeks.`,
    ] },
  { key: 'stake', read: 'the staking or restaking options, unbonding time and slashing terms', asset: 'the staking asset, bought in the smallest sensible lot',
    points: 'the staker points or airdrop checker page',
    steps: [
      (c) => `Stake $${c.slice} on ${c.name} and read the unbonding period and slashing terms before signing. If a liquid receipt token is issued, check where it can be redeemed. Cost: about $${g(c.gas * 0.5)} gas, an exit queue may apply. Time: 20 min.`,
      (c) => `Delegate or restake a second amount of $${c.half} on ${c.name}, to a different operator if the product offers a choice, then unstake $${Math.max(5, Math.round(c.half / 4))} to test the queue. A staking wallet should show both entry and exit. Cost: about $${g(c.gas * 0.8)} gas. Time: 25 min.`,
      (c) => `Weekly for 3 weeks, claim rewards if any and add $${c.round} or less on ${c.name}. Check the operator's uptime and whether any slashing event is reported. Cost: about $${g(c.gas * 1.2)} gas in total. Time: 10 min per round, 3 weeks.`,
    ] },
  { key: 'bridge', read: 'the supported routes, the fee table and the time each route takes', asset: 'the asset you will move, on the source chain',
    points: 'the bridge points or volume tracker',
    steps: [
      (c) => `Bridge $${c.slice} out through ${c.name} to a second chain and back. Check the quoted fee and the arrival time before confirming, and keep the receipt of each leg. Cost: about $${g(c.gas)} gas plus the route fee. Time: 30 min.`,
      (c) => `Use a second route on ${c.name} with $${c.half}, a different pair of chains if the product offers one, so the wallet is not limited to a single path. Cost: about $${g(c.gas * 0.8)} gas plus fees. Time: 30 min.`,
      (c) => `Once a week for 3 weeks, send one round-trip of $${c.round} or less through ${c.name}. Compare the quote against the amount received each time. Cost: about $${g(c.gas * 1.2)} gas plus fees. Time: 10 min per round, 3 weeks.`,
    ] },
  { key: 'deriv', read: 'the markets, the margin model, the fee schedule and the liquidation rules', asset: 'the margin asset the venue accepts',
    points: 'the trader points or rewards page',
    steps: [
      (c) => `Deposit $${c.slice} as margin on ${c.name} and open one low-leverage position, 2x at most, sized under $${Math.max(10, Math.round(c.slice / 2))}. Confirm the liquidation price before signing and set it far from market. Cost: about $${g(c.gas * 0.5)} gas plus trading fees, which can be a few cents. Time: 20 min.`,
      (c) => `Close the first position on ${c.name} and open a second in a different market with $${c.half} of margin, so the history spans more than one market. Cost: about $${g(c.gas * 0.8)} gas plus fees. Time: 20 min.`,
      (c) => `Weekly for 3 weeks, open and close one small position of $${c.round} or less on ${c.name}. Never add leverage and never hold through a large move. Cost: about $${g(c.gas * 1.2)} gas plus fees. Time: 10 min per round, 3 weeks.`,
    ] },
  { key: 'cdp', read: 'the collateral types, the stability fee, the minimum debt and the liquidation ratio', asset: 'the collateral asset the vault accepts',
    points: 'the minter or holder points page',
    steps: [
      (c) => `Open a vault on ${c.name} and deposit $${c.slice} of collateral, then mint only a little of the stablecoin, no more than a third of the safe limit. Read the liquidation ratio and the minimum debt first. Cost: about $${g(c.gas * 0.6)} gas plus any stability fee. Time: 25 min.`,
      (c) => `Repay part of the debt on ${c.name} and add $${c.half} of collateral, which moves the vault further from the liquidation line. Try minting again after that. Cost: about $${g(c.gas * 0.8)} gas. Time: 20 min.`,
      (c) => `Once a week for 3 weeks, mint and repay a cycle of $${c.round} or less on ${c.name}, and check the collateral ratio each time. If the collateral price falls toward the liquidation line, add collateral or repay. Cost: about $${g(c.gas * 1.2)} gas. Time: 10 min per round, 3 weeks.`,
    ] },
  { key: 'rwa', read: 'the eligibility rules, the identity check, the minimum subscription and redemption terms', asset: 'the currency the product accepts for subscription',
    points: 'the investor points or rewards page',
    steps: [
      (c) => `Complete the identity check that ${c.name} requires, if it applies in your region, then subscribe $${c.slice}, or the stated minimum if that is higher. Read the redemption window first, since tokenised assets often settle in days, not minutes. Cost: about $${g(c.gas * 0.4)} gas plus any subscription fee. Time: 40 min including the check.`,
      (c) => `Add a second subscription of $${c.half} on ${c.name}, in a different product if one exists, and check that the balance and the accrual of income show in the app. Cost: about $${g(c.gas * 0.6)} gas. Time: 20 min.`,
      (c) => `Every week for 3 weeks, add $${c.round} or less on ${c.name} and check the redemption terms. Test one small redemption, so that you know the exit works. Cost: about $${g(c.gas * 1.2)} gas plus fees. Time: 10 min per round, 3 weeks.`,
    ] },
  { key: 'generic', read: 'the product pages, the main user flow and the fee table', asset: 'a stablecoin, as the first deposit',
    points: 'the rewards or points page, if the app has one',
    steps: [
      (c) => `Use the core product of ${c.name} once with $${c.slice}: complete its main user flow from start to finish, and keep the transaction link. Read the fee table before signing. Cost: about $${g(c.gas * 0.4)} gas plus fees. Time: 20 min.`,
      (c) => `Do a second, different action on ${c.name} with $${c.half}, for example a withdrawal followed by a new deposit, so the wallet shows more than one kind of use. Cost: about $${g(c.gas * 0.6)} gas. Time: 20 min.`,
      (c) => `Weekly for 3 weeks, repeat the main flow on ${c.name} with $${c.round} or less. A steady record is worth more than one burst. Cost: about $${g(c.gas * 1.2)} gas. Time: 10 min per round, 3 weeks.`,
    ] },
];
function kitFor(category: string | null): Kit {
  const c = (category ?? '').toLowerCase();
  const by = (k: string) => KITS.find((x) => x.key === k)!;
  if (/curator|allocator/.test(c)) return by('curator');
  if (/dex|liquidity|amm|farm|launchpad/.test(c)) return by('dex');
  if (/lend|credit|collateral/.test(c)) return by('lend');
  if (/yield|vault|basis|index|aggregator|cedefi/.test(c)) return by('yield');
  if (/stak|restak|chain/.test(c)) return by('stake');
  if (/bridge/.test(c)) return by('bridge');
  if (/deriv|option|perp|synthetic|prediction|rate/.test(c)) return by('deriv');
  if (/cdp|stable|algo|reserve/.test(c)) return by('cdp');
  if (/rwa|real|asset|payment|card/.test(c)) return by('rwa');
  return by('generic');
}
export function capitalFor(tvl: number): number { return tvl < 25e6 ? 50 : tvl < 100e6 ? 100 : tvl < 500e6 ? 150 : 250; }
export function holdDaysFor(age: number | null): number { const a = age ?? MODEL.unknown_age_days; return a < 90 ? 14 : a < 365 ? 30 : a < 1095 ? 45 : 60; }
/** Days between TVL checks from the sign and size of the 7-day change: falling TVL is watched closest. */
export function checkEveryFor(change: number | null): number { return change === null ? 7 : change <= -10 ? 2 : change < 0 ? 3 : change >= 10 ? 3 : 7; }
const fmtM = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : `$${(n / 1e6).toFixed(1)}M`);
const tvlBand = (tvl: number) => (tvl < 25e6 ? 'small (under $25M)' : tvl < 100e6 ? 'mid-size ($25M to $100M)' : tvl < 500e6 ? 'large ($100M to $500M)' : 'very large (over $500M)');
const ageBand = (a: number | null) => (a === null ? 'unknown age' : a < 90 ? 'new (under 90 days)' : a < 365 ? 'young (under a year)' : a < 1095 ? 'established (under 3 years)' : 'mature (3 years or more)');

export function farmPlan(p: Protocol, f: Factors, implied: number): string[] {
  const kit = kitFor(p.category);
  const chain = p.chains[0] ?? 'its main chain';
  const cap = capitalFor(p.tvl_usd), hold = holdDaysFor(f.age_days), every = checkEveryFor(p.change_7d);
  const gas = chain === 'Ethereum' ? 12 : 2;
  const slice = Math.round(cap * 0.4), reserve = cap - slice, half = Math.round(reserve / 2);
  const checks = Math.max(1, Math.floor(hold / every));
  const n = p.chains.length;
  const ch = p.change_7d;
  const c: Ctx = {
    p, name: p.name, cat: p.category ?? 'uncategorised', chain, more: n > 1 ? ` (one of ${n} chains)` : '', tvl: fmtM(p.tvl_usd),
    trend: ch === null ? 'no 7-day TVL reading' : `TVL ${ch >= 0 ? '+' : ''}${ch.toFixed(1)}% over 7 days`,
    age: f.age_days === null ? 'unknown listing age' : `${f.age_days} days tracked`, implied: fmtM(implied),
    cap, slice, half, rest: reserve - half, gas, hold, every, checks, round: Math.max(5, Math.round(cap * 0.1)), floorTvl: fmtM(p.tvl_usd * 0.6),
    pace: ch === null ? 'weekly, because there is no 7-day reading to react to' : ch <= -10 ? `every ${every} days, because TVL is falling fast` : ch < 0 ? `every ${every} days, because TVL is slipping` : ch >= 10 ? `every ${every} days, because fast inflows can dilute rewards` : 'weekly, because TVL is steady',
  };
  const pct = Math.round((slice / cap) * 100);
  // Each tail has a short and a long form; the long form is used only while the step stays within 450 characters.
  const tails: [string, string][] = [
    [` That is ${pct}% of the $${cap} budget for a ${tvlBand(p.tvl_usd)} protocol.`, ` That is ${pct}% of the $${cap} budget for a ${tvlBand(p.tvl_usd)} protocol. Log the link and date of this first action.`],
    [` The last $${reserve - half} stays untouched for gas and the exit.`, ` The last $${reserve - half} stays untouched for gas and the exit. Log this link beside the first; two distinct actions on ${chain} make the history readable.`],
    [` With ${c.trend}, ${ch !== null && ch < 0 ? 'keep rounds small' : 'an early dated record beats size'}; stop adding below ${c.floorTvl} TVL.`, ` With ${c.trend}, ${ch !== null && ch < 0 ? 'keep rounds small' : 'an early dated record beats size'}; stop adding below ${c.floorTvl} TVL. Log each round with date and link, 7 days apart.`],
  ];
  const stepsA = kit.steps.map((s, i) => { const base = s(c); return base + (base.length + tails[i]![1].length <= 450 ? tails[i]![1] : tails[i]![0]); });
  const topic = `${c.name} (${c.cat}) on ${chain}${c.more}`;
  return [
    `Scope ${topic}: ${c.tvl} TVL in the ${tvlBand(p.tvl_usd)} band, ${c.trend}, ${c.age}, ${ageBand(f.age_days)}. Model value ${c.implied}. Read ${kit.read}, check the last 20 transactions to confirm the app is live, and confirm there is no token yet. Cost: $0. Time: 30 to 45 min.`,
    `Open a fresh ${chain} wallet that is used only for ${c.name}, and fund it with $${cap} of ${kit.asset}, the ${tvlBand(p.tvl_usd)} band size, plus about $${gas} of native gas. Split it as $${slice} for the first action, $${half} for the second and $${reserve - half} as a reserve. Main funds stay out of it. Cost: $${cap + gas} deployed, of which $${gas} is gas and the rest is recoverable principal. Time: 25 min.`,
    stepsA[0]!, stepsA[1]!, stepsA[2]!,
    `Hold the position for ${hold} days, the period for a ${ageBand(f.age_days)} protocol, and check ${c.name} ${c.pace}, ${checks} checks in all. At each check read TVL and ${kit.points}. If TVL drops below ${c.floorTvl} (60% of today's), withdraw early. Cost: $0 beyond the opportunity cost of $${cap} locked for ${hold} days. Time: 5 min per check, about ${checks * 5} min in total over ${hold} days.`,
    `Exit plan for ${c.name}: after ${hold} days, withdraw everything and record the cost basis, about $${gas * 3} of gas in total. Watch announcements and ${kit.points} for a token, snapshot date or claim page. If a snapshot date is set, stay in until it passes. If nothing is announced by day ${hold + 30}, stop farming ${c.name}. Cost: about $${gas} gas. Time: 20 min, then 10 min per week until day ${hold + 30}.`,
  ];
}

// ---- board ----
export interface Radar {
  as_of: string; source: string; floor_usd: number; model_version: string; constants: typeof MODEL;
  global_median: number; categories: CategoryStat[];
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
    global_median: table.global_median, categories: table.stats,
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
