// Farm plan generator. A snapshot category maps to one of six archetypes, then to an 11-step skeleton:
// Scope, Fund, Opening (3 variants), First action, Second action, Repeat, Monitoring (2), Hold, Record-keeping (8), Exit (2), Wrap-up.
// Pattern choice is a pure FNV-1a hash of the slug, so one snapshot always yields the same text. No clock, no randomness.
// Every step is built together with its numbers {cap, additive, fee, mins}; the closing "Cost: ... Time: ..." sentence is
// printed from those numbers, so the execution ledger (lib/model.ts buildEcon) binds to parameters, never to parsed prose.
import type { Factors, Protocol } from './model.ts';

export type Archetype = 'lending' | 'dex' | 'yield' | 'deriv' | 'bridge' | 'market';
export interface FarmStep { text: string; cap: number; additive: boolean; fee: number; mins: number }

// Snapshot category -> archetype: exact names first, then keyword rules for unseen names, default 'yield'.
const BY_CATEGORY: Record<string, Archetype> = {
  'Lending': 'lending', 'Uncollateralized Lending': 'lending', 'CDP': 'lending', 'CDP Manager': 'lending', 'Collateral Markets': 'lending',
  'Collateral Management': 'lending', 'Risk Curators': 'lending', 'Onchain Capital Allocator': 'lending', 'Stablecoin Issuer': 'lending',
  'Dual-Token Stablecoin': 'lending', 'Algo-Stables': 'lending', 'Reserve Currency': 'lending', 'Stablecoin Wrapper': 'lending',
  'Dexs': 'dex', 'Liquidity Manager': 'dex', 'Launchpad': 'dex', 'Indexes': 'dex', 'OTC Marketplace': 'dex', 'Token Locker': 'dex',
  'Yield': 'yield', 'Yield Aggregator': 'yield', 'Farm': 'yield', 'Leveraged Farming': 'yield', 'Basis Trading': 'yield', 'Staking Pool': 'yield',
  'Liquid Staking': 'yield', 'Restaking': 'yield', 'Liquid Restaking': 'yield', 'Restaked BTC': 'yield', 'Anchor BTC': 'yield',
  'Decentralized BTC': 'yield', 'RWA': 'yield', 'CeDeFi': 'yield', 'Governance Incentives': 'yield', 'DOR': 'yield',
  'Derivatives': 'deriv', 'Options': 'deriv', 'Options Vault': 'deriv', 'Synthetics': 'deriv', 'Interest Rate Derivatives': 'deriv',
  'Bridge': 'bridge', 'Cross Chain Bridge': 'bridge', 'Canonical Bridge': 'bridge', 'Chain': 'bridge', 'Privacy': 'bridge',
  'Payments': 'bridge', 'Crypto Card Issuer': 'bridge',
  'Prediction Market': 'market', 'AI Agents': 'market', 'Decentralized AI': 'market', 'NFT Marketplace': 'market', 'Insurance': 'market',
};
const BY_KEYWORD: Array<[RegExp, Archetype]> = [
  [/predict|gam|nft|ai\b|insur|bet/i, 'market'],
  [/deriv|option|perp|synthetic|futures|rate/i, 'deriv'],
  [/bridge|cross|chain|payment|card|privacy/i, 'bridge'],
  [/lend|borrow|loan|cdp|collateral|credit|stable|curator|allocator/i, 'lending'],
  [/dex|swap|amm|liquidity|launch|exchange|market|otc/i, 'dex'],
  [/yield|vault|stak|farm|rwa|basis|bond|index/i, 'yield'],
];
export function archetypeOf(category: string | null): Archetype {
  if (category !== null) {
    const hit = BY_CATEGORY[category];
    if (hit !== undefined) return hit;
    for (const [re, a] of BY_KEYWORD) if (re.test(category)) return a;
  }
  return 'yield';
}

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const pick = <T,>(xs: T[], slug: string, slot: string): T => xs[hash(`${slot}:${slug}`) % xs.length]!;
const cents = (n: number) => Math.round(n * 100) / 100;
const fmtM = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : `$${(n / 1e6).toFixed(1)}M`);
export function capitalFor(tvl: number): number { return tvl < 25e6 ? 50 : tvl < 100e6 ? 100 : tvl < 500e6 ? 150 : 250; }
export function holdDaysFor(ageUsed: number): number { return ageUsed < 90 ? 14 : ageUsed < 365 ? 30 : ageUsed < 1095 ? 45 : 60; }

