import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(
  url && anonKey && !url.includes('your-project') && !anonKey.includes('your-anon'),
)

export const CONFIG_ERROR_MESSAGE = import.meta.env.DEV
  ? 'Supabase is not configured. Copy .env.example to .env, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server.'
  : 'This app is not connected to Supabase yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY when building it.'

const NETWORK_ERROR_PATTERN =
  /failed to fetch|fetch failed|networkerror|network request failed|load failed|network connection/i

/**
 * Turns low-level Supabase/network errors into messages a user can act on.
 * A missing .env file shows up in the browser as "Failed to fetch", which is
 * correct but tells nobody how to fix it.
 */
export function describeSupabaseError(error) {
  if (!isSupabaseConfigured) return CONFIG_ERROR_MESSAGE

  const message = typeof error === 'string' ? error : error?.message ?? ''
  if (NETWORK_ERROR_PATTERN.test(message)) {
    return "Can't reach Supabase. Check your internet connection and that VITE_SUPABASE_URL points to a running Supabase project, then try again."
  }
  return message || 'Something went wrong. Please try again.'
}

if (!isSupabaseConfigured) {
  // Visible in the browser console to speed up local setup.
  console.warn(`[CashBridge] ${CONFIG_ERROR_MESSAGE}`)
}

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
