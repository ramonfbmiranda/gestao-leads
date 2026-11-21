// Funções puras do enriquecimento por CNPJ (especificação, seção 9):
// conversão da resposta da BrasilAPI para as colunas do lead, classificação
// das respostas HTTP e espera entre tentativas.

export const MAX_TENTATIVAS = 3;

// Espera antes da 2ª e da 3ª tentativa (a 3ª falha vira erro).
const ESPERAS_MS = [30_000, 120_000];

// A BrasilAPI repassa os dados da Minha Receita, que traz a descrição pelo
// código. Usada só se a descrição vier vazia.
const SITUACOES = { 1: 'NULA', 2: 'ATIVA', 3: 'SUSPENSA', 4: 'INAPTA', 8: 'BAIXADA' };

// numeric(16,2) no banco.
const CAPITAL_MAXIMO = 99_999_999_999_999.99;

function texto(valor, max = 500) {
  if (typeof valor !== 'string') return null;
  const limpo = valor.replace(/\s+/g, ' ').trim();
  return limpo ? limpo.slice(0, max) : null;
}

function capital(valor) {
  const numero = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
  if (typeof numero !== 'number' || !Number.isFinite(numero) || numero < 0 || numero > CAPITAL_MAXIMO) return null;
  return Math.round(numero * 100) / 100;
}

// O CNAE vem como número: 111301 é o CNAE 0111-3/01, então o zero inicial é recomposto.
function cnae(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  if (!digitos || digitos.length > 7) return null;
  return digitos.padStart(7, '0');
}

function data(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const [ano, mes, dia] = valor.split('-').map(Number);
  const objeto = new Date(Date.UTC(ano, mes - 1, dia));
  const valida = objeto.getUTCFullYear() === ano && objeto.getUTCMonth() === mes - 1 && objeto.getUTCDate() === dia;
  return valida && ano >= 1800 ? valor : null;
}

function uf(valor) {
  const sigla = typeof valor === 'string' ? valor.trim().toUpperCase() : '';
  return /^[A-Z]{2}$/.test(sigla) ? sigla : null;
}

/**
 * Converte a resposta da BrasilAPI nas colunas de enriquecimento do lead.
 * Campo ausente ou em formato inesperado vira null (N/A no score), nunca um
 * valor inventado. O porte vem como texto ("MICRO EMPRESA", "DEMAIS",
 * "NÃO INFORMADO"...) e é pontuado pela tabela da organização.
 */
export function converterDadosCnpj(dados) {
  const situacao = texto(dados?.descricao_situacao_cadastral) ?? SITUACOES[dados?.situacao_cadastral] ?? null;
  return {
    razao_social: texto(dados?.razao_social),
    porte: texto(dados?.porte, 100),
    capital_social: capital(dados?.capital_social),
    cnae_principal: cnae(dados?.cnae_fiscal),
    data_abertura: data(dados?.data_inicio_atividade),
    cidade: texto(dados?.municipio, 200),
    uf: uf(dados?.uf),
    situacao_cadastral: situacao,
  };
}

/**
 * Classifica a resposta da consulta:
 * - ok: dados encontrados;
 * - nao_encontrado: CNPJ válido que não está na base da Receita (404);
 * - nao_suportado: CNPJ alfanumérico recusado pela API (400). O backend já
 *   validou os dígitos verificadores, então só pode ser falta de suporte;
 * - erro: falha definitiva, não adianta tentar de novo;
 * - transitorio: indisponibilidade, limite de taxa ou bloqueio temporário;
 *   vale tentar de novo mais tarde.
 */
export function classificarResposta(status, cnpj) {
  if (status >= 200 && status < 300) return { tipo: 'ok' };
  if (status === 404) return { tipo: 'nao_encontrado', mensagem: 'CNPJ não encontrado na base da Receita Federal' };
  if (status === 400 && /[A-Z]/.test(cnpj)) {
    return { tipo: 'nao_suportado', mensagem: 'A BrasilAPI não aceitou o CNPJ alfanumérico' };
  }
  if ([403, 408, 425, 429].includes(status) || status >= 500) {
    return { tipo: 'transitorio', mensagem: `BrasilAPI indisponível (HTTP ${status})` };
  }
  return { tipo: 'erro', mensagem: `A BrasilAPI recusou a consulta (HTTP ${status})` };
}

/** Milissegundos até a próxima tentativa, ou null se as tentativas acabaram. */
export function esperaAntesDaProxima(tentativas) {
  if (tentativas >= MAX_TENTATIVAS) return null;
  return ESPERAS_MS[Math.max(0, tentativas - 1)] ?? ESPERAS_MS.at(-1);
}
