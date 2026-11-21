import { describe, expect, it } from 'vitest';
import {
  calcularEsforco,
  calcularPerfilIdeal,
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
  config_score: { perfil_ideal: { setores: ['6201501'] }, esforco: { ufs_atendidas: ['SP', 'MG'] } },
  updated_at: '2026-11-20T10:00:00Z',
};

const AVALIACAO_COMPLETA = {
  respostas: {
    orcamento: 'confirmado', // 100, peso 30
    decisor: 'sim', // 100, peso 25
    necessidade: 'alguma', // 60, peso 30
    prazo: 'ate_3_meses', // 70, peso 15
    perfil_ativo: 'sim', // 100, peso 30
    frequencia: 'nao', // 0, peso 25
    site: 'sim', // 100, peso 25
    anuncios: 'nao', // 0, peso 20
    origem_contato: 'indicacao', // +5 no esforço
  },
};

// Lead com todos os dados: nada fica N/A.
const COMPLETO = {
  porte: 'DEMAIS',
  capital_social: 2000000,
  data_abertura: '2014-01-10',
  cnae_principal: '6201501',
  uf: 'SP',
  situacao_cadastral: 'ATIVA',
  enriquecido_em: '2026-11-19T10:00:00Z',
  calculadora_icp: 8,
  calculadora_midias_sociais: 60,
  nome_decisor: 'Carlos',
  numero_decisor: '11999999999',
  redes_sociais: 'instagram.com/x',
  quantidade_redes: 1,
  avaliacao: AVALIACAO_COMPLETA,
  tentativas_sem_resposta: 0,
};

const calcular = (lead, organizacao = ORGANIZACAO, opcoes = {}) =>
  calcularScore(lead, organizacao, { referencia: REFERENCIA, ...opcoes });
const fator = (score, pilar, nome) => score.score_detalhes[pilar].fatores.find((f) => f.fator === nome);
const penalidadeDe = (esforco, nome) => esforco.penalidades.find((p) => p.penalidade === nome);

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
    const pilar = calcularPilar({ porte: { pontos: 100 }, idade: { na: 'sem dado' }, capital_social: { pontos: 50 } }, { porte: 40, idade: 35, capital_social: 25 });
    // porte: 40/65, capital: 25/65 → 100*0,615 + 50*0,385 = 80,77
    expect(pilar.valor).toBe(80.77);
    expect(pilar.parcial).toBe(true);
    expect(pilar.fatores.find((f) => f.fator === 'idade')).toMatchObject({ situacao: 'na', contribuicao: 0 });
    expect(pilar.fatores.find((f) => f.fator === 'porte').peso_efetivo).toBe(61.54);
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

  it('N/A interno de um fator disponível torna o pilar parcial sem derrubar o fator', () => {
    const pilar = calcularPilar({ a: { pontos: 60, motivos: ['1 pergunta sem resposta'] } }, { a: 100 });
    expect(pilar).toMatchObject({ valor: 60, parcial: true, motivos_internos: ['1 pergunta sem resposta'] });
  });
});

