import { createClient } from '@supabase/supabase-js';

const FALLBACK_SUPABASE_URL = 'https://lhgbhxovanslmkpnitlr.supabase.co';
const FALLBACK_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoZ2JoeG92YW5zbG1rcG5pdGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0Mzc4MjUsImV4cCI6MjEwNjAxMzgyNX0.7oAEsWBHw7bOwuH4ZuE4S0UylRbrHKtYOcceQOp54bY';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL).trim();
const supabasePublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || FALLBACK_SUPABASE_KEY).trim();

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
