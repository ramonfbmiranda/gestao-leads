import { supabase } from '../config/supabase.js';
import { resultadoOuErro } from '../utils/erros.js';

export const COLUNAS_ORGANIZACAO =
  'id, nome, escala_icp_max, escala_midias_max, escala_nota_max, config_score, created_at, updated_at';

export async function buscarOrganizacao(organizacaoId, colunas = COLUNAS_ORGANIZACAO) {
  return resultadoOuErro(
    await supabase.from('organizacoes').select(colunas).eq('id', organizacaoId).single(),
  );
}

/** `dados` já validado pelo controller (lista branca: nome, escalas e config_score). */
export async function atualizarOrganizacao(organizacaoId, dados) {
  return resultadoOuErro(
    await supabase
      .from('organizacoes')
      .update(dados)
      .eq('id', organizacaoId)
      .select(COLUNAS_ORGANIZACAO)
      .single(),
  );
}
