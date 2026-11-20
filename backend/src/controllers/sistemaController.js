import { supabase } from '../config/supabase.js';

const TEMPO_LIMITE_SAUDE_MS = 5000;

export function inicio(req, res) {
  res.json({ mensagem: 'API de Leads online' });
}

export async function saude(req, res) {
  try {
    const { error } = await supabase
      .from('organizacoes')
      .select('id')
      .limit(1)
      .abortSignal(AbortSignal.timeout(TEMPO_LIMITE_SAUDE_MS));
    if (!error) return res.json({ status: 'ok', banco: 'ok' });
    console.error('[saude] banco indisponível:', error.code, error.message);
  } catch (erro) {
    console.error('[saude] banco indisponível:', erro.message);
  }
  return res.status(503).json({ erro: 'Banco de dados indisponível' });
}
