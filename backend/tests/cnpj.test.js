import { describe, expect, it } from 'vitest';
import { calcularDigitosVerificadores, cnpjValido, formatarCnpj, normalizarCnpj } from '../src/utils/cnpj.js';

// Exemplo oficial da Receita Federal para o CNPJ alfanumérico: 12.ABC.345/01DE-35.
const ALFANUMERICO = '12ABC34501DE35';
const NUMERICO = '11222333000181';

describe('normalizarCnpj', () => {
  it('remove a máscara e converte para maiúsculas', () => {
    expect(normalizarCnpj('12.abc.345/01de-35')).toBe(ALFANUMERICO);
    expect(normalizarCnpj(' 11.222.333/0001-81 ')).toBe(NUMERICO);
  });

  it('devolve os zeros iniciais perdidos pela planilha (11 a 13 dígitos)', () => {
    expect(normalizarCnpj(1222333000181)).toBe('01222333000181');
    expect(normalizarCnpj('191000000191')).toBe('00191000000191');
  });

  it('não completa valores curtos', () => {
    expect(normalizarCnpj('191')).toBe('191');
  });

  it('valores que não são texto nem número viram vazio', () => {
    expect(normalizarCnpj(null)).toBe('');
    expect(normalizarCnpj(undefined)).toBe('');
    expect(normalizarCnpj({})).toBe('');
  });
});

describe('calcularDigitosVerificadores', () => {
  it('calcula os dígitos do exemplo alfanumérico oficial', () => {
    expect(calcularDigitosVerificadores('12ABC34501DE')).toBe('35');
  });

  it('calcula os dígitos de um CNPJ numérico', () => {
    expect(calcularDigitosVerificadores('112223330001')).toBe('81');
  });

  it('recusa base com tamanho ou caracteres inválidos', () => {
    expect(() => calcularDigitosVerificadores('12ABC')).toThrow();
    expect(() => calcularDigitosVerificadores('12abc34501de')).toThrow();
  });
});

describe('cnpjValido', () => {
  it.each([[ALFANUMERICO], [NUMERICO], ['00000000000191']])('aceita %s', (cnpj) => {
    expect(cnpjValido(cnpj)).toBe(true);
  });

  it.each([
    ['12ABC34501DE36', 'dígito verificador errado'],
    ['11222333000180', 'dígito verificador errado (numérico)'],
    ['12ABC34501DEAB', 'dígito verificador com letra'],
    ['12abc34501de35', 'minúsculas (não normalizado)'],
    ['12.ABC.345/01DE-35', 'com máscara (não normalizado)'],
    ['12ABC34501DE3', 'curto'],
    ['00000000000000', 'sequência repetida'],
    ['AAAAAAAAAAAAAA', 'sequência repetida de letras'],
    ['', 'vazio'],
  ])('recusa %s (%s)', (cnpj) => {
    expect(cnpjValido(cnpj)).toBe(false);
  });

  it('recusa o que não é texto', () => {
    expect(cnpjValido(11222333000181)).toBe(false);
    expect(cnpjValido(null)).toBe(false);
  });
});

describe('formatarCnpj', () => {
  it('aplica a máscara', () => {
    expect(formatarCnpj(ALFANUMERICO)).toBe('12.ABC.345/01DE-35');
    expect(formatarCnpj(NUMERICO)).toBe('11.222.333/0001-81');
  });
});