describe('calcularEsforco', () => {
  const config = mesclarConfigScore({ esforco: { ufs_atendidas: ['SP'] } });
  const contato = (lead) => penalidadeDe(calcularEsforco({ nome_decisor: 'A', quantidade_redes: 1, uf: 'SP', ...lead }, config), 'contato_decisor');

  it('sem nenhum dado de contato soma contato, nome e redes; relacionamento sem resposta deixa parcial', () => {
    const esforco = calcularEsforco({ uf: 'SP', quantidade_redes: 0 }, config);
    expect(esforco.valor).toBe(35 + 25 + 20);
    expect(esforco.parcial).toBe(true);
    expect(penalidadeDe(esforco, 'relacionamento:origem_contato').situacao).toBe('na');
  });

  it('o melhor canal de contato reduz a penalidade do decisor', () => {
    expect(contato({ numero_decisor: '1' }).pontos).toBe(0);
    expect(contato({ email_decisor: 'a@b.com' }).pontos).toBe(14); // 35 × 40%
    expect(contato({ linkedin_decisor: 'https://linkedin.com/in/a' }).pontos).toBe(21); // 35 × 60%
    expect(contato({ telefone_receita: '1133334444' }).pontos).toBe(28); // 35 × 80%
    const doisCanais = contato({ email_decisor: 'a@b.com', telefone_receita: '1133334444' });
    expect(doisCanais).toMatchObject({ pontos: 14, situacao: 'aplicada' });
    expect(doisCanais.detalhe).toContain('e-mail do decisor');
  });

  it('decisor provável pela Receita reduz a penalidade de nome pela metade', () => {
    const socios = [{ nome: 'Ana Lima', qualificacao: 'Sócio-Administrador' }];
    const nome = penalidadeDe(calcularEsforco({ numero_decisor: '1', quantidade_redes: 1, uf: 'SP', socios }, config), 'sem_nome_decisor');
    expect(nome).toMatchObject({ pontos: 12.5, aplicada: true });
    expect(nome.detalhe).toContain('Ana Lima');
  });

  it('relacionamento soma os pontos da resposta; "não sei" fica N/A', () => {
    const base = { nome_decisor: 'A', numero_decisor: '1', quantidade_redes: 1, uf: 'SP' };
    expect(calcularEsforco({ ...base, avaliacao: { respostas: { origem_contato: 'frio' } } }, config)).toMatchObject({ valor: 20, parcial: false });
    expect(calcularEsforco({ ...base, avaliacao: { respostas: { origem_contato: 'nao_sei' } } }, config)).toMatchObject({ valor: 0, parcial: true });
  });

  it('tentativas sem resposta penalizam além das toleradas, até o máximo', () => {
    const base = { nome_decisor: 'A', numero_decisor: '1', quantidade_redes: 1, uf: 'SP', avaliacao: { respostas: { origem_contato: 'ex_cliente' } } };
    const pontos = (n) => penalidadeDe(calcularEsforco({ ...base, tentativas_sem_resposta: n }, config), 'tentativas_sem_resposta').pontos;
    expect(pontos(2)).toBe(0);
    expect(pontos(5)).toBe(15); // (5 − 2) × 5
    expect(pontos(40)).toBe(30);
  });

  it('"@perfil" no texto conta como presença digital', () => {
    const esforco = calcularEsforco({ nome_decisor: 'A', numero_decisor: '1', uf: 'SP', redes_sociais: 'insta: @padaria' }, config);
    expect(penalidadeDe(esforco, 'sem_redes_sociais').aplicada).toBe(false);
  });

  it('UF fora da lista penaliza; UF desconhecida não penaliza mas torna parcial; sem lista fica desligada', () => {
    const base = { nome_decisor: 'A', numero_decisor: '1', quantidade_redes: 1, avaliacao: { respostas: { origem_contato: 'ex_cliente' } } };
    expect(calcularEsforco({ ...base, uf: 'RJ' }, config).valor).toBe(20);
    expect(calcularEsforco({ ...base, uf: null }, config)).toMatchObject({ valor: 0, parcial: true });
    const semLista = calcularEsforco({ ...base, uf: null }, mesclarConfigScore({}));
    expect(semLista).toMatchObject({ valor: 0, parcial: false });
    expect(penalidadeDe(semLista, 'fora_ufs_atendidas').situacao).toBe('desligado');
  });

  it('é limitado a 100', () => {
    const pesado = mesclarConfigScore({ esforco: { contato_decisor: 80, sem_nome_decisor: 80 } });
    expect(calcularEsforco({}, pesado).valor).toBe(100);
  });
});

describe('calcularPerfilIdeal', () => {
  it('sem critérios ligados o perfil não está configurado', () => {
    expect(calcularPerfilIdeal(COMPLETO, mesclarConfigScore({}), REFERENCIA).configurado).toBe(false);
  });

  it('média ponderada de setor, porte e idade (idade proporcional abaixo do mínimo)', () => {
    const config = mesclarConfigScore({ perfil_ideal: { setores: ['6201501'], portes: ['MICRO EMPRESA'], idade_minima: 4 } });
    const perfil = calcularPerfilIdeal({ cnae_principal: '6201-5/01', porte: 'DEMAIS', data_abertura: '2024-11-20' }, config, REFERENCIA);
    // setor 100 (50), porte 0 (30), idade 2/4 = 50 (20) → 50 + 0 + 10 = 60
    expect(perfil).toMatchObject({ configurado: true, valor: 60, parcial: false });
  });

  it('lead sem dados da Receita deixa os critérios N/A', () => {
    const config = mesclarConfigScore({ perfil_ideal: { setores: ['6201501'] } });
    expect(calcularPerfilIdeal({}, config, REFERENCIA)).toMatchObject({ configurado: true, valor: null });
  });
});

