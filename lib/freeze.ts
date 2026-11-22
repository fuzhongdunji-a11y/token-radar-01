export interface FreezeCheck {
  id: string;
  label: string;
}

export const FREEZE_CHECKS: FreezeCheck[] = [
  {
    id: 'board-identity',
    label: 'Board rows, ranks, and implied values match previous version',
  },
  {
    id: 'farm-steps-gate',
    label: 'Farm steps stay within allowed count and description limits',
  },
  {
    id: 'dashboard-size',
    label: 'Dashboard source stays within the dossier limit',
  },
  {
    id: 'determinism',
    label: 'Two consecutive builds produce byte-identical outputs',
  },
  {
    id: 'screenshots',
    label: 'Three screenshots stay within the size and dimension limits',
  },
  {
    id: 'official-check',
    label: 'Official kit check passes with no failures',
  },
  {
    id: 'model-unchanged',
    label: 'The radar-2 valuation formula remains unchanged',
  },
  {
    id: 'local-gate',
    label: 'Local gate checker passes for every item',
  },
];

export const FREEZE_NOTE: string =
  'Token-radar v18 freezes the cumulative work: farm_steps basis wording (v15), first-look and label polish (v16), and the mobile and accessibility finish (v17).';
