// Supabase no navegador: só autenticação (login, cadastro e sessão), com a
// chave pública. Os dados passam sempre pela API (especificação, seção 2).

import { createClient } from '@supabase/supabase-js';
import { ambiente } from '../config/ambiente.js';

export const supabase = ambiente
  ? createClient(ambiente.supabaseUrl, ambiente.supabaseChavePublica, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

const MENSAGENS = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar. Procure o link na sua caixa de entrada.',
  user_already_exists: 'Já existe uma conta com este e-mail. Entre com ela.',
  weak_password: 'Senha fraca: use pelo menos 6 caracteres.',
  over_email_send_rate_limit: 'Muitos e-mails enviados agora há pouco. Espere alguns minutos e tente de novo.',
  over_request_rate_limit: 'Muitas tentativas. Espere alguns minutos e tente de novo.',
};

/** Mensagem em português para um erro do Supabase Auth. */
export function mensagemDeErroAuth(erro) {
  if (!erro) return null;
  return MENSAGENS[erro.code] ?? 'Não foi possível concluir agora. Tente de novo em instantes.';
}