describe('calcularScore', () => {
  it('lead completo: média geométrica, sem N/A, confiança total e faixa alta', () => {
    const score = calcular(COMPLETO);
    // valor = 100*0,45 + 85*0,40 + 100*0,15 = 94
    // icp (perfil ideal, só setor ligado) = 100
    // qualificação = 100*0,30 + 100*0,25 + 60*0,30 + 70*0,15 = 83,5
    // mídias (avaliação) = 100*0,30 + 0 + 100*0,25 + 0 = 55
    // probabilidade = 100*0,35 + 83,5*0,40 + 55*0,25 = 82,15
    // esforço = indicação +5
    // compensação = √(94 × 82,15) ÷ 1,05 = 83,69
    expect(score).toMatchObject({
      score_valor: 94,
      score_probabilidade: 82.15,
      score_esforco: 5,
      score_compensacao: 83.69,
      score_confianca: 100,
      score_parcial: false,
    });
    expect(score.score_detalhes).toMatchObject({ formula: 'media_geometrica', faixa: 'alta', motivos_parcial: [], versao: 2 });
    expect(score.score_detalhes.confianca).toEqual({ valor: 100, com_dado: 13, total: 13 });
  });

  it('registra a origem de cada fator e os itens que o formaram', () => {
    const score = calcular(COMPLETO);
    expect(fator(score, 'probabilidade', 'icp')).toMatchObject({ origem: 'sistema', pontos: 100 });
    expect(fator(score, 'probabilidade', 'qualificacao')).toMatchObject({ origem: 'avaliacao', pontos: 83.5 });
    expect(fator(score, 'probabilidade', 'qualificacao').itens).toHaveLength(4);
    expect(fator(score, 'probabilidade', 'qualificacao').itens[0]).toMatchObject({ id: 'orcamento', resposta: 'Sim, confirmado', pontos: 100, peso: 30 });
    // O checklist de mídias prevalece sobre a nota 60 da planilha.
    expect(fator(score, 'probabilidade', 'midias_sociais')).toMatchObject({ origem: 'avaliacao', pontos: 55 });
  });

  it('sem perfil ideal e sem avaliação, usa as notas da planilha como antes', () => {
    const org = { ...ORGANIZACAO, config_score: { esforco: { ufs_atendidas: ['SP'] } } };
    const score = calcular({ ...COMPLETO, avaliacao: null }, org);
    expect(fator(score, 'probabilidade', 'icp')).toMatchObject({ origem: 'planilha', pontos: 80 });
    expect(fator(score, 'probabilidade', 'midias_sociais')).toMatchObject({ origem: 'planilha', pontos: 60 });
    expect(fator(score, 'probabilidade', 'qualificacao').situacao).toBe('na');
    // icp 80 (35) e mídias 60 (25), qualificação redistribuída: (2800 + 1500) / 60 = 71,67
    expect(score.score_probabilidade).toBe(71.67);
    expect(score.score_parcial).toBe(true);
    expect(score.score_detalhes.motivos_parcial).toContain('Lead ainda não avaliado (qualificação)');
  });

  it('perfil ideal configurado mas sem dados da Receita cai para a nota da planilha', () => {
    const score = calcular({ calculadora_icp: 6, nome_decisor: 'A', numero_decisor: '1', quantidade_redes: 1 });
    expect(fator(score, 'probabilidade', 'icp')).toMatchObject({ origem: 'planilha', pontos: 60 });
  });

  it('"não sei" na qualificação tira a pergunta da conta e deixa o score parcial', () => {
    const avaliacao = { respostas: { ...AVALIACAO_COMPLETA.respostas, orcamento: 'nao_sei' } };
    const score = calcular({ ...COMPLETO, avaliacao });
    // (100*25 + 60*30 + 70*15) / 70 = 76,43
    expect(fator(score, 'probabilidade', 'qualificacao').pontos).toBe(76.43);
    expect(score.score_parcial).toBe(true);
    expect(score.score_detalhes.motivos_parcial).toContain('Qualificação: 1 pergunta(s) sem resposta');
  });

  it('resposta de pergunta que saiu do modelo é ignorada', () => {
    const avaliacao = { respostas: { ...AVALIACAO_COMPLETA.respostas, pergunta_antiga: 'x' } };
    expect(calcular({ ...COMPLETO, avaliacao }).score_compensacao).toBe(83.69);
  });

  it('esforço máximo divide a compensação pela metade', () => {
    const avaliacao = { respostas: { ...AVALIACAO_COMPLETA.respostas, origem_contato: 'frio' } };
    const org = { ...ORGANIZACAO, config_score: { ...ORGANIZACAO.config_score, esforco: { ufs_atendidas: ['SP'], contato_decisor: 60 } } };
    const score = calcular({ ...COMPLETO, avaliacao, nome_decisor: null, numero_decisor: null, quantidade_redes: 0, redes_sociais: null }, org);
    // 60 + 25 + 20 + 20 = 125 → limitado a 100
    expect(score.score_esforco).toBe(100);
    // √(94 × 82,15) ÷ 2 = 43,94
    expect(score.score_compensacao).toBe(43.94);
  });

  it('sem valor e sem probabilidade a compensação é N/A (null), nunca zero', () => {
    const score = calcular({});
    expect(score).toMatchObject({ score_valor: null, score_probabilidade: null, score_compensacao: null, score_parcial: true });
    expect(score.score_esforco).toBe(80);
    expect(score.score_detalhes).toMatchObject({ formula: 'na', faixa: 'na' });
  });

  it('capital zero (padrão da Receita para "não declarado") é N/A, não 10 pontos', () => {
    const score = calcular({ ...COMPLETO, capital_social: 0 });
    expect(fator(score, 'valor', 'capital_social')).toMatchObject({ situacao: 'na', valor_bruto: 0, pontos: null });
    // porte 45 e idade 15 dividem o peso: 100
    expect(score.score_valor).toBe(100);
    expect(score.score_parcial).toBe(true);
    expect(score.score_detalhes.motivos_parcial).toContain('Capital social não informado na Receita (zero)');
  });

  it('porte sem acento ou em minúsculas é reconhecido; porte desconhecido fica N/A', () => {
    expect(fator(calcular({ ...COMPLETO, porte: 'micro  empresa' }), 'valor', 'porte').pontos).toBe(30);
    const score = calcular({ ...COMPLETO, porte: 'NÃO INFORMADO' });
    expect(fator(score, 'valor', 'porte').situacao).toBe('na');
    expect(score.score_parcial).toBe(true);
  });

  it('situação cadastral inativa limita a compensação e fica registrada', () => {
    const score = calcular({ ...COMPLETO, situacao_cadastral: 'BAIXADA' });
    expect(score.score_compensacao).toBe(10);
    expect(score.score_detalhes.compensacao_sem_limite).toBe(83.69);
    expect(score.score_detalhes.limite_situacao).toEqual({ situacao: 'BAIXADA', limite: 10 });
    expect(score.score_detalhes.faixa).toBe('baixa');
  });

  it('nota da planilha acima da escala (escala reduzida depois) é limitada a 100', () => {
    const org = { ...ORGANIZACAO, config_score: {} };
    expect(fator(calcular({ ...COMPLETO, calculadora_icp: 50 }, org), 'probabilidade', 'icp').pontos).toBe(100);
  });

  it('confiança conta só o que tem dado; desligados não entram', () => {
    const score = calcular({ calculadora_icp: 8, nome_decisor: 'A', numero_decisor: '1', quantidade_redes: 1, uf: 'SP' });
    // valor: 3 N/A; probabilidade: icp ok, qualificação N/A, mídias N/A;
    // esforço: 4 ok + relacionamento N/A + tentativas ok; situação desconhecida.
    expect(score.score_detalhes.confianca).toEqual({ valor: 46.15, com_dado: 6, total: 13 });
    expect(score.score_confianca).toBe(46.15);
  });

  it('valores sempre entre 0 e 100 com 2 casas', () => {
    const score = calcular(COMPLETO);
    for (const campo of ['score_valor', 'score_probabilidade', 'score_esforco', 'score_compensacao', 'score_confianca']) {
      expect(score[campo]).toBeGreaterThanOrEqual(0);
      expect(score[campo]).toBeLessThanOrEqual(100);
      expect(Number.isInteger(Math.round(score[campo] * 100))).toBe(true);
    }
  });

  it('lê configurações gravadas antes da revisão 7 pelo nome novo', () => {
    const antigo = { ...ORGANIZACAO, config_score: { valor: { cnaes_prioritarios: ['6201501'], pesos: { cnae: 10 } }, esforco: { sem_numero_decisor: 50, ufs_atendidas: ['SP'] } } };
    const score = calcular({ ...COMPLETO, numero_decisor: null }, antigo);
    expect(fator(score, 'probabilidade', 'icp').origem).toBe('sistema');
    expect(penalidadeDe(score.score_detalhes.esforco, 'contato_decisor').pontos).toBe(50);
    expect(score.score_detalhes.valor.fatores.map((f) => f.fator)).toEqual(['porte', 'capital_social', 'idade']);
  });
});

