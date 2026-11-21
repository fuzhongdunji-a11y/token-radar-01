// lib/farmdetail.ts
// Pure function that builds the one-sentence "Basis" note appended to a few farm steps.

export interface BasisCtx {
  chain: string;
  amount: number;
  cap: number;
  mins: number;
  partA: number;
  labelA: string;
  partB: number;
  labelB: string;
}

const MAX_LEN = 150;

/**
 * One sentence, starting "Basis: " and ending ".", at most 150 characters.
 * It names the chain, the indicative amount against the total budget, and the time basis.
 * - partB === 0 omits the second part.
 * - If partA + partB !== mins the sentence gives only the total, never an invented breakdown.
 * Over-long input is shortened (longest field first) so the closing "." is always kept.
 */
export function basisSentence(c: BasisCtx): string {
  const { mins, partA, partB } = c;
  const consistent = partA + partB === mins;
  const build = (chain: string, labelA: string, labelB: string): string => {
    let time = `${mins} min total`;
    if (consistent) {
      if (partB === 0) time += ` (${labelA})`;
      else time += ` (${partA} min ${labelA} + ${partB} min ${labelB})`;
    }
    return `Basis: ${chain}, $${c.amount} of the $${c.cap} budget, ${time}.`;
  };

  let chain = c.chain, la = c.labelA, lb = c.labelB;
  // Shorten the longest free-text field by the excess until the sentence fits (bounded loop).
  for (let i = 0; i < 400; i++) {
    const s = build(chain, la, lb);
    if (s.length <= MAX_LEN) return s;
    const excess = s.length - MAX_LEN;
    const longest = Math.max(chain.length, la.length, lb.length);
    if (longest === 0) break;
    const cut = (t: string) => t.slice(0, Math.max(0, t.length - excess)).trimEnd();
    if (chain.length === longest) chain = cut(chain);
    else if (la.length === longest) la = cut(la);
    else lb = cut(lb);
  }
  // Last resort: totals only, always valid and short.
  const fallback = `Basis: $${c.amount} of the $${c.cap} budget, ${mins} min total.`;
  return fallback.length <= MAX_LEN ? fallback : 'Basis: see cost line.';
}
