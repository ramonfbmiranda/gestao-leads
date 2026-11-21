import { describe, expect, it } from 'vitest';
import { lerAmbiente } from '../src/config/ambiente.js';
import { faixaDoPotencial, formatarCnpj, formatarMoeda, formatarNumero } from '../src/utils/formatos.js';
import { resolverTema } from '../src/utils/tema.js';

describe('formatarCnpj', () => {
  it.each([
    ['12ABC34501DE35', '12.ABC.345/01DE-35'],
    ['11222333000181', '11.222.333/0001-81'],
    ['12.abc.345/01de-35', '12.ABC.345/01DE-35'],
    ['123', '123'],
    [null, ''],
  ])('%s → %s', (entrada, saida) => {
    expect(formatarCnpj(entrada)).toBe(saida);
  });
});

describe('formatarNumero e formatarMoeda', () => {
  it('usa vírgula e mostra N/A para nulo', () => {
    expect(formatarNumero(47.11)).toBe('47,1');
    expect(formatarNumero(77.35, 2)).toBe('77,35');
    expect(formatarNumero(null)).toBe('N/A');
    expect(formatarMoeda(9282).replace(/\s/g, ' ')).toBe('R$ 9.282');
  });
});

describe('faixaDoPotencial', () => {
  it.each([
    [70, 'alta', 'Alto', 3],
    [69.99, 'media', 'Médio', 2],
    [40, 'media', 'Médio', 2],
    [39.9, 'baixa', 'Baixo', 1],
    [null, 'na', 'N/A', 0],
  ])('%s → %s', (valor, faixa, rotulo, barras) => {
    expect(faixaDoPotencial(valor)).toEqual({ faixa, rotulo, barras });
  });

  it('respeita os limites da organização', () => {
    expect(faixaDoPotencial(72, { alta: 75, media: 50 }).faixa).toBe('media');
  });
});

describe('resolverTema', () => {
  it('a escolha guardada vence; sem escolha, segue o sistema', () => {
    expect(resolverTema('claro', true)).toBe('claro');
    expect(resolverTema('escuro', false)).toBe('escuro');
    expect(resolverTema(null, true)).toBe('escuro');
    expect(resolverTema('outro', false)).toBe('claro');
  });
});

describe('lerAmbiente', () => {
  const completo = { VITE_API_URL: 'http://localhost:3000/', VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' };

  it('lê as variáveis e tira a barra final da API', () => {
    expect(lerAmbiente(completo).ambiente).toEqual({
      apiUrl: 'http://localhost:3000',
      supabaseUrl: 'https://x.supabase.co',
      supabaseChavePublica: 'sb_publishable_x',
    });
  });

  it('aponta o que falta', () => {
    expect(lerAmbiente({ ...completo, VITE_SUPABASE_PUBLISHABLE_KEY: ' ' }).faltando).toEqual(['VITE_SUPABASE_PUBLISHABLE_KEY']);
  });
});
