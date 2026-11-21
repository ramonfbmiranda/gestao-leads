// Validadores de entrada. Cada um devolve o valor já normalizado ou lança 400.

import { cnpjValido, normalizarCnpj } from './cnpj.js';
import { requisicaoInvalida } from './erros.js';

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Validação simples de propósito: a confirmação real do e-mail é feita pelo Supabase Auth.
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_HOST = /^([a-z0-9-]+\.)+[a-z]{2,}$/;
// Data (AAAA-MM-DD) ou data e hora com fuso (Z ou ±HH:MM), para não depender do fuso do servidor.
const REGEX_DATA_HORA = /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2}))?$/i;

export function ehUuid(valor) {
  return typeof valor === 'string' && REGEX_UUID.test(valor);
}

export function corpoObjeto(corpo) {
  if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw requisicaoInvalida('O corpo da requisição deve ser um objeto JSON');
  }
  return corpo;
}

export function textoObrigatorio(valor, campo, { max = 200 } = {}) {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw requisicaoInvalida(`O campo "${campo}" é obrigatório`);
  }
  const texto = valor.trim();
  if (texto.length > max) {
    throw requisicaoInvalida(`O campo "${campo}" deve ter no máximo ${max} caracteres`);
  }
  return texto;
}

export function textoOpcional(valor, campo, { max = 200 } = {}) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') {
    throw requisicaoInvalida(`O campo "${campo}" deve ser um texto`);
  }
  const texto = valor.trim();
  if (texto === '') return null;
  if (texto.length > max) {
    throw requisicaoInvalida(`O campo "${campo}" deve ter no máximo ${max} caracteres`);
  }
  return texto;
}

export function emailValido(valor, campo = 'email') {
  const email = textoObrigatorio(valor, campo, { max: 254 }).toLowerCase();
  if (!REGEX_EMAIL.test(email)) {
    throw requisicaoInvalida(`O campo "${campo}" deve ser um e-mail válido`);
  }
  return email;
}

/** E-mail em minúsculas, ou null se o texto não parece um e-mail. */
export function normalizarEmail(texto) {
  const email = String(texto).trim().toLowerCase();
  return REGEX_EMAIL.test(email) ? email : null;
}

/**
 * Endereço web http ou https. Sem protocolo, recebe "https://"
 * ("linkedin.com/in/ana" → "https://linkedin.com/in/ana"). null se não for um endereço web.
 */
export function normalizarUrlWeb(texto) {
  const limpo = String(texto).trim();
  if (limpo === '' || /\s/.test(limpo)) return null;
  const comProtocolo = /^https?:\/\//i.test(limpo) ? limpo : `https://${limpo}`;
  let url;
  try {
    url = new URL(comProtocolo);
  } catch {
    return null;
  }
  // "mailto:a@b.com" vira usuário da URL; "javascript:..." não tem domínio.
  if (url.username || url.password || !REGEX_HOST.test(url.hostname)) return null;
  return comProtocolo;
}

/** E-mail opcional (null ou vazio limpa o campo), gravado em minúsculas. */
export function emailOpcional(valor, campo, { max = 200 } = {}) {
  const texto = textoOpcional(valor, campo, { max });
  if (texto === null) return null;
  const email = normalizarEmail(texto);
  if (!email) throw requisicaoInvalida(`O campo "${campo}" deve ser um e-mail válido`);
  return email;
}

/** Endereço web opcional (null ou vazio limpa o campo). */
export function urlOpcional(valor, campo, { max = 500 } = {}) {
  const texto = textoOpcional(valor, campo, { max });
  if (texto === null) return null;
  const url = normalizarUrlWeb(texto);
  if (!url || url.length > max) {
    throw requisicaoInvalida(`O campo "${campo}" deve ser um endereço web (http ou https) com até ${max} caracteres`);
  }
  return url;
}

/** Data e hora ISO opcional → Date. Datas impossíveis (ex.: 30 de fevereiro) são recusadas. */
export function dataHoraOpcional(valor, campo) {
  if (valor === undefined || valor === null) return null;
  const erro = requisicaoInvalida(
    `O campo "${campo}" deve ser uma data ISO (AAAA-MM-DD ou AAAA-MM-DDTHH:MM:SS com fuso, ex.: Z)`,
  );
  const partes = typeof valor === 'string' ? REGEX_DATA_HORA.exec(valor.trim()) : null;
  if (!partes) throw erro;
  const [ano, mes, dia] = partes.slice(1, 4).map(Number);
  const calendario = new Date(Date.UTC(ano, mes - 1, dia));
  if (calendario.getUTCMonth() !== mes - 1 || calendario.getUTCDate() !== dia) throw erro;
  const data = new Date(valor.trim());
  if (Number.isNaN(data.getTime())) throw erro;
  return data;
}

export function umDe(valor, opcoes, campo, { padrao } = {}) {
  if ((valor === undefined || valor === null) && padrao !== undefined) return padrao;
  if (!opcoes.includes(valor)) {
    throw requisicaoInvalida(`O campo "${campo}" deve ser um destes: ${opcoes.join(', ')}`);
  }
  return valor;
}

/** CNPJ com ou sem máscara → 14 caracteres normalizados, com dígitos verificadores conferidos. */
export function cnpjObrigatorio(valor, campo = 'cnpj') {
  if (valor === undefined || valor === null || valor === '') {
    throw requisicaoInvalida(`O campo "${campo}" é obrigatório`);
  }
  const cnpj = normalizarCnpj(valor);
  if (!cnpjValido(cnpj)) throw requisicaoInvalida('CNPJ inválido');
  return cnpj;
}

/** Texto obrigatório com espaços internos repetidos reduzidos a um ("Ana  Souza" → "Ana Souza"). */
export function nomeNormalizado(valor, campo, opcoes) {
  return textoObrigatorio(valor, campo, opcoes).replace(/\s+/g, ' ');
}

// Maior valor de uma coluna numeric(10,2).
const MAXIMO_NUMERIC_10_2 = 99999999.99;

/** Número (ou null para limpar o campo) dentro do intervalo. */
export function numeroOpcional(valor, campo, { min = 0, max = MAXIMO_NUMERIC_10_2 } = {}) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < min || valor > max) {
    throw requisicaoInvalida(`O campo "${campo}" deve ser um número entre ${min} e ${max}`);
  }
  return valor;
}

/** Escala máxima de uma calculadora: número maior que zero. */
export function escalaValida(valor, campo) {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0 || valor > MAXIMO_NUMERIC_10_2) {
    throw requisicaoInvalida(`O campo "${campo}" deve ser um número maior que zero`);
  }
  return valor;
}

/** Inteiro vindo da query string (ex.: ?pagina=2). */
export function inteiroDaConsulta(valor, campo, { padrao, min, max }) {
  if (valor === undefined || valor === '') return padrao;
  if (typeof valor !== 'string' || !/^\d+$/.test(valor) || Number(valor) < min || Number(valor) > max) {
    throw requisicaoInvalida(`O parâmetro "${campo}" deve ser um número inteiro entre ${min} e ${max}`);
  }
  return Number(valor);
}

/** Opção vinda da query string; repetida (?status=a&status=b) é recusada. */
export function opcaoDaConsulta(valor, opcoes, campo, { padrao } = {}) {
  if (valor === undefined || valor === '') return padrao;
  if (typeof valor !== 'string' || !opcoes.includes(valor)) {
    throw requisicaoInvalida(`O parâmetro "${campo}" deve ser um destes: ${opcoes.join(', ')}`);
  }
  return valor;
}
