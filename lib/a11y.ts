export interface CssSwap {
  area: string;
  file: string;
  from: string;
  to: string;
}

export const CSS_SWAPS: CssSwap[] = [
  {
    area: 'contrast',
    file: 'dashboard/app.css',
    from: '--mute:#9099a8',
    to: '--mute:#a8b0bf',
  },
  {
    area: 'contrast',
    file: 'dashboard/app.css',
    from: '--dim:#7d8697',
    to: '--dim:#9aa3b2',
  },
  {
    area: 'tap',
    file: 'dashboard/app.css',
    from: 'padding:7px 14px',
    to: 'padding:9px 14px',
  },
  {
    area: 'tap',
    file: 'dashboard/app.css',
    from: '.seg button{background:var(--panel);border:0;padding:7px 12px',
    to: '.seg button{background:var(--panel);border:0;padding:9px 12px',
  },
  {
    area: 'tap',
    file: 'dashboard/app.css',
    from: '#e8eef7;border-radius:6px;height:24px',
    to: '#e8eef7;border-radius:6px;height:32px',
  },
  {
    area: 'tap',
    file: 'dashboard/app.css',
    from: 'radius:8px;padding:6px 12px',
    to: 'radius:8px;padding:9px 12px',
  },
  {
    area: 'focus',
    file: 'dashboard/app.css',
    from: '{outline:2px solid var(--blue);outline-offset:2px}',
    to: '{outline:3px solid var(--blue);outline-offset:2px}',
  },
];

export const MOBILE_RULE = `@media(max-width:480px){.scen,.sum{grid-template-columns:1fr 1fr}.bar{flex-wrap:wrap;height:auto}.whyrow{grid-template-columns:1fr}}`;