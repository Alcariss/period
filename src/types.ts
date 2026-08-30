export type Entry = {
  date: string;
  krvaceni: string;
  nalady: string;
  tlak: string;
  nadymani: string;
  energie: string;
  notes: string;
};

export type ApiMeta = {
  apiVersion: string;
  schemaVersion: number;
  source: 'primary' | 'fallback';
  fetchedAt: string;
};

export type ApiResponse<T> = {
  success: boolean;
  data: T;
  meta: ApiMeta;
  errorCode?: string;
  message?: string;
};

export type ApiConfig = {
  apiUrlPrimary: string;
  apiUrlFallback: string | null;
  apiToken: string | null;
  cacheTtlMs: number;
};

export type NewEntry = {
  date: string;
  krvaceni?: string;
  nalady?: string;
  tlak?: string;
  nadymani?: string;
  energie?: string;
  notes?: string;
};

export type Diagnostics = {
  endpoint: string;
  source: 'primary' | 'fallback' | 'cache';
  fetchedAt: string;
  cacheAgeSeconds: number | null;
  error: string | null;
};
