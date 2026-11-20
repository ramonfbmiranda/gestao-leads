// Leads da organização. Toda consulta filtra por organizacao_id, que vem
// sempre do perfil do usuário (req.organizacaoId), nunca da requisição.

import { supabase } from '../config/supabase.js';
import { naoEncontrado, requisicaoInvalida, resultadoOuErro } from '../utils/erros.js';
import { extrairRedesSociais } from '../utils/redesSociais.js';
import { buscarOrganizacao } from './organizacaoService.js';

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

export async function criarLead(organizacaoId, dados) {
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
  return obterLead(organizacaoId, id);
}

export async function atualizarLead(organizacaoId, leadId, dados) {
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
  return obterLead(organizacaoId, leadId);
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
