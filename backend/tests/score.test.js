import { describe, expect, it } from 'vitest';
import {
  calcularEsforco,
  calcularPilar,
  calcularScore,
  faixaDoScore,
  idadeEmAnos,
  pontosDaFaixa,
} from '../src/utils/score.js';
import { mesclarConfigScore } from '../src/utils/configScore.js';

const REFERENCIA = new Date('2026-11-20T12:00:00Z');

const ORGANIZACAO = {
  escala_icp_max: 10,
  escala_midias_max: 100,
  escala_nota_max: 100,
  config_score: { valor: { cnaes_prioritarios: ['6201501'] }, esforco: { ufs_atendidas: ['SP', 'MG'] } },
  updated_at: '2026-11-20T10:00:00Z',
};

// Lead com todos os dados: nada fica N/A.
const COMPLETO = {
  porte: 'DEMAIS',
  capital_social: 2000000,
  data_abertura: '2014-01-10',
  cnae_principal: '6201501',
  uf: 'SP',
  situacao_cadastral: 'ATIVA',
  calculadora_icp: 8,
  calculadora_midias_sociais: 60,
  nome_decisor: 'Carlos',
  numero_decisor: '11999999999',
  redes_sociais: 'instagram.com/x',
  quantidade_redes: 1,
};

const calcular = (lead, organizacao = ORGANIZACAO) => calcularScore(lead, organizacao, { referencia: REFERENCIA });

describe('pontosDaFaixa', () => {
  const faixas = [[10000, 10], [100000, 30], [null, 100]];
  it.each([[0, 10], [9999.99, 10], [10000, 30], [99999, 30], [100000, 100], [1e12, 100]])(
    '%d → %d (limite superior exclusivo)',
    (valor, pontos) => {
      expect(pontosDaFaixa(valor, faixas)).toBe(pontos);
    },
  );
});

describe('idadeEmAnos', () => {
  it('conta anos com fração e nunca fica negativa', () => {
    expect(idadeEmAnos('2016-11-20', REFERENCIA)).toBeCloseTo(10, 1);
    expect(idadeEmAnos('2030-01-01', REFERENCIA)).toBe(0);
    expect(idadeEmAnos('data ruim', REFERENCIA)).toBeNull();
  });
});

describe('calcularPilar', () => {
  it('redistribui o peso do fator N/A entre os disponíveis', () => {
    const pilar = calcularPilar({ a: { pontos: 100 }, b: { na: 'sem dado' }, c: { pontos: 50 } }, { a: 40, b: 35, c: 25 });
    // a: 40/65, c: 25/65 → 100*0,615 + 50*0,385 = 80,77
    expect(pilar.valor).toBe(80.77);
    expect(pilar.parcial).toBe(true);
    expect(pilar.fatores.find((f) => f.fator === 'b')).toMatchObject({ situacao: 'na', contribuicao: 0 });
    expect(pilar.fatores.find((f) => f.fator === 'a').peso_efetivo).toBe(61.54);
  });

  it('fator desligado ou com peso zero não torna o pilar parcial', () => {
    const pilar = calcularPilar(
      { a: { pontos: 80 }, b: { desligado: 'lista vazia' }, c: { na: 'sem dado' } },
      { a: 50, b: 50, c: 0 },
    );
    expect(pilar).toMatchObject({ valor: 80, parcial: false });
  });

  it('sem nenhum fator disponível o pilar é N/A (null), nunca zero', () => {
    const pilar = calcularPilar({ a: { na: 'x' }, b: { na: 'y' } }, { a: 50, b: 50 });
    expect(pilar).toMatchObject({ valor: null, parcial: true });
  });
});

