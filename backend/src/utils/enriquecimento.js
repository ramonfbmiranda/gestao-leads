// Funções puras do enriquecimento por CNPJ (especificação, seções 9 e 9.1):
// conversão da resposta da BrasilAPI para as colunas do lead, mudanças na
// Receita, classificação das respostas HTTP e espera entre tentativas.

export const MAX_TENTATIVAS = 3;
export const MAX_SOCIOS = 20;

// Espera antes da 2ª e da 3ª tentativa (a 3ª falha vira erro).
const ESPERAS_MS = [30_000, 120_000];

// A BrasilAPI repassa os dados da Minha Receita, que traz a descrição pelo
// código. Usada só se a descrição vier vazia.
const SITUACOES = { 1: 'NULA', 2: 'ATIVA', 3: 'SUSPENSA', 4: 'INAPTA', 8: 'BAIXADA' };

// numeric(16,2) no banco.
const CAPITAL_MAXIMO = 99_999_999_999_999.99;

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Campos cuja mudança é registrada em ultima_mudanca_receita.
const CAMPOS_MONITORADOS = ['situacao_cadastral', 'porte'];

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

// Vem como "1123851939" (DDD + número); a máscara, se houver, é removida.
function telefone(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  return /^[0-9]{8,15}$/.test(digitos) ? digitos : null;
}

function email(valor) {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim().toLowerCase();
  return limpo.length <= 200 && REGEX_EMAIL.test(limpo) ? limpo : null;
}

// Do quadro societário só saem nome e qualificação: CPF, faixa etária e os
// demais campos nunca são gravados (LGPD).
function socios(qsa) {
  if (!Array.isArray(qsa)) return null;
  const lista = qsa
    .map((socio) => ({ nome: texto(socio?.nome_socio, 200), qualificacao: texto(socio?.qualificacao_socio, 200) }))
    .filter((socio) => socio.nome !== null)
    .slice(0, MAX_SOCIOS);
  return lista.length > 0 ? lista : null;
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
    // O segundo telefone só entra se o primeiro vier vazio (ou inválido).
    telefone_receita: telefone(dados?.ddd_telefone_1) ?? telefone(dados?.ddd_telefone_2),
    email_receita: email(dados?.email),
    socios: socios(dados?.qsa),
  };
}

/**
 * Mudanças de situação cadastral e porte entre o lead gravado e uma consulta
 * nova: [{ campo, de, para }]. Só conta para lead já enriquecido antes, e
 * valor ausente em um dos lados não é mudança (a resposta só não trouxe o campo).
 */
export function mudancasNaReceita(anterior, novos) {
  if (!anterior?.enriquecido_em) return [];
  return CAMPOS_MONITORADOS.filter((campo) => {
    const de = anterior[campo] ?? null;
    const para = novos?.[campo] ?? null;
    return de !== null && para !== null && de !== para;
  }).map((campo) => ({ campo, de: anterior[campo], para: novos[campo] }));
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
