// Recalcula e grava o score dos leads de uma organização.
// O cálculo é das funções puras de utils/score.js; aqui só busca e grava.

import { supabase } from '../config/supabase.js';
import { resultadoOuErro } from '../utils/erros.js';
import { calcularScore } from '../utils/score.js';
import { buscarOrganizacao } from './organizacaoService.js';

const TAMANHO_PAGINA = 1000;
const TAMANHO_LOTE_GRAVACAO = 500;

// Só as colunas que o score usa.
const COLUNAS_SCORE = [
  'id', 'porte', 'capital_social', 'data_abertura', 'cnae_principal', 'uf', 'situacao_cadastral', 'enriquecido_em',
  'calculadora_icp', 'calculadora_midias_sociais', 'nome_decisor', 'numero_decisor', 'redes_sociais',
  'email_decisor', 'linkedin_decisor', 'telefone_receita', 'email_receita', 'socios',
  'avaliacao', 'ticket_estimado', 'tentativas_sem_resposta',
  'lead_redes_sociais (id)',
].join(', ');

// Campos do lead que mudam o score: editar qualquer um deles dispara o recálculo.
export const CAMPOS_DO_SCORE = [
  'calculadora_icp', 'calculadora_midias_sociais', 'nome_decisor', 'numero_decisor', 'redes_sociais',
  'email_decisor', 'linkedin_decisor',
];

/**
 * Desfechos por faixa da organização ({ <faixa>: { convertidos, descartados } }),
 * usados na estimativa em reais. Sem eles, a estimativa usa o índice de
 * probabilidade, então uma falha aqui não impede o cálculo.
 */
async function buscarTaxasConversao(organizacaoId) {
  try {
    const resultado = resultadoOuErro(await supabase.rpc('contar_desfechos', { p_organizacao_id: organizacaoId }));
    return resultado?.faixas ?? null;
  } catch (erro) {
    console.error('[score] falha ao ler desfechos:', erro.message);
    return null;
  }
}

async function buscarPagina(organizacaoId, { ids, importacaoId }, inicio) {
  let consulta = supabase
    .from('leads')
    .select(COLUNAS_SCORE)
    .eq('organizacao_id', organizacaoId)
    .order('id')
    .range(inicio, inicio + TAMANHO_PAGINA - 1);
  if (ids) consulta = consulta.in('id', ids);
  if (importacaoId) consulta = consulta.eq('ultima_importacao_id', importacaoId);
  const { data, error } = await consulta;
  if (error?.code === 'PGRST103') return [];
  return resultadoOuErro({ data, error });
}

async function gravar(organizacaoId, scores) {
  let gravados = 0;
  for (let inicio = 0; inicio < scores.length; inicio += TAMANHO_LOTE_GRAVACAO) {
    gravados += resultadoOuErro(
      await supabase.rpc('gravar_scores', {
        p_organizacao_id: organizacaoId,
        p_scores: scores.slice(inicio, inicio + TAMANHO_LOTE_GRAVACAO),
      }),
    );
  }
  return gravados;
}

/**
 * Recalcula o score dos leads da organização: todos, só os `ids` informados
 * ou só os da importação `importacaoId`. Devolve quantos foram gravados.
 */
export async function recalcularScores(organizacaoId, filtro = {}) {
  const organizacao = await buscarOrganizacao(
    organizacaoId,
    'escala_icp_max, escala_midias_max, escala_nota_max, config_score, updated_at',
  );
  const referencia = new Date();
  const taxasConversao = await buscarTaxasConversao(organizacaoId);
  let total = 0;

  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const leads = await buscarPagina(organizacaoId, filtro, inicio);
    const scores = leads.map(({ lead_redes_sociais: redes, ...lead }) => ({
      id: lead.id,
      ...calcularScore({ ...lead, quantidade_redes: redes?.length ?? 0 }, organizacao, { referencia, taxasConversao }),
    }));
    total += await gravar(organizacaoId, scores);
    if (leads.length < TAMANHO_PAGINA) break;
  }
  return total;
}

/**
 * Recálculo disparado como efeito de outra operação (cadastro, edição,
 * importação). Se falhar, a operação principal já foi concluída: registra no
 * log e segue, e o score pode ser recalculado depois pela rota de lote.
 */
export async function recalcularSemInterromper(organizacaoId, filtro) {
  try {
    return await recalcularScores(organizacaoId, filtro);
  } catch (erro) {
    console.error('[score] falha no recálculo:', erro.message);
    return 0;
  }
}
