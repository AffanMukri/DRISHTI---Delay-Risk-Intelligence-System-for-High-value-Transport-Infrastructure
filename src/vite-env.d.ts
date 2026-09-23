/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_ENABLE_SIGNUP?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DATA_SOURCE?: 'backend' | 'mock';
  readonly VITE_ENABLE_MOCK_FALLBACK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
