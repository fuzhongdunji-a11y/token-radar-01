export interface ShotState {
  file: string;
  route: string;
  mustShow: string[];
}

export const SHOT_STATES: ShotState[] = [
  {
    file: '01-cover.png',
    route: '#board',
    mustShow: ['stats strip', 'full unfiltered board', 'top-ranked rows'],
  },
  {
    file: '02-detail.png',
    route: '#p/<rank-1 slug>',
    mustShow: ['detail header', 'implied value', 'valuation breakdown'],
  },
  {
    file: '03-filtered.png',
    route: '#board?cap=150&sig=rise',
    mustShow: ['Rising preset active', 'filtered rows', 'preset row'],
  },
];

export interface LabelSwap {
  file: string;
  from: string;
  to: string;
}

export const LABEL_SWAPS: LabelSwap[] = [
  {
    file: 'dashboard/index.html',
    from: 'Token Radar · pre-token launch board',
    to: 'Token Radar · pre-token board',
  },
  {
    file: 'dashboard/app.js',
    from: 'Click a row for the evidence, execution ledger and farm plan.',
    to: 'Click a row for evidence, ledger and farm plan.',
  },
];
