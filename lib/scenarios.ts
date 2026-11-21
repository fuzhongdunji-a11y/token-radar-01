// lib/scenarios.ts
// Pure functions to compute budget scenario ranges from an Econ.
// Only type imports from lib/model.ts to avoid value imports and circular dependencies.

import type { Econ } from './model.ts';

/**
 * Three-value range for low/mid/high scenarios.
 */
export interface Range3 {
  low: number;
  mid: number;
  high: number;
}

/**
 * Step-wise ranges for each Econ step.
 */
export interface StepRange {
  n: number;
  cap_usd: Range3;
  fee_usd: Range3;
  mins: Range3;
}

/**
 * Totals for a single scenario.
 */
export interface ScenarioTotal {
  id: 'low' | 'mid' | 'high';
  cap_mult: number;
  fee_mult: number;
  mins_mult: number;
  peak_cap_usd: number;
  total_fee_usd: number;
  total_mins: number;
}

/**
 * Combined result of scenario ranges and totals.
 */
export interface PlanScenarios {
  steps: StepRange[];
  scenarios: ScenarioTotal[];
}

/**
 * Scenario multipliers in the order low, mid, high.
 */
export const SCENARIO_DEFS = [
  { id: 'low', cap_mult: 0.5, fee_mult: 0.7, mins_mult: 0.8 },
  { id: 'mid', cap_mult: 1, fee_mult: 1, mins_mult: 1 },
  { id: 'high', cap_mult: 2, fee_mult: 1.6, mins_mult: 1.3 },
] as const;

/**
 * Rounds a dollar amount to the nearest integer.
 */
const roundCap = (x: number, m: number): number => (m === 1 ? x : Math.round(x * m));
/**
 * Rounds a fee amount to cents (identity multiplier returns the econ value untouched).
 */
const roundFee = (x: number, m: number = 1): number => (m === 1 ? x : Math.round(x * m * 100) / 100);
/**
 * Scales minutes: identity for mid (exactly the econ value), otherwise integer
 * rounding with a minimum of 1 for originally non-zero minutes.
 */
const roundMins = (orig: number, m: number): number => {
  if (m === 1) return orig;
  const v = Math.round(orig * m);
  return orig > 0 && v === 0 ? 1 : v;
};

/**
 * Computes the peak capital using the same rules as lib/model.ts buildEcon.
 */
const computePeak = (caps: number[], additive: boolean[]): number => {
  let peak = 0;
  for (let i = 0; i < caps.length; i++) {
    const cap = caps[i];
    if (cap === 0) {
      /* peak unchanged */
    } else if (additive[i]) {
      peak += cap;
    } else if (cap <= peak && peak > 0) {
      /* reused – peak unchanged */
    } else {
      peak = cap;
    }
  }
  return Math.round(peak);
};

/**
 * Computes scenario ranges and totals from an Econ.
 */
export const scenariosFor = (econ: Econ): PlanScenarios => {
  const steps = econ.steps;
  const n = steps.length;

  // Containers for per‑scenario values.
  const capsLow: number[] = [], capsMid: number[] = [], capsHigh: number[] = [];
  const feesLow: number[] = [], feesMid: number[] = [], feesHigh: number[] = [];
  const minsLow: number[] = [], minsMid: number[] = [], minsHigh: number[] = [];

  const stepRanges: StepRange[] = [];

  for (let i = 0; i < n; i++) {
    const step = steps[i];

    const capLow = roundCap(step.cap_usd, SCENARIO_DEFS[0].cap_mult);
    const capMid = step.cap_usd;
    const capHigh = roundCap(step.cap_usd, SCENARIO_DEFS[2].cap_mult);

    const feeLow = roundFee(step.fee_usd, SCENARIO_DEFS[0].fee_mult);
    const feeMid = step.fee_usd;
    const feeHigh = roundFee(step.fee_usd, SCENARIO_DEFS[2].fee_mult);

    const minsLowVal = roundMins(step.mins, SCENARIO_DEFS[0].mins_mult);
    const minsMidVal = step.mins;
    const minsHighVal = roundMins(step.mins, SCENARIO_DEFS[2].mins_mult);

    // Peak is computed from exact scaled caps (as buildEcon does), rounded only at the end.
    capsLow.push(step.cap_usd * SCENARIO_DEFS[0].cap_mult);
    capsMid.push(step.cap_usd);
    capsHigh.push(step.cap_usd * SCENARIO_DEFS[2].cap_mult);

    feesLow.push(feeLow);
    feesMid.push(feeMid);
    feesHigh.push(feeHigh);

    minsLow.push(minsLowVal);
    minsMid.push(minsMidVal);
    minsHigh.push(minsHighVal);

    stepRanges.push({
      n: step.n,
      cap_usd: { low: capLow, mid: capMid, high: capHigh },
      fee_usd: { low: feeLow, mid: feeMid, high: feeHigh },
      mins: { low: minsLowVal, mid: minsMidVal, high: minsHighVal },
    });
  }

  // Totals per scenario.
  const scenarios: ScenarioTotal[] = SCENARIO_DEFS.map((def, idx) => {
    const caps = [capsLow, capsMid, capsHigh][idx];
    const fees = [feesLow, feesMid, feesHigh][idx];
    const mins = [minsLow, minsMid, minsHigh][idx];
    const additive = steps.map((s) => s.additive);
    const peak_cap_usd = computePeak(caps, additive);
    const total_fee_usd = Math.round(fees.reduce((a, v) => a + v, 0) * 100) / 100;
    const total_mins = mins.reduce((a, v) => a + v, 0);
    return {
      id: def.id as 'low' | 'mid' | 'high',
      cap_mult: def.cap_mult,
      fee_mult: def.fee_mult,
      mins_mult: def.mins_mult,
      peak_cap_usd,
      total_fee_usd,
      total_mins,
    };
  });

  return { steps: stepRanges, scenarios };
};