describe('calcularEsforco', () => {
  const config = mesclarConfigScore({ esforco: { ufs_atendidas: ['SP'] } });

  it('soma as penalidades dos dados de contato que faltam', () => {
    const esforco = calcularEsforco({ uf: 'SP', redes_sociais: null, quantidade_redes: 0 }, config);
    expect(esforco.valor).toBe(35 + 25 + 20);
    expect(esforco.parcial).toBe(false);
  });

  it('"@perfil" no texto conta como presença digital', () => {
    const esforco = calcularEsforco({ nome_decisor: 'A', numero_decisor: '1', uf: 'SP', redes_sociais: 'insta: @padaria' }, config);
    expect(esforco.valor).toBe(0);
  });

  it('UF fora da lista penaliza; UF desconhecida não penaliza mas torna parcial', () => {
    const base = { nome_decisor: 'A', numero_decisor: '1', quantidade_redes: 1 };
    expect(calcularEsforco({ ...base, uf: 'RJ' }, config).valor).toBe(20);
    expect(calcularEsforco({ ...base, uf: null }, config)).toMatchObject({ valor: 0, parcial: true });
  });

  it('sem UFs configuradas a penalidade fica desligada', () => {
    const esforco = calcularEsforco({ nome_decisor: 'A', numero_decisor: '1', quantidade_redes: 1, uf: null }, mesclarConfigScore({}));
    expect(esforco).toMatchObject({ valor: 0, parcial: false });
    expect(esforco.penalidades.at(-1).situacao).toBe('desligado');
  });

  it('é limitado a 100', () => {
    const pesado = mesclarConfigScore({ esforco: { sem_numero_decisor: 80, sem_nome_decisor: 80 } });
    expect(calcularEsforco({}, pesado).valor).toBe(100);
  });
});

