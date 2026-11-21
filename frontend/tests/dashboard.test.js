import { describe, expect, it } from 'vitest';
import {
  faixaDoBloco,
  formatarParte,
  intervaloDaFaixa,
  linhasDeConversao,
  partesDaCarteira,
  rotuloDoBloco,
  textoDaMudanca,
} from '../src/utils/dashboard.js';

const LIMITES = { alta: 70, media: 40 };

describe('dashboard', () => {
  it('partesDaCarteira soma as quatro faixas e calcula a parte de cada uma', () => {
    const partes = partesDaCarteira({ alta: 46, media: 104, baixa: 76, na: 22 });
    expect(partes.map((p) => p.faixa)).toEqual(['alta', 'media', 'baixa', 'na']);
    expect(partes[0]).toEqual({ faixa: 'alta', total: 46, parte: 46 / 248 });
    expect(partes.reduce((soma, p) => soma + p.parte, 0)).toBeCloseTo(1);
  });

  it('partesDaCarteira sem leads não divide por zero', () => {
    expect(partesDaCarteira({}).every((p) => p.total === 0 && p.parte === 0)).toBe(true);
  });

  it('formatarParte arredonda e marca o que é quase zero', () => {
    expect(formatarParte(0.1855)).toBe('19%');
    expect(formatarParte(0)).toBe('0%');
    expect(formatarParte(0.002)).toBe('<1%');
    expect(formatarParte(1)).toBe('100%');
  });

  it('intervaloDaFaixa segue os limites, com vírgula', () => {
    expect(intervaloDaFaixa('alta', LIMITES)).toBe('70 a 100');
    expect(intervaloDaFaixa('media', { alta: 65.5, media: 40 })).toBe('40 a 65,5');
    expect(intervaloDaFaixa('baixa', LIMITES)).toBe('abaixo de 40');
    expect(intervaloDaFaixa('na', LIMITES)).toBe('sem dados');
  });

  it('faixaDoBloco usa o meio do bloco', () => {
    expect(faixaDoBloco(30, LIMITES)).toBe('baixa');
    expect(faixaDoBloco(40, LIMITES)).toBe('media');
    expect(faixaDoBloco(60, { alta: 65, media: 40 })).toBe('alta');
    expect(faixaDoBloco(90, LIMITES)).toBe('alta');
    expect(rotuloDoBloco(90)).toBe('90 a 100');
  });

  it('textoDaMudanca traduz o campo e suaviza as maiúsculas da Receita', () => {
    expect(textoDaMudanca({ campo: 'situacao_cadastral', de: 'ATIVA', para: 'BAIXADA' })).toBe('Situação: Ativa → Baixada');
    expect(textoDaMudanca({ campo: 'porte', de: null, para: 'DEMAIS' })).toBe('Porte: — → Demais');
  });

  it('linhasDeConversao mostra só as faixas com desfecho', () => {
    const linhas = linhasDeConversao({
      alta: { convertidos: 12, descartados: 17, taxa: 0.4138 },
      media: { convertidos: 0, descartados: 0, taxa: null },
      baixa: { convertidos: 0, descartados: 3, taxa: 0 },
      na: { convertidos: 0, descartados: 0, taxa: null },
    });
    expect(linhas).toEqual([
      { faixa: 'alta', convertidos: 12, total: 29, taxa: 0.4138 },
      { faixa: 'baixa', convertidos: 0, total: 3, taxa: 0 },
    ]);
  });
});
