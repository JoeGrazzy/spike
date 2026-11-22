/* ESM facade over the early-loaded classic Supabase client bootstrap. */
export const supabase = window.SPIKE_SUPABASE;
if (!supabase) throw new Error('SPIKE Supabase bootstrap is unavailable.');
