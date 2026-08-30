import { APP_CONFIG } from '../config';
import type { ApiResponse, Diagnostics, Entry, NewEntry } from '../types';

function appendToken(url: URL): void {
  if (APP_CONFIG.apiToken) {
    url.searchParams.set('token', APP_CONFIG.apiToken);
  }
}

function toEntries(rows: Entry[]): Entry[] {
  return rows.map((row) => ({
    date: row.date,
    krvaceni: row.krvaceni,
    nalady: row.nalady,
    tlak: row.tlak,
    nadymani: row.nadymani,
    energie: row.energie,
    notes: row.notes
  }));
}

async function readEndpoint(
  endpoint: string,
  source: 'primary' | 'fallback'
): Promise<{ entries: Entry[]; diagnostics: Diagnostics }> {
  const url = new URL(endpoint);
  url.searchParams.set('action', 'fetch');
  appendToken(url);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ApiResponse<Entry[]>;

  if (!payload.success) {
    throw new Error(payload.message ?? payload.errorCode ?? 'Unknown API error');
  }

  const apiVersion = response.headers.get('x-api-version') ?? payload.meta.apiVersion;
  const schemaVersion = Number(payload.meta.schemaVersion);

  if (apiVersion !== payload.meta.apiVersion) {
    throw new Error('API version mismatch');
  }

  if (schemaVersion !== 1) {
    throw new Error('SCHEMA_MISMATCH');
  }

  return {
    entries: toEntries(payload.data),
    diagnostics: {
      endpoint,
      source,
      fetchedAt: payload.meta.fetchedAt,
      cacheAgeSeconds: null,
      error: null
    }
  };
}

export async function fetchEntries(): Promise<{ entries: Entry[]; diagnostics: Diagnostics }> {
  try {
    return await readEndpoint(APP_CONFIG.apiUrlPrimary, 'primary');
  } catch (error) {
    if (!APP_CONFIG.apiUrlFallback) {
      throw error;
    }

    const normalized = String(error);
    const canFallback = normalized.includes('SCHEMA_MISMATCH')
      || normalized.includes('SHEET_NOT_FOUND');

    if (!canFallback) {
      throw error;
    }

    return readEndpoint(APP_CONFIG.apiUrlFallback, 'fallback');
  }
}

export async function saveEntry(input: NewEntry): Promise<Entry> {
  const url = new URL(APP_CONFIG.apiUrlPrimary);
  url.searchParams.set('action', 'save');
  url.searchParams.set('date', input.date);
  url.searchParams.set('krvaceni', input.krvaceni ?? '0');
  url.searchParams.set('nalady', input.nalady ?? '0');
  url.searchParams.set('tlak', input.tlak ?? '0');
  url.searchParams.set('nadymani', input.nadymani ?? '0');
  url.searchParams.set('energie', input.energie ?? '0');
  url.searchParams.set('notes', input.notes ?? '');
  appendToken(url);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ApiResponse<Entry>;

  if (!payload.success) {
    throw new Error(payload.message ?? payload.errorCode ?? 'Failed to save entry');
  }

  return payload.data;
}

export async function deleteEntry(date: string): Promise<void> {
  const url = new URL(APP_CONFIG.apiUrlPrimary);
  url.searchParams.set('action', 'delete');
  url.searchParams.set('date', date);
  appendToken(url);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ApiResponse<null>;

  if (!payload.success) {
    throw new Error(payload.message ?? payload.errorCode ?? 'Failed to delete entry');
  }
}
