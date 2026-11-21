// Importação em duas fases (especificação, seção 7). O arquivo é enviado nas
// duas: no preview só é lido; na confirmação é lido de novo e gravado.

import { supabase } from '../config/supabase.js';
import { mesclarConfigScore } from '../utils/configScore.js';
import { naoEncontrado, resultadoOuErro } from '../utils/erros.js';
import {
  CAMPOS_IMPORTACAO,
  montarLeads,
  resumirErros,
  sugerirMapeamento,
  validarMapeamento,
} from '../utils/importacao.js';
import { lerPlanilha } from '../utils/planilha.js';
import { buscarOrganizacao } from './organizacaoService.js';
import { recalcularSemInterromper } from './scoreService.js';

export const TAMANHO_LOTE = 500;
const LINHAS_AMOSTRA = 5;

const COLUNAS_RESUMO =
  'id, nome_arquivo, total_linhas, inseridos, atualizados, ignorados, status, created_at, criado_por';
const COLUNAS_DETALHE = `${COLUNAS_RESUMO}, mapeamento, erros`;

export function preview(arquivo) {
  const planilha = lerPlanilha(arquivo.buffer, arquivo.originalname);
  const { colunas, linhas } = planilha;
  return {
    nome_arquivo: arquivo.originalname,
    colunas,
    amostra: linhas
      .slice(0, LINHAS_AMOSTRA)
      .map(({ valores }) => Object.fromEntries(colunas.map((coluna, i) => [coluna, valores[i]]))),
    total_linhas: linhas.length,
    campos: CAMPOS_IMPORTACAO,
    mapeamento_sugerido: sugerirMapeamento(colunas),
  };
}

async function finalizar(importacaoId, dados) {
  return resultadoOuErro(
    await supabase.from('importacoes').update(dados).eq('id', importacaoId).select(COLUNAS_DETALHE).single(),
  );
}

export async function importar(organizacaoId, perfil, arquivo, mapeamentoEnviado) {
  const planilha = lerPlanilha(arquivo.buffer, arquivo.originalname);
  const mapeamento = validarMapeamento(mapeamentoEnviado, planilha.colunas);

  const organizacao = await buscarOrganizacao(
    organizacaoId,
    'escala_icp_max, escala_midias_max, escala_nota_max, config_score',
  );
  const { leads, erros, ignorados } = montarLeads(planilha, mapeamento, {
    escalas: {
      escala_icp_max: Number(organizacao.escala_icp_max),
      escala_midias_max: Number(organizacao.escala_midias_max),
      escala_nota_max: Number(organizacao.escala_nota_max),
    },
    letras: mesclarConfigScore(organizacao.config_score).equivalencia_letras,
  });

  const { id: importacaoId } = resultadoOuErro(
    await supabase
      .from('importacoes')
      .insert({
        organizacao_id: organizacaoId,
        criado_por: perfil.id,
        nome_arquivo: arquivo.originalname,
        mapeamento,
        total_linhas: planilha.linhas.length,
        status: 'processando',
      })
      .select('id')
      .single(),
  );

  const contagem = { inseridos: 0, atualizados: 0 };
  for (let inicio = 0; inicio < leads.length; inicio += TAMANHO_LOTE) {
    const lote = leads.slice(inicio, inicio + TAMANHO_LOTE);
    const { data, error } = await supabase.rpc('importar_leads_lote', {
      p_organizacao_id: organizacaoId,
      p_importacao_id: importacaoId,
      p_leads: lote,
    });
    if (error) {
      // Lotes anteriores já foram gravados (cada lote é uma transação).
      console.error('[importacao] falha no lote:', error.code, error.message);
      await finalizar(importacaoId, {
        ...contagem,
        ignorados: ignorados + (leads.length - inicio),
        erros: resumirErros([
          ...erros,
          { linha: null, motivo: `Falha ao gravar a partir do lead ${inicio + 1}; os anteriores foram salvos` },
        ]),
        status: 'falhou',
      });
      throw new Error(`Falha na importação ${importacaoId}`, { cause: error });
    }
    contagem.inseridos += data.inseridos;
    contagem.atualizados += data.atualizados;
  }

  const importacao = await finalizar(importacaoId, {
    ...contagem,
    ignorados,
    erros: resumirErros(erros),
    status: 'concluida',
  });
  // Todos os leads gravados ficam com ultima_importacao_id = esta importação.
  await recalcularSemInterromper(organizacaoId, { importacaoId });
  return importacao;
}

export async function listarImportacoes(organizacaoId) {
  return resultadoOuErro(
    await supabase
      .from('importacoes')
      .select(COLUNAS_RESUMO)
      .eq('organizacao_id', organizacaoId)
      .order('created_at', { ascending: false })
      .limit(100),
  );
}

export async function obterImportacao(organizacaoId, importacaoId) {
  const importacao = resultadoOuErro(
    await supabase
      .from('importacoes')
      .select(COLUNAS_DETALHE)
      .eq('id', importacaoId)
      .eq('organizacao_id', organizacaoId)
      .maybeSingle(),
  );
  if (!importacao) throw naoEncontrado('Importação não encontrada');
  return importacao;
}
