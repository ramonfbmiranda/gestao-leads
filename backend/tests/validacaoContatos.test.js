// Validadores da revisão 7: contatos do decisor e data das interações.

import { describe, expect, it } from 'vitest';
import { dataHoraOpcional, emailOpcional, normalizarUrlWeb, urlOpcional } from '../src/utils/validacao.js';

function erroDe(funcao) {
  try {
    funcao();
  } catch (erro) {
    return erro;
  }
  throw new Error('Era esperado um erro');
}

describe('emailOpcional', () => {
  it('grava em minúsculas; null ou vazio limpa', () => {
    expect(emailOpcional('  Ana@Exemplo.COM ', 'email_decisor')).toBe('ana@exemplo.com');
    expect(emailOpcional(null, 'email_decisor')).toBeNull();
    expect(emailOpcional('  ', 'email_decisor')).toBeNull();
  });

  it.each([['ana@'], ['ana exemplo.com'], ['a b@c.com'], [5], [`${'a'.repeat(195)}@x.com`]])('recusa %j com 400', (valor) => {
    const erro = erroDe(() => emailOpcional(valor, 'email_decisor', { max: 200 }));
    expect(erro.status).toBe(400);
    expect(erro.message).toContain('email_decisor');
  });
});

describe('normalizarUrlWeb e urlOpcional', () => {
  it('aceita http e https; sem protocolo recebe https://', () => {
    expect(normalizarUrlWeb('https://www.linkedin.com/in/ana-souza')).toBe('https://www.linkedin.com/in/ana-souza');
    expect(normalizarUrlWeb('http://exemplo.com.br')).toBe('http://exemplo.com.br');
    expect(normalizarUrlWeb(' linkedin.com/in/ana ')).toBe('https://linkedin.com/in/ana');
    expect(urlOpcional(null, 'linkedin_decisor')).toBeNull();
  });

  it.each([
    ['javascript:alert(1)'],
    ['mailto:ana@exemplo.com'],
    ['ftp://exemplo.com'],
    ['ana@exemplo.com'],
    ['linkedin'],
    ['linkedin.com/in/ana souza'],
  ])('recusa %j', (valor) => {
    expect(normalizarUrlWeb(valor)).toBeNull();
    expect(erroDe(() => urlOpcional(valor, 'linkedin_decisor')).status).toBe(400);
  });

  it('respeita o tamanho máximo contando o protocolo acrescentado', () => {
    const longa = `exemplo.com/${'a'.repeat(480)}`; // 492 caracteres, 500 com "https://"
    expect(urlOpcional(longa, 'linkedin_decisor', { max: 500 })).toHaveLength(500);
    expect(erroDe(() => urlOpcional(`${longa}a`, 'linkedin_decisor', { max: 500 })).status).toBe(400);
  });
});

describe('dataHoraOpcional', () => {
  it('aceita data ou data e hora com fuso', () => {
    expect(dataHoraOpcional('2026-11-20', 'ocorreu_em').toISOString()).toBe('2026-11-20T00:00:00.000Z');
    expect(dataHoraOpcional('2026-11-20T10:30:00-03:00', 'ocorreu_em').toISOString()).toBe('2026-11-20T13:30:00.000Z');
    expect(dataHoraOpcional('2026-11-20T10:30:00.123Z', 'ocorreu_em').toISOString()).toBe('2026-11-20T10:30:00.123Z');
    expect(dataHoraOpcional(undefined, 'ocorreu_em')).toBeNull();
  });

  it.each([['2026-02-30'], ['2026-13-01'], ['2026-11-20T10:30:00'], ['20/11/2026'], ['ontem'], [1700000000000]])(
    'recusa %j',
    (valor) => {
      expect(erroDe(() => dataHoraOpcional(valor, 'ocorreu_em')).status).toBe(400);
    },
  );
});