describe('sugestões', () => {
  it('simula o ganho de conseguir o telefone do decisor e a faixa resultante', () => {
    const score = calcular({ ...COMPLETO, numero_decisor: null });
    const [primeira] = score.score_detalhes.sugestoes;
    // esforço 5 + 35 = 40 → √(94 × 82,15) ÷ 1,4 = 62,77; com telefone volta a 83,69
    expect(score.score_compensacao).toBe(62.77);
    expect(primeira).toEqual({
      acao: 'telefone_decisor',
      rotulo: 'Conseguir o telefone do decisor',
      compensacao_simulada: 83.69,
      faixa_simulada: 'alta',
      ganho: 20.92,
    });
  });

  it('com decisor provável na Receita sugere confirmá-lo; ações sem previsão vêm depois, sem ganho', () => {
    const socios = [{ nome: 'Ana Lima', qualificacao: 'Diretor' }];
    const score = calcular({ ...COMPLETO, nome_decisor: null, socios, avaliacao: null, enriquecido_em: null });
    const acoes = score.score_detalhes.sugestoes.map((s) => s.acao);
    expect(acoes[0]).toBe('usar_decisor_provavel');
    expect(score.score_detalhes.sugestoes[0].rotulo).toBe('Confirmar Ana Lima como decisor');
    expect(acoes).toEqual(expect.arrayContaining(['avaliar_qualificacao', 'avaliar_relacionamento', 'enriquecer']));
    const semGanho = score.score_detalhes.sugestoes.find((s) => s.acao === 'enriquecer');
    expect(semGanho).toMatchObject({ ganho: null, compensacao_simulada: null });
    expect(score.score_detalhes.sugestoes.length).toBeLessThanOrEqual(5);
  });

  it('lead completo não recebe sugestões', () => {
    expect(calcular(COMPLETO).score_detalhes.sugestoes).toEqual([]);
  });
});

