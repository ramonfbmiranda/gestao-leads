// Interações com o lead (revisão 7): tentativas de contato, conversas e reuniões.
// Cada registro ou exclusão atualiza o resumo do lead (ultima_interacao_em e
// tentativas_sem_resposta) e recalcula o score.

import { supabase } from '../config/supabase.js';
import { acessoNegado, naoEncontrado, resultadoOuErro } from '../utils/erros.js';
import { recalcularSemInterromper } from './scoreService.js';

const COLUNAS_INTERACAO =
  'id, lead_id, perfil_id, tipo, teve_resposta, observacao, ocorreu_em, created_at, perfil:perfis (id, nome)';

async function conferirLead(organizacaoId, leadId) {
  const lead = resultadoOuErro(
    await supabase.from('leads').select('id').eq('id', leadId).eq('organizacao_id', organizacaoId).maybeSingle(),
  );
  if (!lead) throw naoEncontrado('Lead não encontrado');
}

/** Recalcula o resumo no banco, numa transação (função atualizar_resumo_interacoes). */
async function atualizarResumo(organizacaoId, leadId) {
  resultadoOuErro(
    await supabase.rpc('atualizar_resumo_interacoes', { p_organizacao_id: organizacaoId, p_lead_id: leadId }),
  );
  await recalcularSemInterromper(organizacaoId, { ids: [leadId] });
}

/** Da mais recente para a mais antiga. */
export async function listarInteracoes(organizacaoId, leadId) {
  await conferirLead(organizacaoId, leadId);
  return resultadoOuErro(
    await supabase
      .from('interacoes')
      .select(COLUNAS_INTERACAO)
      .eq('organizacao_id', organizacaoId)
      .eq('lead_id', leadId)
      .order('ocorreu_em', { ascending: false })
      .order('created_at', { ascending: false }),
  );
}

/** `dados` já validado: tipo, teve_resposta, observacao e ocorreu_em (opcional). */
export async function registrarInteracao(organizacaoId, perfilId, leadId, dados) {
  const { data, error } = await supabase
    .from('interacoes')
    .insert({ ...dados, organizacao_id: organizacaoId, lead_id: leadId, perfil_id: perfilId })
    .select(COLUNAS_INTERACAO)
    .single();
  // A chave estrangeira (organizacao_id, lead_id) recusa lead inexistente ou de outra organização.
  if (error?.code === '23503') throw naoEncontrado('Lead não encontrado');
  const interacao = resultadoOuErro({ data, error });

  await atualizarResumo(organizacaoId, leadId);
  return interacao;
}

/** Só quem registrou a interação ou um admin pode excluí-la. */
export async function excluirInteracao(organizacaoId, perfil, leadId, interacaoId) {
  const interacao = resultadoOuErro(
    await supabase
      .from('interacoes')
      .select('id, perfil_id')
      .eq('id', interacaoId)
      .eq('lead_id', leadId)
      .eq('organizacao_id', organizacaoId)
      .maybeSingle(),
  );
  if (!interacao) throw naoEncontrado('Interação não encontrada');
  if (perfil.papel !== 'admin' && interacao.perfil_id !== perfil.id) {
    throw acessoNegado('Só quem registrou a interação ou um administrador pode excluí-la');
  }

  const excluidas = resultadoOuErro(
    await supabase
      .from('interacoes')
      .delete()
      .eq('id', interacaoId)
      .eq('organizacao_id', organizacaoId)
      .select('id'),
  );
  if (excluidas.length === 0) throw naoEncontrado('Interação não encontrada');

  await atualizarResumo(organizacaoId, leadId);
}