/** The sentence every step ends with, printed from the step's own numbers. lib/model.ts assertEcon checks it against the ledger. */
export const COST_RE = /Cost: \$(\d+) capital, \$(\d+\.\d{2}) fee\. Time: (\d+) min\.$/;
const costLine = (cap: number, fee: number, mins: number) => `Cost: $${cap} capital, $${fee.toFixed(2)} fee. Time: ${mins} min.`;

interface Ctx {
  n: string; ch: string; chB: string; tvl: string; tvl60: string; cap: number; slice: number; half: number; small: number; big: number;
  gas: number; hold: number; asset: string; trend: string;
}
// A pattern returns its sentence plus the cash principal it puts to work and whether that cash is an extra concurrent reserve.
type Pat = (c: Ctx) => [text: string, cap: number, additive?: boolean];
const r = Math.round;

const OPENING: Record<Archetype, Pat[]> = {
  lending: [
    (c) => [`Deposit $${c.slice} of ${c.asset} on ${c.ch} to earn a share of ${c.n}'s future token, and hold the receipt token in the same wallet. The protocol already carries ${c.tvl} of deposits, so a visible supply position is the cheapest proof that you used the credit market.`, c.slice],
    (c) => [`Borrow a small amount of stablecoin against $${c.slice} of collateral supplied on ${c.n} (${c.ch}), keeping the loan under 30% of the collateral value, about $${r(c.slice * 0.3)}. A live debt position traces back to a single wallet, which idle capital parked in a vault never does.`, c.slice],
    (c) => [`Open a 200% collateralised position on ${c.n} (${c.ch}) with $${c.slice} of collateral and mint or borrow no more than $${r(c.slice / 2)} against it. A debt position is the only on-chain footprint that proves you used the credit engine.`, c.slice],
  ],
  dex: [
    (c) => [`Swap $${c.small} of ${c.asset} for a second asset through ${c.n} on ${c.ch} and keep the route receipt in your wallet. Against ${c.tvl} of liquidity the price impact stays small, and the swap history is the clearest proof that you routed through it.`, c.small],
    (c) => [`Provide $${c.slice} of liquidity to the deepest stable pair on ${c.n} (${c.ch}) with a price range that matches the last 30 days of volatility rather than the default. A narrow range on ${c.tvl} of TVL earns more fees per dollar, so check it twice.`, c.slice],
    (c) => [`Run three differently sized swaps on ${c.n} over three days: $${c.small} as a test, $${c.half} as the main swap and $${c.big} as the largest. Spacing them out makes your ${c.ch} activity read as a trader's habit instead of a one-off airdrop farm.`, c.big],
  ],
  yield: [
    (c) => [`Stake $${c.slice} of ${c.asset} with ${c.n} on ${c.ch} and hold the resulting receipt token in the same wallet, so the yield position doubles as a verifiable receipt. The protocol holds ${c.tvl} of deposits, and ${c.trend}.`, c.slice],
    (c) => [`Split $${c.slice} across two of ${c.n}'s strategies on ${c.ch}, $${c.half} each, because the yield only makes sense if you can compare the two returns side by side. Note the entry date of each so you can measure the difference later.`, c.slice],
    (c) => [`Deposit $${c.slice} into ${c.n}'s main vault on ${c.ch}, then immediately note the entry APY shown in the app and the lock-up end date. Without those two numbers the rest of the plan has no baseline, and the pool holds ${c.tvl} to compare against.`, c.slice],
  ],
  deriv: [
    (c) => [`Open a $${c.slice} long on a major market on ${c.n} with 2x leverage and a stop-loss at 10%; the cash margin is $${c.half}. A live position with defined risk is the activity the derivatives desk actually tracks, and ${c.n} carries ${c.tvl} of collateral.`, c.half],
    (c) => [`Sell a short-dated covered option or provide margin liquidity on ${c.n} (${c.ch}) with $${c.slice}, treating the premium as your fee for supplying what the market needs. Choose an expiry within ${c.hold} days so the position matures inside this plan.`, c.slice],
    (c) => [`Hedge $${c.half} of spot ${c.asset} by shorting the same amount on ${c.n}'s perp market; the short leg needs its own $${c.half} of margin on top of the spot, so budget both. Keep both legs open for 14 days so the hedge, not a single trade, becomes your track record.`, c.half, true],
  ],
  bridge: [
    (c) => [`Bridge $${c.slice} of ${c.asset} from ${c.ch} to ${c.chB} through ${c.n} in two tranches, $${c.half} now and $${c.half} in 7 days. A bridge that sees sustained use looks like adoption, and ${c.n} already secures ${c.tvl} of locked value.`, c.slice],
    (c) => [`Use ${c.n} to move $${c.slice} of ${c.asset} from ${c.ch} to ${c.chB}, then deploy it straight into that chain's native app. A bridge transfer that ends in a dead wallet looks like a test, not adoption, and the second leg costs about $${c.gas} of gas.`, c.slice],
    (c) => [`Send a $${c.small} test bridge through ${c.n} first, confirm the arrival time and fee, then send the remaining $${c.slice - c.small} only after the test lands within 20 minutes. One extra gas payment protects $${c.slice - c.small} from a bad route.`, c.slice],
  ],
  market: [
    (c) => [`Place a $${c.small} position on one open market on ${c.n} (${c.ch}) and keep it open until resolution, because a settled outcome is the only bet the platform can verify end to end. Pick a market that resolves within ${c.hold} days.`, c.small],
    (c) => [`Buy $${c.slice} worth of an in-app item or position on ${c.n} (${c.ch}) and use it in your next 5 sessions, so your on-chain inventory and activity history tell the same story. The platform holds ${c.tvl} in total.`, c.slice],
    (c) => [`Split $${c.slice} across three markets on ${c.n}: $${c.small} short-term, $${c.half} medium-term and the rest as a long shot. Log the entry price of each so you can compare your hit rate later. TVL stands at ${c.tvl}.`, c.slice],
  ],
};