describe('estimativa em reais', () => {
  const comFinanceiro = (financeiro) => ({ ...ORGANIZACAO, config_score: { ...ORGANIZACAO.config_score, financeiro } });

  it('sem ticket fica N/A com o motivo', () => {
    const financeiro = calcular(COMPLETO).score_detalhes.financeiro;
    expect(financeiro).toMatchObject({ ticket: null, valor_esperado: null });
    expect(financeiro.motivo).toContain('ticket');
  });

  it('usa o ticket do porte e o índice de probabilidade, com horas e valor por hora', () => {
    const org = comFinanceiro({ ticket_por_porte: { DEMAIS: 10000 }, horas_esforco_zero: 4, horas_esforco_maximo: 24 });
    expect(calcular(COMPLETO, org).score_detalhes.financeiro).toEqual({
      ticket: 10000,
      origem_ticket: 'porte',
      chance: 0.8215,
      origem_chance: 'indice',
      valor_esperado: 8215,
      horas: 5, // 4 + 20 × 5%
      valor_por_hora: 1643,
    });
  });

  it('o ticket do lead prevalece sobre o do porte', () => {
    const org = comFinanceiro({ ticket_por_porte: { DEMAIS: 10000 } });
    expect(calcular({ ...COMPLETO, ticket_estimado: 3000 }, org).score_detalhes.financeiro).toMatchObject({ ticket: 3000, origem_ticket: 'lead', horas: null });
  });

  it('com 20 ou mais desfechos na faixa, usa a taxa de conversão observada', () => {
    const org = comFinanceiro({ ticket_por_porte: { DEMAIS: 10000 } });
    const taxasConversao = { alta: { convertidos: 6, descartados: 14 } };
    expect(calcular(COMPLETO, org, { taxasConversao }).score_detalhes.financeiro).toMatchObject({
      chance: 0.3,
      origem_chance: 'historico',
      valor_esperado: 3000,
    });
    const poucos = { alta: { convertidos: 6, descartados: 13 } };
    expect(calcular(COMPLETO, org, { taxasConversao: poucos }).score_detalhes.financeiro.origem_chance).toBe('indice');
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
