// Validadores de entrada. Cada um devolve o valor já normalizado ou lança 400.

import { requisicaoInvalida } from './erros.js';

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Validação simples de propósito: a confirmação real do e-mail é feita pelo Supabase Auth.
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export function umDe(valor, opcoes, campo, { padrao } = {}) {
  if ((valor === undefined || valor === null) && padrao !== undefined) return padrao;
  if (!opcoes.includes(valor)) {
    throw requisicaoInvalida(`O campo "${campo}" deve ser um destes: ${opcoes.join(', ')}`);
  }
  return valor;
}
