import { createClient } from '@supabase/supabase-js';
import { ambiente } from './ambiente.js';

// Cliente com a chave secreta: ignora o RLS e enxerga todas as organizações.
// Por isso toda consulta a dados de negócio precisa filtrar por organizacao_id.
// Sem sessão própria: o backend só valida tokens recebidos, nunca faz login.
export const supabase = createClient(ambiente.supabaseUrl, ambiente.supabaseSecretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