const MONITOR: Record<Archetype, Array<(c: Ctx) => string>> = {
  lending: [
    (c) => `Once a week, open the ${c.n} dashboard and record your health factor, outstanding debt and liquidation price, then compare with last week to spot a slow drift before it becomes a margin call. Also note whether TVL has moved from ${c.tvl}.`,
    (c) => `Every Sunday, check whether ${c.n}'s borrow rate has moved by more than 2 percentage points since your entry and whether total borrows grew or shrank, because a sudden rate spike is usually the first sign the pool is about to change. ${c.trend}.`,
  ],
  dex: [
    (c) => `Every Monday, note the 24-hour volume and fee APR of your pool on ${c.n} and check whether your share has been diluted by more than 10% since last week. TVL began at ${c.tvl}, and ${c.trend}.`,
    (c) => `Once a week, compare the price impact of a $${c.small} swap on ${c.n} with the same swap on a rival DEX and log which route was cheaper, so you can justify staying or moving your liquidity. A gap above 0.3% is worth a note.`,
  ],
  yield: [
    (c) => `Every Friday, record ${c.n}'s current APY, your accrued rewards and the price of the receipt token against ${c.asset}, then flag any week where the APY drops by more than 25% relative to your entry. ${c.trend}.`,
    (c) => `Once a week, check whether ${c.n}'s total deposits have risen or fallen by more than 15% from ${c.tvl} and whether the strategy or validator set has changed, because a shrinking base often precedes a yield cut.`,
  ],
  deriv: [
    (c) => `Every three days, check your funding rate, open interest and liquidation price on ${c.n}, and log any funding flip from positive to negative, because that flip shows which side of the market is paying to stay open. ${c.trend}.`,
    (c) => `Once a week, review the implied volatility of your ${c.n} position and the time left to expiry, then decide whether to roll it or let it expire based on remaining time value, not on price alone. Collateral stood at ${c.tvl} at entry.`,
  ],
  bridge: [
    (c) => `Every week, time a $${c.small} bridge transfer on ${c.n} from ${c.ch} to ${c.chB}, record the fee and the minutes to finality, and flag any week where the fee rises by more than 50%. ${c.trend}.`,
    (c) => `Once a week, check ${c.n}'s total bridged volume and number of destination chains, then note whether your route is still among the top three by volume or has fallen out of use. Locked value began at ${c.tvl}.`,
  ],
  market: [
    (c) => `Every Sunday, check the open interest and price movement on your ${c.n} market, then record whether your position is in profit or loss and whether volume has doubled or halved since entry. ${c.trend}.`,
    (c) => `Once a week, log your ${c.n} sessions, the items you earned and the floor price of your main in-app asset, then flag any week where the active user count drops by more than 20%. Platform TVL began at ${c.tvl}.`,
  ],
};

