// CNPJ alfanumérico (especificação, seção 4.1): 12 caracteres [0-9A-Z] seguidos
// de 2 dígitos verificadores numéricos. O CNPJ numérico antigo é um caso
// particular do mesmo formato e passa pelas mesmas regras.

const REGEX_FORMATO = /^[0-9A-Z]{12}[0-9]{2}$/;
const REGEX_REPETIDO = /^(.)\1{13}$/;
const PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * Remove a máscara (pontos, barra, hífen e espaços) e converte para maiúsculas.
 * Planilhas costumam perder os zeros iniciais de CNPJs numéricos
 * (01222333000181 vira 1222333000181), então de 11 a 13 dígitos recebem zeros à
 * esquerda. Valores mais curtos não: "191" não deve virar um CNPJ válido.
 */
export function normalizarCnpj(valor) {
  if (typeof valor !== 'string' && typeof valor !== 'number') return '';
  const texto = String(valor).replace(/[\s./-]/g, '').toUpperCase();
  return /^\d{11,13}$/.test(texto) ? texto.padStart(14, '0') : texto;
}

// Cada caractere vale "código ASCII − 48": '0'..'9' valem 0..9 e 'A' vale 17.
function digitoVerificador(caracteres, pesos) {
  const soma = pesos.reduce((total, peso, i) => total + (caracteres.charCodeAt(i) - 48) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Calcula os 2 dígitos verificadores a partir dos 12 primeiros caracteres. */
export function calcularDigitosVerificadores(base) {
  if (!/^[0-9A-Z]{12}$/.test(base)) throw new Error('Base do CNPJ deve ter 12 caracteres [0-9A-Z]');
  const dv1 = digitoVerificador(base, PESOS_DV1);
  const dv2 = digitoVerificador(base + dv1, PESOS_DV2);
  return `${dv1}${dv2}`;
}

/** Confere formato, sequência repetida e dígitos verificadores (já normalizado). */
export function cnpjValido(cnpj) {
  if (typeof cnpj !== 'string' || !REGEX_FORMATO.test(cnpj) || REGEX_REPETIDO.test(cnpj)) {
    return false;
  }
  return calcularDigitosVerificadores(cnpj.slice(0, 12)) === cnpj.slice(12);
}

/** Formata para exibição: 12.ABC.345/01DE-35. */
export function formatarCnpj(cnpj) {
  const valor = normalizarCnpj(cnpj);
  if (valor.length !== 14) return valor;
  return `${valor.slice(0, 2)}.${valor.slice(2, 5)}.${valor.slice(5, 8)}/${valor.slice(8, 12)}-${valor.slice(12)}`;
}
