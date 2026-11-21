import { describe, expect, it } from 'vitest';
import { comValor, diferencasDoPadrao, idDoTexto, iguais } from '../src/utils/config.js';
import { decisorProvavel, notaDoBloco, pontoDoArco, simularAvaliacao } from '../src/utils/potencial.js';

const PERGUNTAS = [
  { id: 'orcamento', bloco: 'qualificacao', peso: 30, opcoes: [{ id: 'sim', pontos: 100 }, { id: 'nao', pontos: 0 }, { id: 'nao_sei', pontos: null }] },
  { id: 'prazo', bloco: 'qualificacao', peso: 70, opcoes: [{ id: 'logo', pontos: 50 }] },
  { id: 'site', bloco: 'midias', peso: 10, opcoes: [{ id: 'sim', pontos: 100 }, { id: 'nao', pontos: 0 }] },
  { id: 'origem', bloco: 'relacionamento', peso: 0, opcoes: [{ id: 'frio', pontos: 20 }, { id: 'indicacao', pontos: 5 }] },
];

// Detalhes do lead do protótipo: valor 65, ICP 100 (peso 35), esforço 28 + 12,5 + 5 + relacionamento 5.
const DETALHES = {
  versao: 2,
  limite_situacao: null,
  valor: { valor: 65 },
  probabilidade: {
    fatores: [
      { fator: 'icp', situacao: 'ok', pontos: 100, peso: 35, origem: 'sistema' },
      { fator: 'qualificacao', situacao: 'ok', pontos: 71.5, peso: 40, origem: 'avaliacao' },
      { fator: 'midias_sociais', situacao: 'ok', pontos: 55, peso: 25, origem: 'avaliacao' },
    ],
  },
  esforco: {
    penalidades: [
      { penalidade: 'contato_decisor', aplicada: true, pontos: 28 },
      { penalidade: 'sem_nome_decisor', aplicada: true, pontos: 12.5 },
      { penalidade: 'relacionamento:origem', aplicada: true, pontos: 5 },
      { penalidade: 'tentativas_sem_resposta', aplicada: true, pontos: 5 },
    ],
  },
};

describe('notaDoBloco', () => {
  it('média ponderada; "não sei" sai da conta', () => {
    expect(notaDoBloco(PERGUNTAS, { orcamento: 'sim', prazo: 'logo' }, 'qualificacao')).toBe(65);
    expect(notaDoBloco(PERGUNTAS, { orcamento: 'nao_sei', prazo: 'logo' }, 'qualificacao')).toBe(50);
    expect(notaDoBloco(PERGUNTAS, {}, 'qualificacao')).toBeNull();
  });
});

describe('simularAvaliacao', () => {
  it('recalcula probabilidade, esforço e potencial com as respostas novas', () => {
    const r = simularAvaliacao(DETALHES, PERGUNTAS, { orcamento: 'sim', prazo: 'logo', site: 'sim', origem: 'frio' });
    // prob = (100×35 + 65×40 + 100×25) / 100 = 86; esforço = 28 + 12,5 + 5 + 20 = 65,5
    expect(r).toMatchObject({ valor: 65, probabilidade: 86, esforco: 65.5, qualificacao: 65, midias: 100 });
    // √(65 × 86) = 74,77; ÷ 1,655 = 45,18
    expect(r.compensacao).toBe(45.18);
  });

  it('sem resposta de qualificação, o peso vai para os outros fatores', () => {
    const r = simularAvaliacao(DETALHES, PERGUNTAS, { site: 'nao' });
    // (100×35 + 0×25) / 60 = 58,33
    expect(r.probabilidade).toBe(58.33);
  });

  it('respeita o teto de empresa inativa e ignora detalhes antigos', () => {
    const inativa = { ...DETALHES, limite_situacao: { situacao: 'BAIXADA', limite: 10 } };
    expect(simularAvaliacao(inativa, PERGUNTAS, {}).compensacao).toBe(10);
    expect(simularAvaliacao({ versao: 1 }, PERGUNTAS, {})).toBeNull();
  });
});

describe('decisorProvavel e pontoDoArco', () => {
  it('escolhe quem administra; sozinho, o único sócio', () => {
    expect(decisorProvavel([{ nome: 'A', qualificacao: 'Sócio' }, { nome: 'B', qualificacao: 'Sócio-Administrador' }]).nome).toBe('B');
    expect(decisorProvavel([{ nome: 'Único', qualificacao: 'Sócio' }]).nome).toBe('Único');
    expect(decisorProvavel([{ nome: 'A', qualificacao: 'Sócio' }, { nome: 'B', qualificacao: 'Sócio' }])).toBeNull();
  });

  it('pontos do arco batem com o protótipo', () => {
    expect(pontoDoArco(0)).toEqual({ x: 24, y: 120 });
    expect(pontoDoArco(47.11)).toEqual({ x: 111.3, y: 24.4 });
    expect(pontoDoArco(100)).toEqual({ x: 216, y: 120 });
  });
});

describe('configuração', () => {
  it('diferenças são só as seções alteradas', () => {
    const padrao = { faixas: { alta: 70, media: 40 }, motivos_descarte: ['A'] };
    const efetivo = { faixas: { alta: 75, media: 40 }, motivos_descarte: ['A'] };
    expect(diferencasDoPadrao(efetivo, padrao)).toEqual({ faixas: { alta: 75, media: 40 } });
    expect(iguais([1, { a: 2 }], [1, { a: 2 }])).toBe(true);
  });

  it('comValor troca um caminho sem mexer no original', () => {
    const original = { esforco: { tentativas: { maximo: 30, toleradas: 2 } } };
    const novo = comValor(original, ['esforco', 'tentativas', 'maximo'], 40);
    expect(novo.esforco.tentativas).toEqual({ maximo: 40, toleradas: 2 });
    expect(original.esforco.tentativas.maximo).toBe(30);
  });

  it('idDoTexto gera ids válidos e únicos', () => {
    expect(idDoTexto('Tem orçamento aprovado?', [])).toBe('tem_orcamento_aprovado');
    expect(idDoTexto('Site', ['site'])).toBe('site_2');
  });
});