const RECORD: Array<(c: Ctx) => string> = [
  (c) => `Create one spreadsheet row per protocol with columns for Date, Protocol, Chain, Action, Amount In, Amount Out, Gas Fee, Tx Hash, TVL at Entry (${c.tvl} for ${c.n}), Current TVL, Entry APY, Current APY and Notes, and fill it within 10 minutes of every transaction on ${c.ch}.`,
  (c) => `Keep a dated notes file for ${c.n} and, after each weekly check, add one line with the date, the metric you checked, the value you saw and one sentence on what changed since last week. Over ${c.hold} days that is about ${Math.max(2, r(c.hold / 7))} entries to review.`,
  (c) => `Save every ${c.n} transaction hash in a "Proof" column next to the action it belongs to and paste the ${c.ch} block explorer link beside it, so you can prove the position existed without re-opening the wallet. The $${c.cap} budget is the whole exposure.`,
  (c) => `Log your entry and exit triggers in the same row as the position: write "Exit if TVL < 60% of ${c.tvl}" (that is ${c.tvl60}) and "Exit on day 90 if no announcement", then add the actual exit date and reason when you close ${c.n}.`,
  (c) => `Track your $${c.cap} budget for ${c.n} as three lines: $${r(c.cap * 0.45)} for the main action, $${r(c.cap * 0.35)} for the second action and $${c.cap - r(c.cap * 0.45) - r(c.cap * 0.35)} held back for gas and fees. Update the remaining balance after each spend.`,
  (c) => `Screenshot your balance and position page on ${c.n} once a week, name the file YYYY-MM-DD_${c.n.toLowerCase().replace(/[^a-z0-9]+/g, '-')}_position.png and keep it in a folder named after the protocol, so the visual record matches the spreadsheet over the ${c.hold}-day hold.`,
  (c) => `Record gas separately from the action: log the gas token, the gas amount, its USD value at the time and the chain (${c.ch}). Expect about $${c.gas} per transaction here, so you can later work out your true net return on the $${c.cap} after fees.`,
  (c) => `At the end of each month, add a summary row that totals your ${c.n} deposits, withdrawals, fees paid, rewards earned and current position value, then write one line on whether the farm is still worth $${c.cap} of locked capital, given that ${c.trend}.`,
];

