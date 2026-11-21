export interface FilterState {
  cat: string;
  chain: string;
  tier: string;
  q: string;
  cap: number;
  mins: number;
  sig: string;
}

export const DEFAULT_STATE: FilterState = {
  cat: '',
  chain: '',
  tier: '',
  q: '',
  cap: 0,
  mins: 0,
  sig: 'all',
};

export const CAP_VALUES: number[] = [0, 100, 150, 300];
export const MINS_VALUES: number[] = [0, 130, 160];
export const SIG_VALUES: string[] = ['all', 'rise'];
export const TIER_VALUES: string[] = ['', 'watch', 'early'];

export interface Preset {
  id: string;
  label: string;
  hint: string;
  state: FilterState;
}

export const PRESETS: Preset[] = [
  {
    id: 'all',
    label: 'All targets',
    hint: 'Every pre-token protocol, no filters',
    state: { ...DEFAULT_STATE },
  },
  {
    id: 'watch',
    label: 'Watchlist',
    hint: 'The 40 watchlist protocols only',
    state: { ...DEFAULT_STATE, tier: 'watch' },
  },
  {
    id: 'rising-cheap',
    label: 'Rising · ≤$150',
    hint: '7d TVL rising and peak capital up to $150',
    state: { ...DEFAULT_STATE, sig: 'rise', cap: 150 },
  },
  {
    id: 'quick',
    label: 'Quick · ≤130m',
    hint: 'Total farm time up to 130 minutes and peak capital up to $100',
    state: { ...DEFAULT_STATE, mins: 130, cap: 100 },
  },
];

export function encodeState(s: FilterState): string {
  const parts: string[] = [];
  const keys: (keyof FilterState)[] = ['cat', 'chain', 'tier', 'q', 'cap', 'mins', 'sig'];
  for (const key of keys) {
    const value = s[key];
    const defaultValue = DEFAULT_STATE[key];
    if (value !== defaultValue) {
      const encoded = typeof value === 'number'
        ? value.toString()
        : encodeURIComponent(value);
      parts.push(`${key}=${encoded}`);
    }
  }
  return parts.join('&');
}

export function decodeState(text: string, cats: string[], chains: string[]): FilterState {
  const result: FilterState = { ...DEFAULT_STATE };
  const trimmed = text.startsWith('?') ? text.slice(1) : text;
  if (!trimmed) {
    return result;
  }
  const pairs = trimmed.split('&');
  const setKeys = new Set<string>();
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    let key: string;
    let val: string;
    try {
      key = decodeURIComponent(pair.slice(0, idx));
      val = decodeURIComponent(pair.slice(idx + 1));
    } catch {
      continue;
    }
    if (setKeys.has(key)) continue;
    if (key === 'cat' && cats.includes(val)) {
      result.cat = val;
      setKeys.add(key);
    } else if (key === 'chain' && chains.includes(val)) {
      result.chain = val;
      setKeys.add(key);
    } else if (key === 'tier' && TIER_VALUES.includes(val)) {
      result.tier = val;
      setKeys.add(key);
    } else if (key === 'sig' && SIG_VALUES.includes(val)) {
      result.sig = val;
      setKeys.add(key);
    } else if (key === 'cap') {
      const num = Number(val);
      if (!Number.isNaN(num) && CAP_VALUES.includes(num)) {
        result.cap = num;
        setKeys.add(key);
      }
    } else if (key === 'mins') {
      const num = Number(val);
      if (!Number.isNaN(num) && MINS_VALUES.includes(num)) {
        result.mins = num;
        setKeys.add(key);
      }
    } else if (key === 'q') {
      const trimmedQ = val.trim().slice(0, 64);
      result.q = trimmedQ;
      setKeys.add(key);
    }
  }
  return result;
}

export function presetById(id: string): Preset | null {
  for (const p of PRESETS) {
    if (p.id === id) return p;
  }
  return null;
}

export function matchPreset(s: FilterState): string {
  for (const p of PRESETS) {
    const st = p.state;
    if (
      st.cat === s.cat &&
      st.chain === s.chain &&
      st.tier === s.tier &&
      st.q === s.q &&
      st.cap === s.cap &&
      st.mins === s.mins &&
      st.sig === s.sig
    ) {
      return p.id;
    }
  }
  return '';
}
