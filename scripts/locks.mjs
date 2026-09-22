#!/usr/bin/env node
/**
 * Advisory file locks for concurrent agents working in the SAME checkout.
 *
 * Locks live in `.locks/<hash>.lock.json` — local, gitignored, ephemeral.
 * They are advisory: the tool can't stop another process from writing, but
 * every agent that follows AGENTS.md claims files before editing and never
 * touches a file another agent holds.
 *
 * Usage:
 *   node scripts/locks.mjs claim <files...> [--agent=<name>] [--task="..."] [--force]
 *   node scripts/locks.mjs release <files...> | --all [--agent=<name>]
 *   node scripts/locks.mjs check <files...>
 *   node scripts/locks.mjs list
 *
 * Agents identify via --agent or AGENT_NAME (default: $USER).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = process.cwd();
const dir = resolve(root, '.locks');
const STALE_MS = 24 * 3600e3;

const keyOf = rel => createHash('sha1').update(rel).digest('hex').slice(0, 12);
const lockPath = rel => resolve(dir, `${keyOf(rel)}.lock.json`);
const relOf = p => relative(root, resolve(root, p)).replaceAll('\\', '/');
const flag = (name, fallback = '') => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const agent = () => flag('agent', process.env.AGENT_NAME || process.env.USER || 'unknown');

function load(rel) {
  const file = lockPath(rel);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); }
  catch { return null; }
}
const stale = l => !l?.since || Date.now() - Date.parse(l.since) > STALE_MS;

function claim(files, { force = false, task = '' } = {}) {
  if (!files.length) { console.error('claim: no files given'); process.exit(1); }
  const held = files.map(relOf).map(rel => ({ rel, cur: load(rel) }))
    .filter(({ rel, cur }) => cur && cur.agent !== agent() && !stale(cur) && !force);
  if (held.length) {
    for (const { rel, cur } of held) console.log(`LOCKED ${rel} — held by ${cur.agent} since ${cur.since}${cur.task ? ` (${cur.task})` : ''}`);
    console.log('Do not edit those files. Coordinate, pick other files, or re-run with --force to steal.');
    process.exit(1);
  }
  mkdirSync(dir, { recursive: true });
  for (const file of files) {
    const rel = relOf(file);
    writeFileSync(lockPath(rel), JSON.stringify({ path: rel, agent: agent(), task, since: new Date().toISOString() }, null, 2));
    console.log(`claimed ${rel}`);
  }
}

function release(files, all) {
  if (!existsSync(dir)) return;
  if (all) {
    for (const name of readdirSync(dir).filter(n => n.endsWith('.lock.json'))) {
      const l = load(JSON.parse(readFileSync(resolve(dir, name), 'utf8')).path);
      if (l?.agent === agent()) { rmSync(resolve(dir, name)); console.log(`released ${l.path}`); }
    }
    return;
  }
  for (const file of files) {
    const rel = relOf(file), cur = load(rel);
    if (!cur) continue;
    if (cur.agent !== agent()) { console.log(`skip ${rel} — held by ${cur.agent}`); continue; }
    rmSync(lockPath(rel));
    console.log(`released ${rel}`);
  }
}

function check(files) {
  for (const file of files) {
    const rel = relOf(file), cur = load(rel);
    console.log(cur && !stale(cur) ? `LOCKED ${rel} (${cur.agent}${cur.task ? `, ${cur.task}` : ''})` : `free   ${rel}`);
  }
}

function list() {
  if (!existsSync(dir)) { console.log('no locks'); return; }
  const rows = readdirSync(dir).filter(n => n.endsWith('.lock.json'))
    .map(n => { try { return JSON.parse(readFileSync(resolve(dir, n), 'utf8')); } catch { return null; } })
    .filter(Boolean);
  if (!rows.length) { console.log('no locks'); return; }
  for (const l of rows) console.log(`${stale(l) ? 'STALE ' : ''}${l.path}\t${l.agent}\t${l.since}${l.task ? `\t${l.task}` : ''}`);
}

const [cmd, ...rest] = process.argv.slice(2);
const files = rest.filter(a => !a.startsWith('--'));
if (cmd === 'claim') claim(files, { force: process.argv.includes('--force'), task: flag('task') });
else if (cmd === 'release') release(files, process.argv.includes('--all'));
else if (cmd === 'check') check(files);
else if (cmd === 'list') list();
else {
  console.log('usage: locks.mjs claim <files...> [--agent=n] [--task="..."] [--force]\n       locks.mjs release <files...>|--all [--agent=n]\n       locks.mjs check <files...>\n       locks.mjs list');
  process.exit(cmd ? 1 : 0);
}
