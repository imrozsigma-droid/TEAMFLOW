/**
 * 🗄️ Supabase Client
 * Auto-configured from .env — connects to YOUR Supabase project.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env\n' +
    'Get them from: Supabase Dashboard → Project Settings → API'
  );
}

// Public client — respects RLS, uses anon key
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client — bypasses RLS, uses service role key
// ⚠️ Only use on server side, never expose to client
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

export default supabase;
