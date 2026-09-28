import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/db'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY (see .env.example)')
}

// Browser client: publishable key only. RLS scopes every query to the logged-in user.
export const supabase = createClient<Database>(url, key)
