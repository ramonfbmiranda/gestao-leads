import { supabase } from '../config/supabase.js';
import { resultadoOuErro } from '../utils/erros.js';

const COLUNAS_RESPONSAVEL = 'id, nome, created_at';

export async function listarResponsaveis(organizacaoId) {
  return resultadoOuErro(
    await supabase
      .from('responsaveis')
      .select(COLUNAS_RESPONSAVEL)
      .eq('organizacao_id', organizacaoId)
      .order('nome'),
  );
}

/** O banco recusa o mesmo nome com outra caixa ("Ana" e "ana") na organização. */
export async function criarResponsavel(organizacaoId, nome) {
  return resultadoOuErro(
    await supabase
      .from('responsaveis')
      .insert({ organizacao_id: organizacaoId, nome })
      .select(COLUNAS_RESPONSAVEL)
      .single(),
    { 23505: 'Já existe um responsável com este nome' },
  );
}