describe('calcularScore', () => {
  it('lead completo: média geométrica, sem N/A e faixa alta', () => {
    const score = calcular(COMPLETO);
    // valor = 100*0,40 + 85*0,35 + 100*0,15 + 100*0,10 = 94,75
    // probabilidade = (8/10*100)*0,65 + 60*0,35 = 73
    // compensação = √(94,75 × 73) ÷ (1 + 0/100) = 83,17
    expect(score).toMatchObject({
      score_valor: 94.75,
      score_probabilidade: 73,
      score_esforco: 0,
      score_compensacao: 83.17,
      score_parcial: false,
    });
    expect(score.score_detalhes).toMatchObject({ formula: 'media_geometrica', faixa: 'alta', motivos_parcial: [], versao: 1 });
  });

  it('média geométrica mantém a escala e pune desequilíbrio', () => {
    const org = { ...ORGANIZACAO, config_score: { valor: { pesos: { porte: 100, capital_social: 0, idade: 0, cnae: 0 }, porte: { A: 70, B: 100 } } } };
    const base = { ...COMPLETO, calculadora_midias_sociais: null };
    const comPesoSoIcp = { ...org, config_score: { ...org.config_score, probabilidade: { pesos: { icp: 100, midias_sociais: 0 } } } };
    expect(calcular({ ...base, porte: 'A', calculadora_icp: 7 }, comPesoSoIcp).score_compensacao).toBe(70);
    expect(calcular({ ...base, porte: 'B', calculadora_icp: 1 }, comPesoSoIcp).score_compensacao).toBe(31.62);
  });

  it('esforço máximo divide a compensação pela metade', () => {
    const score = calcular({ ...COMPLETO, nome_decisor: null, numero_decisor: null, quantidade_redes: 0, redes_sociais: null, uf: 'RJ' });
    expect(score.score_esforco).toBe(100);
    // √(94,75 × 73) ÷ (1 + 100/100) = 83,166 ÷ 2
    expect(score.score_compensacao).toBe(41.58);
  });

  it('lead sem enriquecimento: valor N/A, compensação só pela probabilidade e parcial', () => {
    const score = calcular({ calculadora_icp: 8, calculadora_midias_sociais: 60, nome_decisor: 'A', numero_decisor: '1', quantidade_redes: 1 });
    expect(score.score_valor).toBeNull();
    expect(score.score_probabilidade).toBe(73);
    expect(score.score_parcial).toBe(true);
    expect(score.score_detalhes.formula).toBe('pilar_unico');
    // UF desconhecida não penaliza: 73 ÷ 1 = 73
    expect(score.score_compensacao).toBe(73);
    expect(score.score_detalhes.motivos_parcial).toContain('Situação cadastral desconhecida');
    expect(score.score_detalhes.motivos_parcial).toContain('Porte desconhecido');
  });

  it('sem valor e sem probabilidade a compensação é N/A (null), nunca zero', () => {
    const score = calcular({});
    expect(score).toMatchObject({ score_valor: null, score_probabilidade: null, score_compensacao: null, score_parcial: true });
    expect(score.score_esforco).toBe(80);
    expect(score.score_detalhes).toMatchObject({ formula: 'na', faixa: 'na' });
  });

  it('fator sem dado não é tratado como zero', () => {
    const semCapital = calcular({ ...COMPLETO, capital_social: null });
    // porte 40, idade 15 e cnae 10 dividem o peso do capital: (100*40 + 100*15 + 100*10) / 65 = 100
    expect(semCapital.score_valor).toBe(100);
    expect(semCapital.score_parcial).toBe(true);
  });

  it('capital zero (padrão da Receita para "não declarado") é N/A, não 10 pontos', () => {
    const score = calcular({ ...COMPLETO, capital_social: 0 });
    const fator = score.score_detalhes.valor.fatores.find((f) => f.fator === 'capital_social');
    expect(fator).toMatchObject({ situacao: 'na', valor_bruto: 0, pontos: null });
    expect(score.score_valor).toBe(100);
    expect(score.score_parcial).toBe(true);
    expect(score.score_detalhes.motivos_parcial).toContain('Capital social não informado na Receita (zero)');
  });

  it('lista de CNAEs vazia desliga o fator sem tornar parcial', () => {
    const score = calcular(COMPLETO, { ...ORGANIZACAO, config_score: { esforco: { ufs_atendidas: ['SP'] } } });
    expect(score.score_parcial).toBe(false);
    expect(score.score_detalhes.valor.fatores.find((f) => f.fator === 'cnae').situacao).toBe('desligado');
    // (100*40 + 85*35 + 100*15) / 90 = 94,17
    expect(score.score_valor).toBe(94.17);
  });

  it('CNAE com máscara e fora da lista', () => {
    expect(calcular({ ...COMPLETO, cnae_principal: '6201-5/01' }).score_detalhes.valor.fatores[3].pontos).toBe(100);
    expect(calcular({ ...COMPLETO, cnae_principal: '4711302' }).score_detalhes.valor.fatores[3].pontos).toBe(0);
  });

  it('porte sem acento ou em minúsculas é reconhecido; porte desconhecido fica N/A', () => {
    expect(calcular({ ...COMPLETO, porte: 'micro  empresa' }).score_detalhes.valor.fatores[0].pontos).toBe(30);
    const score = calcular({ ...COMPLETO, porte: 'NÃO INFORMADO' });
    expect(score.score_detalhes.valor.fatores[0].situacao).toBe('na');
    expect(score.score_parcial).toBe(true);
  });

  it('situação cadastral inativa limita a compensação e fica registrada', () => {
    const score = calcular({ ...COMPLETO, situacao_cadastral: 'BAIXADA' });
    expect(score.score_compensacao).toBe(10);
    expect(score.score_detalhes.compensacao_sem_limite).toBe(83.17);
    expect(score.score_detalhes.limite_situacao).toEqual({ situacao: 'BAIXADA', limite: 10 });
    expect(score.score_detalhes.faixa).toBe('baixa');
  });

  it('nota acima da escala (escala reduzida depois) é limitada a 100', () => {
    const score = calcular({ ...COMPLETO, calculadora_icp: 50 });
    expect(score.score_detalhes.probabilidade.fatores[0].pontos).toBe(100);
  });

  it('valores sempre entre 0 e 100 com 2 casas', () => {
    const score = calcular(COMPLETO);
    for (const campo of ['score_valor', 'score_probabilidade', 'score_esforco', 'score_compensacao']) {
      expect(score[campo]).toBeGreaterThanOrEqual(0);
      expect(score[campo]).toBeLessThanOrEqual(100);
      expect(Number.isInteger(score[campo] * 100)).toBe(true);
    }
  });
});

describe('faixaDoScore', () => {
  const faixas = { alta: 70, media: 40 };
  it.each([[70, 'alta'], [69.99, 'media'], [40, 'media'], [39.99, 'baixa'], [0, 'baixa'], [null, 'na']])(
    '%s → %s',
    (score, faixa) => {
      expect(faixaDoScore(score, faixas)).toBe(faixa);
    },
  );
});
