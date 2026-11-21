// Leads da organização. Toda consulta filtra por organizacao_id, que vem
// sempre do perfil do usuário (req.organizacaoId), nunca da requisição.

import { supabase } from '../config/supabase.js';
import { mesclarConfigScore } from '../utils/configScore.js';
import { naoEncontrado, requisicaoInvalida, resultadoOuErro } from '../utils/erros.js';
import { extrairRedesSociais } from '../utils/redesSociais.js';
import { buscarOrganizacao } from './organizacaoService.js';
import { CAMPOS_DO_SCORE, recalcularScores, recalcularSemInterromper } from './scoreService.js';

export const STATUS_DESFECHO = ['convertido', 'descartado'];

// Colunas copiadas para desfecho_score quando o lead é convertido ou descartado.
export const COLUNAS_DESFECHO_SCORE = [
  'score_valor', 'score_probabilidade', 'score_esforco', 'score_compensacao', 'score_confianca',
  'score_parcial', 'score_detalhes', 'score_calculado_em',
];

const RELACOES =
  'responsavel:responsaveis!leads_responsavel_fk (id, nome), lead_redes_sociais (id, plataforma, url, created_at)';

const COLUNAS_LISTA = [
  'id', 'cnpj', 'nome_lead', 'nome_decisor', 'numero_decisor', 'redes_sociais',
  'calculadora_icp', 'calculadora_midias_sociais', 'nota_final', 'status',
  'razao_social', 'cidade', 'uf', 'enriquecimento_status',
  'score_valor', 'score_probabilidade', 'score_esforco', 'score_compensacao', 'score_parcial',
  'created_at', 'updated_at',
].join(', ');

const MENSAGENS_ERRO_LEAD = {
  23505: 'Já existe um lead com este CNPJ na organização',
  // Chave estrangeira composta: o responsável não existe nesta organização.
  23503: 'Responsável não encontrado',
};

// Nota da planilha → escala máxima da organização usada para validá-la.
const ESCALA_POR_CAMPO = {
  calculadora_icp: 'escala_icp_max',
  calculadora_midias_sociais: 'escala_midias_max',
  nota_final: 'escala_nota_max',
};

/**
 * Monta o filtro "or" do PostgREST para a busca livre. Caracteres com
 * significado na sintaxe do filtro (vírgula, ponto, parênteses, aspas...) viram
 * "*", o curinga do PostgREST, então não há como injetar outro filtro.
 * O CNPJ é buscado sem máscara: "12.ABC.345" encontra "12ABC345...".
 */
