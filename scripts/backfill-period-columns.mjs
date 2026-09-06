#!/usr/bin/env node
// Migrates legacy `__period__:ENDDATE` / `__period__:open` notes markers into the
// period_start / period_end / period_notes columns added to the Sheet backend.
//
// Requires google-apps-script-v2.gs to already be redeployed with the new columns
// (see repo memory / commit message for details) before this can succeed.
//
// Usage:
//   node scripts/backfill-period-columns.mjs            # dry run, no writes
//   node scripts/backfill-period-columns.mjs --apply     # actually writes to the Sheet

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERIOD_NOTES_PREFIX = '__period__:';

function loadEnv(envPath) {
  const env = {};
  let raw;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch {
    return env;
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function parsePeriodNotes(notes) {
  const trimmed = String(notes ?? '').trim();
  if (!trimmed.startsWith(PERIOD_NOTES_PREFIX)) {
    return null;
  }
  const rest = trimmed.slice(PERIOD_NOTES_PREFIX.length);
  if (rest === 'open' || rest === '') {
    return { endDate: null };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(rest)) {
    return { endDate: rest };
  }
  return null;
}

async function fetchAllEntries(apiUrl, token) {
  const url = new URL(apiUrl);
  url.searchParams.set('action', 'fetch');
  if (token) url.searchParams.set('token', token);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`fetch failed: HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (!payload.success) {
    throw new Error(`fetch failed: ${payload.message ?? payload.errorCode}`);
  }
  return payload.data;
}

async function saveEntry(apiUrl, token, entry) {
  const url = new URL(apiUrl);
  url.searchParams.set('action', 'save');
  if (token) url.searchParams.set('token', token);
  url.searchParams.set('date', entry.date);
  url.searchParams.set('krvaceni', entry.krvaceni ?? '0');
  url.searchParams.set('nalady', entry.nalady ?? '');
  url.searchParams.set('tlak', entry.tlak ?? '');
  url.searchParams.set('nadymani', entry.nadymani ?? '');
  url.searchParams.set('energie', entry.energie ?? '');
  url.searchParams.set('notes', entry.notes ?? '');
  url.searchParams.set('periodStart', entry.periodStart ?? '');
  url.searchParams.set('periodEnd', entry.periodEnd ?? '');
  url.searchParams.set('periodNotes', entry.periodNotes ?? '');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`save failed for ${entry.date}: HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (!payload.success) {
    throw new Error(`save failed for ${entry.date}: ${payload.message ?? payload.errorCode}`);
  }
  return payload.data;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const env = loadEnv(path.join(__dirname, '..', '.env'));
  const apiUrl = env.VITE_API_URL_PRIMARY;
  const token = env.VITE_API_TOKEN;

  if (!apiUrl) {
    console.error('VITE_API_URL_PRIMARY not found in .env — aborting.');
    process.exitCode = 1;
    return;
  }

  console.log(`Mode: ${apply ? 'APPLY (will write to the live Sheet)' : 'DRY RUN (no writes)'}`);
  console.log('Fetching entries...');
  const entries = await fetchAllEntries(apiUrl, token);
  console.log(`Fetched ${entries.length} entries.`);

  const candidates = entries.filter((entry) => !entry.periodStart && parsePeriodNotes(entry.notes) !== null);
  console.log(`Found ${candidates.length} legacy __period__: marker row(s) to migrate.`);

  if (candidates.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  let migrated = 0;
  let failed = 0;

  for (const entry of candidates) {
    const parsed = parsePeriodNotes(entry.notes);
    const nextEntry = {
      ...entry,
      notes: '',
      periodStart: entry.date,
      periodEnd: parsed.endDate ?? '',
      periodNotes: ''
    };

    console.log(
      `${apply ? 'Writing' : 'Would write'}: ${entry.date} -> periodStart=${nextEntry.periodStart}, ` +
        `periodEnd=${nextEntry.periodEnd || '(open)'}, notes cleared from "${entry.notes}"`
    );

    if (!apply) continue;

    try {
      await saveEntry(apiUrl, token, nextEntry);
      migrated += 1;
    } catch (error) {
      failed += 1;
      console.error(`  ERROR: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (apply) {
    console.log(`Done. Migrated ${migrated}, failed ${failed}.`);
    console.log('Verifying by re-fetching...');
    const after = await fetchAllEntries(apiUrl, token);
    const remaining = after.filter((entry) => !entry.periodStart && parsePeriodNotes(entry.notes) !== null);
    console.log(`Remaining unmigrated legacy markers: ${remaining.length}`);
  } else {
    console.log('Dry run complete. Re-run with --apply to write these changes.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
