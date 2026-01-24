import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from './supabaseConfig'

export const supabase = createClient(
  supabaseConfig.url,
  supabaseConfig.anonKey
)