export function filtroDeBusca(termo) {
  const texto = termo.replace(/[,.:()"'\\*%_]+/g, '*').replace(/\s+/g, ' ').trim();
  if (texto.replace(/[*\s]/g, '') === '') return null;

  const padrao = `*${texto}*`.replace(/\*+/g, '*');
  const condicoes = ['nome_lead', 'nome_decisor', 'razao_social'].map((coluna) => `${coluna}.ilike.${padrao}`);

  const cnpj = termo.replace(/[\s./-]/g, '').toUpperCase();
  if (/^[0-9A-Z]{2,14}$/.test(cnpj)) condicoes.push(`cnpj.ilike.*${cnpj}*`);
  return condicoes.join(',');
}

export async function listarLeads(organizacaoId, { status, busca, ordem, direcao, pagina, limite }) {
  const inicio = (pagina - 1) * limite;

  const montarConsulta = (opcoes) => {
    let consulta = supabase
      .from('leads')
      .select(`${COLUNAS_LISTA}, ${RELACOES}`, opcoes)
      .eq('organizacao_id', organizacaoId);
    if (status) consulta = consulta.eq('status', status);
    const filtro = busca ? filtroDeBusca(busca) : null;
    if (filtro) consulta = consulta.or(filtro);
    return consulta;
  };

  const { data, error, count } = await montarConsulta({ count: 'exact' })
    // N/A (nulo) sempre no fim, nas duas direções; o id desempata para a
    // paginação ser estável.
    .order(ordem, { ascending: direcao === 'asc', nullsFirst: false })
    .order('id')
    .order('created_at', { referencedTable: 'lead_redes_sociais' })
    .range(inicio, inicio + limite - 1);

  // Página além do fim: o PostgREST responde "range not satisfiable".
  if (error?.code === 'PGRST103') {
    const contagem = await montarConsulta({ count: 'exact', head: true });
    if (contagem.error) resultadoOuErro(contagem);
    return { leads: [], total: contagem.count ?? 0, pagina, limite };
  }
  resultadoOuErro({ data, error });
  return { leads: data, total: count ?? 0, pagina, limite };
}

export async function obterLead(organizacaoId, leadId) {
  const lead = resultadoOuErro(
    await supabase
      .from('leads')
      .select(`*, ${RELACOES}`)
      .eq('id', leadId)
      .eq('organizacao_id', organizacaoId)
      .order('created_at', { referencedTable: 'lead_redes_sociais' })
      .maybeSingle(),
  );
  if (!lead) throw naoEncontrado('Lead não encontrado');
  return lead;
}

/** Notas acima da escala da organização (ex.: ICP 15 numa escala de 0 a 10) são recusadas. */
async function conferirEscalas(organizacaoId, dados) {
  const campos = Object.keys(ESCALA_POR_CAMPO).filter((campo) => dados[campo] != null);
  if (campos.length === 0) return;
  const organizacao = await buscarOrganizacao(organizacaoId, Object.values(ESCALA_POR_CAMPO).join(', '));
  for (const campo of campos) {
    const maximo = Number(organizacao[ESCALA_POR_CAMPO[campo]]);
    if (dados[campo] > maximo) {
      throw requisicaoInvalida(`O campo "${campo}" deve estar entre 0 e ${maximo} (escala da organização)`);
    }
  }
}

const copiaDoScore = (lead) => Object.fromEntries(COLUNAS_DESFECHO_SCORE.map((coluna) => [coluna, lead[coluna] ?? null]));

/** O motivo precisa ser um dos motivos_descarte da organização; devolve o texto como está configurado. */
async function motivoDaOrganizacao(organizacaoId, motivo) {
  const { config_score: config } = await buscarOrganizacao(organizacaoId, 'config_score');
  const motivos = mesclarConfigScore(config ?? {}).motivos_descarte;
  const encontrado = motivos.find((item) => item.toLowerCase() === motivo.toLowerCase());
  if (!encontrado) {
    throw requisicaoInvalida(`O campo "motivo_descarte" deve ser um destes: ${motivos.join(', ')}`);
  }
  return encontrado;
}

/** Status, motivo e score atuais do lead, para as regras do desfecho. */
async function buscarParaDesfecho(organizacaoId, leadId) {
  const lead = resultadoOuErro(
    await supabase
      .from('leads')
      .select(`status, motivo_descarte, ${COLUNAS_DESFECHO_SCORE.join(', ')}`)
      .eq('id', leadId)
      .eq('organizacao_id', organizacaoId)
      .maybeSingle(),
  );
  if (!lead) throw naoEncontrado('Lead não encontrado');
  return lead;
}

/**
 * Regras do desfecho (seção 8.10) sobre o estado final do lead. `atual` é o
 * lead antes da mudança (null no cadastro). Devolve os dados a gravar.
 * - descartar exige motivo_descarte na mesma requisição, salvo se o lead já
 *   estava descartado e com motivo; fora de "descartado" o motivo é limpo;
 * - entrar em convertido ou descartado (vindo de qualquer outro status) grava
 *   desfecho_em e a cópia do score; sair de um desfecho limpa os dois.
 */
async function aplicarDesfecho(organizacaoId, dados, atual) {
  const statusAntes = atual?.status ?? null;
  const statusFinal = dados.status ?? statusAntes ?? 'novo';
  const mudouStatus = Object.hasOwn(dados, 'status') && dados.status !== statusAntes;
  const enviouMotivo = Object.hasOwn(dados, 'motivo_descarte');
  const resultado = { ...dados };

  if (statusFinal === 'descartado') {
    const motivo = enviouMotivo ? dados.motivo_descarte : mudouStatus ? null : (atual?.motivo_descarte ?? null);
    if (motivo === null) throw requisicaoInvalida('Informe o motivo do descarte (campo "motivo_descarte")');
    if (enviouMotivo) resultado.motivo_descarte = await motivoDaOrganizacao(organizacaoId, motivo);
  } else if (enviouMotivo || atual?.motivo_descarte != null) {
    resultado.motivo_descarte = null;
  }

  if (mudouStatus && STATUS_DESFECHO.includes(statusFinal)) {
    resultado.desfecho_em = new Date().toISOString();
    // No cadastro ainda não há score: a cópia é feita depois do primeiro cálculo.
    resultado.desfecho_score = atual ? copiaDoScore(atual) : null;
  } else if (mudouStatus && STATUS_DESFECHO.includes(statusAntes)) {
    resultado.desfecho_em = null;
    resultado.desfecho_score = null;
  }
  return resultado;
}

/** Lead cadastrado já com desfecho: copia o score recém-calculado. */
async function copiarScoreDoCadastro(organizacaoId, leadId) {
  try {
    const lead = resultadoOuErro(
      await supabase
        .from('leads')
        .select(COLUNAS_DESFECHO_SCORE.join(', '))
        .eq('id', leadId)
        .eq('organizacao_id', organizacaoId)
        .single(),
    );
    resultadoOuErro(
      await supabase
        .from('leads')
        .update({ desfecho_score: copiaDoScore(lead) })
        .eq('id', leadId)
        .eq('organizacao_id', organizacaoId),
    );
  } catch (erro) {
    // O lead já foi gravado com o desfecho; sem a cópia, conta na faixa N/A.
    console.error('[desfecho] falha ao copiar o score do cadastro:', erro.message);
  }
}

/**
 * Acrescenta em lead_redes_sociais os links encontrados no texto. Links já
 * cadastrados são ignorados e nenhum é removido (mesma regra da importação).
 */
async function adicionarRedesSociais(leadId, texto) {
  const redes = extrairRedesSociais(texto);
  if (redes.length === 0) return;
  resultadoOuErro(
    await supabase
      .from('lead_redes_sociais')
      .upsert(redes.map((rede) => ({ lead_id: leadId, ...rede })), {
        onConflict: 'lead_id,url',
        ignoreDuplicates: true,
      }),
  );
}

export async function criarLead(organizacaoId, dadosEnviados) {
  const dados = await aplicarDesfecho(organizacaoId, dadosEnviados, null);
  await conferirEscalas(organizacaoId, dados);
  const { id } = resultadoOuErro(
    await supabase
      .from('leads')
      .insert({ ...dados, organizacao_id: organizacaoId })
      .select('id')
      .single(),
    MENSAGENS_ERRO_LEAD,
  );

  try {
    await adicionarRedesSociais(id, dados.redes_sociais);
  } catch (erro) {
    // Desfaz o cadastro para não ficar um lead sem os links (o cliente tenta de novo).
    await supabase.from('leads').delete().eq('id', id).eq('organizacao_id', organizacaoId);
    throw erro;
  }
  await recalcularSemInterromper(organizacaoId, { ids: [id] });
  if (dados.desfecho_em) await copiarScoreDoCadastro(organizacaoId, id);
  return obterLead(organizacaoId, id);
}

export async function atualizarLead(organizacaoId, leadId, dadosEnviados) {
  const mexeNoDesfecho = ['status', 'motivo_descarte'].some((campo) => Object.hasOwn(dadosEnviados, campo));
  const dados = mexeNoDesfecho
    ? await aplicarDesfecho(organizacaoId, dadosEnviados, await buscarParaDesfecho(organizacaoId, leadId))
    : dadosEnviados;
  await conferirEscalas(organizacaoId, dados);
  const atualizados = resultadoOuErro(
    await supabase
      .from('leads')
      .update(dados)
      .eq('id', leadId)
      .eq('organizacao_id', organizacaoId)
      .select('id'),
    MENSAGENS_ERRO_LEAD,
  );
  if (atualizados.length === 0) throw naoEncontrado('Lead não encontrado');

  // Se falhar aqui, repetir a mesma requisição completa os links (é idempotente).
  if (dados.redes_sociais) await adicionarRedesSociais(leadId, dados.redes_sociais);
  if (CAMPOS_DO_SCORE.some((campo) => Object.hasOwn(dados, campo))) {
    await recalcularSemInterromper(organizacaoId, { ids: [leadId] });
  }
  return obterLead(organizacaoId, leadId);
}

/** POST /leads/:id/calcular-score: recalcula na hora e devolve o lead. */
export async function calcularScoreDoLead(organizacaoId, leadId) {
  const gravados = await recalcularScores(organizacaoId, { ids: [leadId] });
  if (gravados === 0) throw naoEncontrado('Lead não encontrado');
  return obterLead(organizacaoId, leadId);
}

/** POST /leads/recalcular-score: todos os leads da organização. */
export async function recalcularScoresDaOrganizacao(organizacaoId) {
  return { recalculados: await recalcularScores(organizacaoId) };
}

export async function excluirLead(organizacaoId, leadId) {
  const excluidos = resultadoOuErro(
    await supabase
      .from('leads')
      .delete()
      .eq('id', leadId)
      .eq('organizacao_id', organizacaoId)
      .select('id'),
  );
  if (excluidos.length === 0) throw naoEncontrado('Lead não encontrado');
}
