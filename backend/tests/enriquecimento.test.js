import { describe, expect, it } from 'vitest';
import {
  MAX_TENTATIVAS,
  classificarResposta,
  converterDadosCnpj,
  esperaAntesDaProxima,
} from '../src/utils/enriquecimento.js';

// Trecho real da resposta da BrasilAPI (Banco do Brasil, consultado em 2026-11-20).
const BANCO_DO_BRASIL = {
  uf: 'DF',
  cnpj: '00000000000191',
  porte: 'DEMAIS',
  municipio: 'BRASILIA',
  cnae_fiscal: 6422100,
  codigo_porte: 5,
  razao_social: 'BANCO DO BRASIL SA',
  capital_social: 120000000000,
  situacao_cadastral: 2,
  data_inicio_atividade: '1966-08-01',
  descricao_situacao_cadastral: 'ATIVA',
};

describe('converterDadosCnpj', () => {
  it('converte a resposta real nas colunas do lead', () => {
    expect(converterDadosCnpj(BANCO_DO_BRASIL)).toEqual({
      razao_social: 'BANCO DO BRASIL SA',
      porte: 'DEMAIS',
      capital_social: 120000000000,
      cnae_principal: '6422100',
      data_abertura: '1966-08-01',
      cidade: 'BRASILIA',
      uf: 'DF',
      situacao_cadastral: 'ATIVA',
    });
  });

  it('recompõe o zero inicial do CNAE que vem como número', () => {
    expect(converterDadosCnpj({ cnae_fiscal: 111301 }).cnae_principal).toBe('0111301');
    expect(converterDadosCnpj({ cnae_fiscal: '6201-5/01' }).cnae_principal).toBe('6201501');
    expect(converterDadosCnpj({ cnae_fiscal: 123456789 }).cnae_principal).toBeNull();
  });

  it('campo ausente ou fora do formato vira null, nunca um valor inventado', () => {
    expect(converterDadosCnpj({})).toEqual({
      razao_social: null,
      porte: null,
      capital_social: null,
      cnae_principal: null,
      data_abertura: null,
      cidade: null,
      uf: null,
      situacao_cadastral: null,
    });
    const estranho = converterDadosCnpj({
      razao_social: '   ',
      capital_social: -5,
      data_inicio_atividade: '2024-02-30',
      uf: 'Distrito Federal',
      municipio: 42,
    });
    expect(estranho).toMatchObject({ razao_social: null, capital_social: null, data_abertura: null, uf: null, cidade: null });
  });

  it('capital zero é um dado (não N/A) e texto numérico é aceito', () => {
    expect(converterDadosCnpj({ capital_social: 0 }).capital_social).toBe(0);
    expect(converterDadosCnpj({ capital_social: '1500.555' }).capital_social).toBe(1500.56);
    expect(converterDadosCnpj({ capital_social: 1e15 }).capital_social).toBeNull();
  });

  it('situação pelo código quando a descrição vem vazia; porte "NÃO INFORMADO" é mantido', () => {
    expect(converterDadosCnpj({ situacao_cadastral: 8, descricao_situacao_cadastral: null }).situacao_cadastral).toBe('BAIXADA');
    expect(converterDadosCnpj({ situacao_cadastral: 7 }).situacao_cadastral).toBeNull();
    // O score trata o porte sem pontuação como N/A (seção 8.5).
    expect(converterDadosCnpj({ porte: 'NÃO INFORMADO' }).porte).toBe('NÃO INFORMADO');
  });

  it('normaliza espaços e UF em minúsculas', () => {
    expect(converterDadosCnpj({ razao_social: '  Padaria   Pão  ', uf: 'sp' })).toMatchObject({ razao_social: 'Padaria Pão', uf: 'SP' });
  });
});

describe('classificarResposta', () => {
  it.each([
    [200, '00000000000191', 'ok'],
    [404, '00000000000191', 'nao_encontrado'],
    [404, '12ABC34501DE35', 'nao_encontrado'],
    [400, '12ABC34501DE35', 'nao_suportado'],
    [400, '00000000000191', 'erro'],
    [403, '00000000000191', 'transitorio'],
    [429, '00000000000191', 'transitorio'],
    [500, '00000000000191', 'transitorio'],
    [503, '00000000000191', 'transitorio'],
    [405, '00000000000191', 'erro'],
  ])('HTTP %d com CNPJ %s → %s', (status, cnpj, tipo) => {
    expect(classificarResposta(status, cnpj).tipo).toBe(tipo);
  });
});

describe('esperaAntesDaProxima', () => {
  it('cresce a cada tentativa e acaba na última', () => {
    expect(MAX_TENTATIVAS).toBe(3);
    expect(esperaAntesDaProxima(1)).toBe(30_000);
    expect(esperaAntesDaProxima(2)).toBe(120_000);
    expect(esperaAntesDaProxima(3)).toBeNull();
  });
});