const EXIT: Record<Archetype, Array<(c: Ctx) => string>> = {
  lending: [
    (c) => `Close the position and repay the loan if your health factor falls below 1.3 for two consecutive checks, or if ${c.n}'s TVL drops below 60% of its entry value, which is under ${c.tvl60}. Repay before withdrawing, in that order, on ${c.ch}.`,
    (c) => `Unwind the position on day 90 if ${c.n} has still not announced a token, snapshot or points program, and do not re-enter on the same wallet until a new public milestone appears. Keep the closed history untouched for a future snapshot.`,
  ],
  dex: [
    (c) => `Withdraw your liquidity if the pool's TVL falls below 60% of its value at entry (${c.tvl60} for the protocol as a whole) or if the fee APR stays below 3% for three consecutive weeks. Pull the full $${c.slice} and note the fees earned.`,
    (c) => `Stop routing swaps through ${c.n} after 90 days without a token announcement and move your volume to the next DEX on your watchlist, keeping the old ${c.ch} wallet history untouched for a future snapshot.`,
  ],
  yield: [
    (c) => `Unstake and exit if the receipt token depegs by more than 2% from ${c.asset} for 48 hours, or if ${c.n}'s TVL falls below 60% of its entry value, i.e. under ${c.tvl60}. Harvest accrued rewards first, then withdraw principal.`,
    (c) => `Close the position on day 90 with no token or points announcement, harvest the accrued yield first, and redeploy the principal of about $${c.slice} to the next yield protocol on your list. Keep the ${c.ch} wallet history intact.`,
  ],
  deriv: [
    (c) => `Close the position immediately if your unrealised loss reaches 25% of margin (about $${r(c.half * 0.25)}), or if ${c.n}'s open interest collapses by more than 40% in a single week. Do not average down on ${c.ch}.`,
    (c) => `Exit on day 90 if ${c.n} has not published a token, fee-sharing or points update, and do not open a new leveraged position on the same market until a fresh catalyst appears. Close all legs in one session.`,
  ],
  bridge: [
    (c) => `Stop bridging through ${c.n} if its TVL drops below 60% of your entry level (${c.tvl60}) for two consecutive weeks, or if a transfer takes more than 30 minutes twice in a row. Route the remaining funds back via the canonical path.`,
    (c) => `Abandon the route on day 90 with no token announcement and consolidate your funds back to ${c.ch}, keeping the final bridge transaction hash for any retroactive claim. The final transfer is about $${c.cap}.`,
  ],
  market: [
    (c) => `Cash out if your position loses more than 25% of its entry value, or if ${c.n}'s daily active users fall below 60% of the level you saw on entry. With a $${c.small} position that caps the loss at about $${r(c.small * 0.25)}.`,
    (c) => `Stop using ${c.n} on day 90 if there is still no token, season or rewards announcement, sell the in-app items you no longer need, and move the recovered capital of up to $${c.cap} to the next platform on your list.`,
  ],
};

// First concrete action: the leading verb follows the archetype (supply, swap, deposit, trade, bridge, place).
const FIRST: Record<Archetype, (c: Ctx) => string> = {
  lending: (c) => `Supply $${c.slice} on ${c.n}, then borrow a small amount against it, so the wallet shows one supply and one borrow action.`,
  dex: (c) => `Swap $${c.slice} on ${c.n} across a stable pair and add the proceeds as a stable LP position, so the wallet shows both a swap and a liquidity action.`,
  yield: (c) => `Deposit $${c.slice} into one ${c.n} vault and keep the receipt token, so the wallet shows a funded position, not only approvals.`,
  deriv: (c) => `Trade a low-leverage position on ${c.n} with $${c.slice} of margin and close it inside the same week, so the wallet shows a full open-and-close cycle.`,
  bridge: (c) => `Bridge $${c.slice} through ${c.n} and back again as a round trip, so the wallet shows transfers in both directions.`,
  market: (c) => `Place one small position, or buy one in-app item, on ${c.n} with $${c.slice} so the wallet shows real use of the product.`,
};
const FIRST_TAIL = ' Check the quote before signing, keep slippage under 0.5%, and confirm the contract address against the official docs, not a search ad. Write down the transaction hash and the balance before and after.';
const REPEAT_VERB: Record<Archetype, string> = { lending: 'loan actions', dex: 'swaps', yield: 'vault actions', deriv: 'trades', bridge: 'bridge transfers', market: 'market actions' };

// Active minutes per step by archetype: [opening, first action, second action, minutes per repeat round, monitoring check].
const MINS: Record<Archetype, [number, number, number, number, number]> = {
  lending: [20, 15, 15, 8, 10], dex: [15, 10, 10, 5, 10], yield: [15, 10, 10, 5, 8],
  deriv: [20, 15, 15, 8, 12], bridge: [25, 15, 15, 10, 10], market: [15, 10, 10, 5, 8],
};

