// Consulta de CNPJ na BrasilAPI (gratuita, sem chave).
// Documentação: https://brasilapi.com.br/docs#tag/CNPJ

import { classificarResposta, converterDadosCnpj } from '../utils/enriquecimento.js';

const URL_BASE = 'https://brasilapi.com.br/api/cnpj/v1/';
const TEMPO_LIMITE_MS = 10_000;

// A BrasilAPI bloqueia (403) o User-Agent padrão do Node, então enviamos um próprio.
const CABECALHOS = { Accept: 'application/json', 'User-Agent': 'gestao-leads/0.1' };

/**
 * Consulta um CNPJ (14 caracteres, sem máscara). Nunca lança erro: devolve
 * { tipo, dados?, mensagem? } com o tipo de classificarResposta. Falha de rede,
 * tempo esgotado e resposta ilegível contam como transitórias.
 * `fetch` pode ser trocado nos testes.
 */
export async function consultarCnpj(cnpj, { fetch = globalThis.fetch, tempoLimiteMs = TEMPO_LIMITE_MS } = {}) {
  let resposta;
  try {
    resposta = await fetch(`${URL_BASE}${encodeURIComponent(cnpj)}`, {
      headers: CABECALHOS,
      signal: AbortSignal.timeout(tempoLimiteMs),
    });
  } catch (erro) {
    const tempoEsgotado = erro?.name === 'TimeoutError' || erro?.name === 'AbortError';
    return {
      tipo: 'transitorio',
      mensagem: tempoEsgotado ? 'BrasilAPI não respondeu a tempo' : 'Falha de conexão com a BrasilAPI',
    };
  }

  const classificacao = classificarResposta(resposta.status, cnpj);
  if (classificacao.tipo !== 'ok') {
    // Descarta o corpo para liberar a conexão.
    await resposta.body?.cancel().catch(() => {});
    return classificacao;
  }

  try {
    const corpo = await resposta.json();
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new Error('formato inesperado');
    return { tipo: 'ok', dados: converterDadosCnpj(corpo) };
  } catch {
    return { tipo: 'transitorio', mensagem: 'Resposta ilegível da BrasilAPI' };
  }
}
