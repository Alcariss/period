import { describe, expect, it, vi, beforeEach } from 'vitest';

const MOCK_TOKEN = 'test-token';

vi.mock('../config', () => ({
  APP_CONFIG: {
    apiUrlPrimary: 'https://script.google.com/macros/s/FAKE/exec',
    apiUrlFallback: null,
    apiToken: 'test-token',
    cacheTtlMs: 300000
  }
}));

describe('fetchEntries', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns entries and diagnostics on success', async () => {
    const mockResponse = {
      success: true,
      data: [
        {
          date: '2026-08-15',
          krvaceni: '2',
          nalady: '1',
          tlak: '0',
          nadymani: '0',
          energie: '1',
          notes: ''
        }
      ],
      meta: {
        apiVersion: '2.0.0',
        schemaVersion: 1,
        source: 'primary',
        fetchedAt: '2026-08-25T10:00:00Z'
      }
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => '2.0.0' },
      json: () => Promise.resolve(mockResponse)
    });

    const { fetchEntries } = await import('../lib/api');
    const result = await fetchEntries();

    expect(result.entries).toEqual(mockResponse.data);
    expect(result.diagnostics.source).toBe('primary');

    const call = vi.mocked(fetch).mock.calls[0];
    const url = new URL(call[0] as string);
    expect(url.searchParams.get('action')).toBe('fetch');
    expect(url.searchParams.get('token')).toBe(MOCK_TOKEN);
  });

  it('throws when the schema version does not match', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => '2.0.0' },
      json: () => Promise.resolve({
        success: true,
        data: [],
        meta: {
          apiVersion: '2.0.0',
          schemaVersion: 2,
          source: 'primary',
          fetchedAt: '2026-08-25T10:00:00Z'
        }
      })
    });

    const { fetchEntries } = await import('../lib/api');

    await expect(fetchEntries()).rejects.toThrow('SCHEMA_MISMATCH');
  });
});

describe('saveEntry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends GET with action=save and all symptom params', async () => {
    const mockResponse = {
      success: true,
      data: {
        date: '2026-08-25',
        krvaceni: '3',
        nalady: '1',
        tlak: '0',
        nadymani: '2',
        energie: '1',
        notes: 'tired'
      },
      meta: {
        apiVersion: '2.0.0',
        schemaVersion: 1,
        source: 'primary',
        fetchedAt: '2026-08-25T10:00:00Z'
      }
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const { saveEntry } = await import('../lib/api');

    const result = await saveEntry({
      date: '2026-08-25',
      krvaceni: '3',
      nalady: '1',
      tlak: '0',
      nadymani: '2',
      energie: '1',
      notes: 'tired'
    });

    expect(result).toEqual(mockResponse.data);

    const call = vi.mocked(fetch).mock.calls[0];
    const url = new URL(call[0] as string);
    expect(url.searchParams.get('action')).toBe('save');
    expect(url.searchParams.get('date')).toBe('2026-08-25');
    expect(url.searchParams.get('krvaceni')).toBe('3');
    expect(url.searchParams.get('token')).toBe(MOCK_TOKEN);
  });

  it('throws on unsuccessful response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: false,
        data: null,
        meta: {
          apiVersion: '2.0.0',
          schemaVersion: 1,
          source: 'primary',
          fetchedAt: '2026-08-25T10:00:00Z'
        },
        errorCode: 'VALIDATION_ERROR',
        message: 'A valid date is required'
      })
    });

    const { saveEntry } = await import('../lib/api');

    await expect(
      saveEntry({ date: '' })
    ).rejects.toThrow('A valid date is required');
  });
});

describe('deleteEntry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends GET with action=delete and date param', async () => {
    const mockResponse = {
      success: true,
      data: null,
      meta: {
        apiVersion: '2.0.0',
        schemaVersion: 1,
        source: 'primary',
        fetchedAt: '2026-08-25T10:00:00Z'
      }
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const { deleteEntry } = await import('../lib/api');

    await deleteEntry('2026-08-25');

    const call = vi.mocked(fetch).mock.calls[0];
    const url = new URL(call[0] as string);
    expect(url.searchParams.get('action')).toBe('delete');
    expect(url.searchParams.get('date')).toBe('2026-08-25');
    expect(url.searchParams.get('token')).toBe(MOCK_TOKEN);
  });

  it('throws on unsuccessful response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: false,
        data: null,
        meta: {
          apiVersion: '2.0.0',
          schemaVersion: 1,
          source: 'primary',
          fetchedAt: '2026-08-25T10:00:00Z'
        },
        errorCode: 'NOT_FOUND',
        message: 'Entry not found'
      })
    });

    const { deleteEntry } = await import('../lib/api');

    await expect(
      deleteEntry('2099-01-01')
    ).rejects.toThrow('Entry not found');
  });
});
