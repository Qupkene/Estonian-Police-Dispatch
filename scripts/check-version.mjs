#!/usr/bin/env node
/**
 * Every update that reaches the game bumps the version (CLAUDE.md, "Versioon"). Compares <head> with <base>:
 * when <head> changes anything outside the exempt paths, its package.json version must be higher than
 * <base>'s, package-lock.json must carry the same version and CHANGELOG.md must have a "## <version>" section.
 *
 *   node scripts/check-version.mjs [--base origin/main] [--head HEAD]
 *
 * Exit 0: fine, 1: the version rule is broken, 2: git could not compare the two (unknown ref).
 * Used by CI (.github/workflows/ci.yml, job "version") and the git pre-push hook (.githooks/pre-push).
 */
import { execFileSync } from 'node:child_process';

/** Paths that never reach players: changing only these needs no new version. */
const EXEMPT = [
  /^docs\//,
  /^tests\//,
  /^e2e\//,
  /^\.github\//,
  /^\.claude\//,
  /^\.githooks\//,
  /^scripts\/check-version\.mjs$/,
  /^[^/]+\.md$/,
  /^LICENSE/,
];

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const base = arg('--base', 'origin/main');
const head = arg('--head', 'HEAD');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function show(ref, file) {
  try {
    return git('show', `${ref}:${file}`);
  } catch {
    return null;
  }
}

function json(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function semver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(typeof v === 'string' ? v : '');
  return m ? m.slice(1).map(Number) : null;
}

function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

let changed;
try {
  changed = git('diff', '--name-only', `${base}...${head}`).split('\n').filter(Boolean);
} catch (err) {
  console.error(`check-version: git cannot compare ${base}...${head}: ${String(err.stderr || err.message).split('\n')[0]}`);
  process.exit(2);
}

const shipped = changed.filter((f) => !EXEMPT.some((re) => re.test(f)));
if (!shipped.length) {
  console.log(`check-version: ${changed.length} changed files, none of them reach players: no new version needed.`);
  process.exit(0);
}

const headPkg = json(show(head, 'package.json')) ?? {};
const basePkg = json(show(base, 'package.json')) ?? {};
const hv = semver(headPkg.version);
const bv = semver(basePkg.version);
const errors = [];
if (!hv) errors.push(`package.json "version" is "${headPkg.version}", not x.y.z`);
else if (bv && compare(hv, bv) <= 0) errors.push(`package.json version ${headPkg.version} is not higher than ${basePkg.version} on ${base}`);
const lock = json(show(head, 'package-lock.json'));
if (lock && (lock.version !== headPkg.version || lock.packages?.['']?.version !== headPkg.version)) {
  errors.push(`package-lock.json says ${lock.version}: run "npm version ${headPkg.version} --no-git-tag-version"`);
}
const log = show(head, 'CHANGELOG.md') ?? '';
if (hv && !new RegExp(`^## ${headPkg.version.replace(/\./g, '\\.')}(\\s|$)`, 'm').test(log)) {
  errors.push(`CHANGELOG.md has no "## ${headPkg.version}" section`);
}

if (errors.length) {
  console.error('check-version: iga mängu jõudev uuendus tõstab versiooni (CLAUDE.md, "Versioon").');
  console.error('  Väike uuendus: 2.x.Y + 1. Suurem uuendus: 2.X.0. Every update that reaches the game bumps the version.');
  console.error(`  ${shipped.length} changed files reach players, for example ${shipped.slice(0, 3).join(', ')}.`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`check-version: ${basePkg.version ?? '?'} -> ${headPkg.version} (${shipped.length} changed files reach players).`);