export function farmSteps(p: Protocol, f: Factors, implied: number): FarmStep[] {
  const arch = archetypeOf(p.category);
  const chain = p.chains[0] ?? 'its main chain';
  const cap = capitalFor(p.tvl_usd), hold = holdDaysFor(f.age_used);
  const gas = chain === 'Ethereum' ? 12 : 2;
  const slice = r(cap * 0.4), reserve = cap - slice, slice2 = reserve - r(reserve / 2), roundCap = Math.max(5, r(cap * 0.1));
  const trendTxt = p.change_7d === null ? 'no 7-day TVL reading' : `TVL ${p.change_7d >= 0 ? '+' : ''}${p.change_7d.toFixed(1)}% over 7 days`;
  const c: Ctx = {
    n: p.name, ch: chain, chB: p.chains[1] ?? 'a second chain you already use', tvl: fmtM(p.tvl_usd), tvl60: fmtM(p.tvl_usd * 0.6),
    cap, slice, half: r(slice / 2), small: Math.max(5, r(cap * 0.05)), big: r(cap * 0.15), gas, hold,
    asset: arch === 'yield' && /stak|chain/i.test(p.category ?? '') ? `${chain}'s native token` : 'stablecoins',
    trend: p.change_7d === null ? 'there is no 7-day TVL reading' : `TVL moved ${p.change_7d >= 0 ? '+' : ''}${p.change_7d.toFixed(1)}% over 7 days`,
  };
  const [mOpen, mFirst, mSecond, mRound, mMon] = MINS[arch];
  const ageTxt = f.age_days === null ? 'unknown listing age' : `${f.age_days} days tracked`;
  const step = (body: string, capUsd: number, fee: number, mins: number, additive = false): FarmStep =>
    ({ text: `${body} ${costLine(capUsd, cents(fee), mins)}`, cap: capUsd, additive, fee: cents(fee), mins });
  const [openText, openCap, openAdd] = pick(OPENING[arch], p.slug, 'open')(c);
  return [
    step(`Scope ${p.name} (${p.category ?? 'uncategorised'}): ${fmtM(p.tvl_usd)} TVL on ${chain}, ${trendTxt}, ${ageTxt}. Model value ${fmtM(implied)}. Read the docs, the audit page and the last 20 transactions, and confirm the app is live and that no token exists yet before spending anything.`, 0, 0, 20),
    step(`Fund a fresh ${chain} wallet with $${cap} of stable capital plus about $${gas} of native gas for ${p.name}. Keep it separate from main funds so the activity stays attributable and a bad approval cannot reach other assets. The principal is recoverable.`, cap + gas, 0, 15),
    step(openText, openCap, cents(gas * 0.5), mOpen, openAdd === true),
    step(`${FIRST[arch](c)}${FIRST_TAIL}`, slice, cents(gas * 0.4), mFirst),
    step(`Add a second, different action on ${p.name} using $${slice2}, such as a withdrawal and re-entry, so the wallet shows more than one type of activity, not only ${REPEAT_VERB[arch]}. Keep about $${r(reserve / 2)} unspent as a gas reserve for roughly ${r(reserve / 2 / gas)} further transactions on ${chain}, and log the date.`, slice2, cents(gas * 0.5), mSecond),
    step(`Repeat ${REPEAT_VERB[arch]} on ${p.name} weekly: 3 rounds of $${roundCap} or less, spaced 7 days apart and ${mRound} min each, to build a steady record rather than one burst. Skip a round if gas on ${chain} exceeds $${gas * 2}, and use a different weekday each time so timestamps do not cluster.`, roundCap, cents(gas * 1.2), mRound * 3),
    step(pick(MONITOR[arch], p.slug, 'mon')(c), 0, cents(gas * 0.3), mMon),
    step(`Keep the position open for ${hold} days (the hold for ${f.age_days === null ? 'an unknown-age' : `${f.age_days}-day-old`} protocols). Check at day ${Math.max(7, r(hold / 2))} and exit if TVL drops below ${fmtM(p.tvl_usd * 0.6)}. Do not top up during the hold, since extra deposits blur the entry record. The $${cap} stays locked, so the opportunity cost is the real expense; active time is one 5-minute check.`, 0, 0, 5),
    step(pick(RECORD, p.slug, 'rec')(c), 0, 0, 10),
    step(pick(EXIT[arch], p.slug, 'exit')(c), 0, 0, 5),
    step(`Wrap up ${p.name}: withdraw everything, record the cost basis (about $${r(gas * 3)} gas across the whole plan) and screenshot the wallet's history. Watch the protocol's announcements for a points programme or claim page, and revoke the approvals you granted.`, 0, gas, 15),
  ];
}
export const farmPlan = (p: Protocol, f: Factors, implied: number): string[] => farmSteps(p, f, implied).map((s) => s.text);
