// token-radar-01: reads the sealed snapshot, runs the radar-2 model (lib/model.ts), writes board.json,
// data.js, dashboard/, screenshots/ and, last, dossier.json. Node 22 standard library only, no clock, no randomness.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../kit/token-radar-01-kit/input/snapshot.json
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const shotsDir = arg('screenshots', join(here, 'screenshots'));

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the board fails the gate: ${issue}\n`);
  process.exit(1);
}

// Invariants: display layers (drivers, econ, facets, farm prose) must not move the model. lib/reference-order.json pins, for the
// reference snapshot (by sha256), the ordered (slug, implied) pairs and the board with farm_steps removed, both from the pre-v5 build.
const sha = (x: string | Buffer) => createHash('sha256').update(x).digest('hex');
const order = JSON.stringify(board.map((r) => [r.slug, r.implied_value_usd]));
const sansSteps = JSON.stringify(board.map(({ farm_steps: _s, ...r }) => r));
const refFile = join(here, 'lib', 'reference-order.json');
if (existsSync(refFile)) {
  const ref = JSON.parse(readFileSync(refFile, 'utf8')) as { snapshot_sha256: string; board_sans_steps_sha256: string; order: Array<[string, number]> };
  if (ref.snapshot_sha256 === sha(readFileSync(inputFile))) {
    if (JSON.stringify(ref.order) !== order) { process.stderr.write('token radar: (id, implied_fdv) order differs from the reference\n'); process.exit(1); }
    if (ref.board_sans_steps_sha256 !== sha(sansSteps)) { process.stderr.write('token radar: board.json differs from the reference outside farm_steps\n'); process.exit(1); }
  }
}
// data.js rows carry extra display fields only: strip them and the rows must equal board.json exactly.
const stripped = radar.rows.map(({ cat: _c, pc: _p, drivers: _d, tvl_7d_pct: _t, econ: _e, ...r }) => r);
if (JSON.stringify(stripped) !== JSON.stringify(board)) throw new Error('data.js rows diverge from board.json');
if (radar.live.some((l) => 'implied_value_usd' in l || 'rank' in l || 'farm_steps' in l || 'econ' in l)) throw new Error('live rows carry pre-token fields');

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.') || !statSync(join(from, name)).isFile()) continue;
    copyFileSync(join(from, name), join(to, name));
    names.push(name);
  }
  return names;
}
const dashNames = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const dashBytes = dashNames.reduce((a, n) => a + statSync(join(out, 'dashboard', n)).size, 0);
if (dashBytes >= TEXT_MAX_BYTES) throw new Error(`dashboard/ is ${dashBytes} bytes, limit ${TEXT_MAX_BYTES}`);
process.stdout.write(`token radar: dashboard/ ${dashBytes} bytes, headroom ${TEXT_MAX_BYTES - dashBytes}\n`);
const shots = copyFiles(shotsDir, join(out, 'screenshots'));
if (shots.length !== 3) {
  process.stderr.write(`token radar: ${shotsDir} holds ${shots.length} image(s); exactly 3 are required, so no dossier was written\n`);
  process.exit(1);
}

// The dossier is written last: the scorer rebuilds it from /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES }));
process.stdout.write(`token radar: ${board.length} rows (${radar.watchlist_size} watchlist + ${radar.extra_size} extra), ${radar.live_size} live-token protocols set aside, wrote ${out}\n`);
