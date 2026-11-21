// Fila de prioridade (seção 8.10): quem abordar e quem retomar, por compensação.

import { supabase } from '../config/supabase.js';
import { mesclarConfigScore } from '../utils/configScore.js';
import { requisicaoInvalida, resultadoOuErro } from '../utils/erros.js';
import { faixaDoScore } from '../utils/score.js';
import { buscarOrganizacao } from './organizacaoService.js';

const DIA_MS = 24 * 60 * 60 * 1000;

const COLUNAS_PRIORIDADE = [
  'id', 'nome_lead', 'cnpj', 'score_compensacao', 'score_parcial', 'status',
  'ultima_interacao_em', 'tentativas_sem_resposta',
  'responsavel:responsaveis!leads_responsavel_fk (id, nome)',
].join(', ');

const plural = (quantidade, singular, varios) => `${quantidade} ${quantidade === 1 ? singular : varios}`;

/** Texto curto do porquê de o lead estar na lista (ex.: "sem contato há 9 dias"). */
export function motivoDaPrioridade(lead, agora) {
  if (!lead.ultima_interacao_em) return 'nenhuma interação registrada';
  const dias = Math.floor((agora.getTime() - new Date(lead.ultima_interacao_em).getTime()) / DIA_MS);
  let texto = dias < 1 ? 'última interação hoje' : `sem contato há ${plural(dias, 'dia', 'dias')}`;
  if (lead.tentativas_sem_resposta > 0) {
    texto += ` (${plural(lead.tentativas_sem_resposta, 'tentativa', 'tentativas')} sem resposta)`;
  }
  return texto;
}

async function conferirResponsavel(organizacaoId, responsavelId) {
  const responsavel = resultadoOuErro(
    await supabase
      .from('responsaveis')
      .select('id')
      .eq('id', responsavelId)
      .eq('organizacao_id', organizacaoId)
      .maybeSingle(),
  );
  if (!responsavel) throw requisicaoInvalida('Responsável não encontrado');
}

/**
 * - abordar: status "novo" e nenhuma interação nos últimos `dias_espera` dias;
 * - retomar: "em_contato" ou "qualificado" e última interação há `dias_retomar`
 *   dias ou mais (ou nenhuma).
 * Cada lista por compensação decrescente, com N/A no fim.
 */
export async function listarPrioridade(organizacaoId, { responsavelId = null, limite = 10 } = {}, agora = new Date()) {
  if (responsavelId) await conferirResponsavel(organizacaoId, responsavelId);
  const { config_score: configOrganizacao } = await buscarOrganizacao(organizacaoId, 'config_score');
  const config = mesclarConfigScore(configOrganizacao ?? {});
  const { dias_espera: diasEspera, dias_retomar: diasRetomar } = config.prioridade;

  const consultar = (status, operador, dias) => {
    const limiteData = new Date(agora.getTime() - dias * DIA_MS).toISOString();
    let consulta = supabase
      .from('leads')
      .select(COLUNAS_PRIORIDADE)
      .eq('organizacao_id', organizacaoId)
      .in('status', status)
      // Aspas porque a data tem ":" e ".", reservados na sintaxe do filtro.
      .or(`ultima_interacao_em.is.null,ultima_interacao_em.${operador}."${limiteData}"`);
    if (responsavelId) consulta = consulta.eq('responsavel_id', responsavelId);
    return consulta
      .order('score_compensacao', { ascending: false, nullsFirst: false })
      .order('id')
      .limit(limite);
  };

  const [abordar, retomar] = await Promise.all([
    consultar(['novo'], 'lt', diasEspera),
    consultar(['em_contato', 'qualificado'], 'lte', diasRetomar),
  ]);

  const item = (lead) => ({
    id: lead.id,
    nome_lead: lead.nome_lead,
    cnpj: lead.cnpj,
    score_compensacao: lead.score_compensacao,
    faixa: faixaDoScore(lead.score_compensacao == null ? null : Number(lead.score_compensacao), config.faixas),
    score_parcial: lead.score_parcial,
    status: lead.status,
    responsavel: lead.responsavel ?? null,
    ultima_interacao_em: lead.ultima_interacao_em,
    tentativas_sem_resposta: lead.tentativas_sem_resposta,
    motivo: motivoDaPrioridade(lead, agora),
  });

  return {
    abordar: resultadoOuErro(abordar).map(item),
    retomar: resultadoOuErro(retomar).map(item),
  };
}
