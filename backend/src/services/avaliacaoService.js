// Avaliação do lead: o questionário respondido pela equipe no sistema
// (especificação, seção 8.8). As respostas alimentam o score.

import { supabase } from '../config/supabase.js';
import { validarAvaliacao } from '../utils/avaliacao.js';
import { mesclarConfigScore } from '../utils/configScore.js';
import { naoEncontrado, resultadoOuErro } from '../utils/erros.js';
import { obterLead } from './leadsService.js';
import { buscarOrganizacao } from './organizacaoService.js';
import { recalcularSemInterromper } from './scoreService.js';

async function perguntasDaOrganizacao(organizacaoId) {
  const { config_score: config } = await buscarOrganizacao(organizacaoId, 'config_score');
  return mesclarConfigScore(config ?? {}).avaliacao.perguntas;
}

/** GET /avaliacao/modelo: o modelo efetivo (padrão mesclado com o da organização). */
export async function obterModelo(organizacaoId) {
  return { perguntas: await perguntasDaOrganizacao(organizacaoId) };
}

/** PUT /leads/:id/avaliacao: grava as respostas, recalcula e devolve o lead. */
export async function avaliarLead(organizacaoId, leadId, perfilId, corpo) {
  const { respostas, ...resto } = validarAvaliacao(corpo, await perguntasDaOrganizacao(organizacaoId));
  const atualizados = resultadoOuErro(
    await supabase
      .from('leads')
      .update({
        avaliacao: { respostas },
        avaliado_em: new Date().toISOString(),
        avaliado_por: perfilId,
        ...resto,
      })
      .eq('id', leadId)
      .eq('organizacao_id', organizacaoId)
      .select('id'),
  );
  if (atualizados.length === 0) throw naoEncontrado('Lead não encontrado');

  await recalcularSemInterromper(organizacaoId, { ids: [leadId] });
  return obterLead(organizacaoId, leadId);
}
