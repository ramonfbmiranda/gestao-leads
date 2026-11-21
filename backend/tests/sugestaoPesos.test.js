// Sugestão de pesos a partir dos desfechos (seção 8.10): função pura e a busca paginada.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/supabase.js', () => ({ supabase: { from: vi.fn() } }));

const { supabase } = await import('../src/config/supabase.js');
const { mesclarConfigScore } = await import('../src/utils/configScore.js');
const { distribuirPesos, sugerirPesos } = await import('../src/utils/sugestaoPesos.js');
const { sugestaoDePesos } = await import('../src/services/organizacaoService.js');

const ORG = '22222222-2222-4222-8222-222222222222';
const CONFIG = mesclarConfigScore({});

const fatores = (pontos) =>
  Object.entries(pontos).map(([fator, valor]) =>
    valor === null ? { fator, situacao: 'na', pontos: null } : { fator, situacao: 'ok', pontos: valor },
  );
const penalidades = (aplicadas) =>
  Object.entries(aplicadas).map(([penalidade, aplicada]) => ({
    penalidade,
    situacao: typeof aplicada === 'string' ? aplicada : 'ok',
    aplicada: aplicada === true,
  }));

function lead(status, { valor = {}, probabilidade = {}, esforco = {} } = {}, versao = 2) {
  return {
    status,
    desfecho_score: {
      score_compensacao: 50,
      score_detalhes: {
        versao,
        faixa: 'media',
        valor: { fatores: fatores(valor) },
        probabilidade: { fatores: fatores(probabilidade) },
        esforco: { penalidades: penalidades(esforco) },
      },
    },
  };
}

// 30 convertidos e 30 descartados com diferenças conhecidas.
function desfechosDeExemplo() {
  const convertidos = Array.from({ length: 30 }, (_, i) =>
    lead('convertido', {
      valor: { porte: 80, capital_social: 50, idade: 60 },
      probabilidade: { icp: 70, qualificacao: 90, midias_sociais: 40 },
      esforco: {
        contato_decisor: i < 5,
        sem_nome_decisor: i < 10,
        sem_redes_sociais: i < 15,
        fora_ufs_atendidas: 'desligado',
        tentativas_sem_resposta: false,
        'relacionamento:origem_contato': 'na',
      },
    }),
  );
  const descartados = Array.from({ length: 30 }, (_, i) =>
    lead('descartado', {
      valor: { porte: 40, capital_social: 50, idade: 50 },
      probabilidade: { icp: null, qualificacao: 30, midias_sociais: 60 },
      esforco: {
        contato_decisor: i < 20,
        sem_nome_decisor: i < 10,
        sem_redes_sociais: i < 5,
        fora_ufs_atendidas: 'desligado',
        tentativas_sem_resposta: i < 10,
        'relacionamento:origem_contato': 'na',
      },
    }),
  );
  return [...convertidos, ...descartados];
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('sugerirPesos', () => {
  it('com menos de 30 de cada lado (só versão 2), responde que não é suficiente', () => {
    const leads = [
      ...Array.from({ length: 29 }, () => lead('convertido')),
      ...Array.from({ length: 40 }, () => lead('descartado')),
      ...Array.from({ length: 10 }, () => lead('convertido', {}, 1)),
      { status: 'convertido', desfecho_score: null },
    ];
    expect(sugerirPesos(leads, CONFIG)).toEqual({ suficiente: false, convertidos: 29, descartados: 40, minimo: 30 });
  });

  it('valor e probabilidade: proporcional às diferenças positivas, mínimo 5, soma 100', () => {
    const resultado = sugerirPesos(desfechosDeExemplo(), CONFIG);
    expect(resultado).toMatchObject({ suficiente: true, convertidos: 30, descartados: 30, minimo: 30 });

    expect(resultado.valor.atuais).toEqual({ porte: 45, capital_social: 40, idade: 15 });
    // Diferenças: porte 40, capital 0, idade 10 → capital fica no mínimo e o resto vai 4:1.
    expect(resultado.valor.sugeridos).toEqual({ porte: 76, capital_social: 5, idade: 19 });
    expect(resultado.valor.fatores[0]).toEqual({
      fator: 'porte',
      leads: 60,
      convertidos: 30,
      descartados: 30,
      media_convertidos: 80,
      media_descartados: 40,
      diferenca: 40,
    });

    // ICP sem dado nos descartados (sem comparação) e mídias com diferença negativa ficam no mínimo.
    expect(resultado.probabilidade.sugeridos).toEqual({ icp: 5, qualificacao: 90, midias_sociais: 5 });
    expect(resultado.probabilidade.fatores[0]).toMatchObject({ fator: 'icp', leads: 30, descartados: 0, diferenca: null });
    expect(resultado.probabilidade.fatores[2]).toMatchObject({ fator: 'midias_sociais', diferenca: -20 });
  });

  it('esforço: pontos proporcionais à queda na conversão, de 0 a 50', () => {
    const { esforco } = sugerirPesos(desfechosDeExemplo(), CONFIG);
    expect(esforco.atuais).toEqual({
      contato_decisor: 35,
      sem_nome_decisor: 25,
      sem_redes_sociais: 20,
      fora_ufs_atendidas: 20,
      tentativas_sem_resposta: 30,
      'relacionamento:origem_contato': 20,
    });
    // Tentativas: 0% com a penalidade contra 60% sem (a maior queda, 50 pontos).
    // Contato: 20% contra 71,43% → queda 0,5143 → 43. Sem queda → 0. Sem comparação → null.
    expect(esforco.sugeridos).toEqual({
      contato_decisor: 43,
      sem_nome_decisor: 0,
      sem_redes_sociais: 0,
      fora_ufs_atendidas: null,
      tentativas_sem_resposta: 50,
      'relacionamento:origem_contato': null,
    });
    expect(esforco.penalidades[0]).toEqual({
      penalidade: 'contato_decisor',
      leads: 60,
      com: { leads: 25, convertidos: 5, taxa: 0.2 },
      sem: { leads: 35, convertidos: 25, taxa: 0.7143 },
      queda: 0.5143,
    });
    expect(esforco.penalidades.find(({ penalidade }) => penalidade === 'fora_ufs_atendidas').leads).toBe(0);
  });

  it('fator desligado pela organização (peso 0) continua 0', () => {
    const config = mesclarConfigScore({ valor: { pesos: { idade: 0 } } });
    const { valor } = sugerirPesos(desfechosDeExemplo(), config);
    expect(valor.atuais.idade).toBe(0);
    expect(valor.sugeridos).toEqual({ porte: 95, capital_social: 5, idade: 0 });
  });
});

describe('distribuirPesos', () => {
  const atuais = { a: 10, b: 10, c: 10 };

  it('arredonda para inteiros que somam 100', () => {
    const pesos = distribuirPesos(
      [{ fator: 'a', diferenca: 10 }, { fator: 'b', diferenca: 10 }, { fator: 'c', diferenca: 10 }],
      atuais,
    );
    expect(Object.values(pesos).reduce((soma, peso) => soma + peso, 0)).toBe(100);
    expect(Object.values(pesos).sort()).toEqual([33, 33, 34]);
  });

  it('sem diferença positiva não sugere nada', () => {
    expect(
      distribuirPesos([{ fator: 'a', diferenca: -5 }, { fator: 'b', diferenca: 0 }, { fator: 'c', diferenca: null }], atuais),
    ).toBeNull();
  });
});

describe('sugestaoDePesos (busca paginada)', () => {
  function consultaFalsa(resultado, chamadas) {
    const consulta = new Proxy(
      {},
      {
        get(_, metodo) {
          if (metodo === 'then') return (resolver) => resolver(resultado);
          return (...args) => {
            chamadas.push([metodo, ...args]);
            return consulta;
          };
        },
      },
    );
    return consulta;
  }

  it('busca os desfechos da organização em páginas de 1000', async () => {
    const paginaCheia = Array.from({ length: 1000 }, () => lead('descartado'));
    const resultados = [
      { data: { config_score: {} }, error: null },
      { data: paginaCheia, error: null },
      { data: [lead('convertido'), lead('convertido')], error: null },
    ];
    const consultas = [];
    supabase.from.mockImplementation((tabela) => {
      const chamadas = [];
      consultas.push({ tabela, chamadas });
      return consultaFalsa(resultados.shift(), chamadas);
    });

    const resultado = await sugestaoDePesos(ORG);
    expect(resultado).toEqual({ suficiente: false, convertidos: 2, descartados: 1000, minimo: 30 });
    expect(consultas.map(({ tabela }) => tabela)).toEqual(['organizacoes', 'leads', 'leads']);
    const [, primeira, segunda] = consultas;
    expect(primeira.chamadas).toContainEqual(['select', 'status, desfecho_score']);
    expect(primeira.chamadas).toContainEqual(['eq', 'organizacao_id', ORG]);
    expect(primeira.chamadas).toContainEqual(['in', 'status', ['convertido', 'descartado']]);
    expect(primeira.chamadas).toContainEqual(['not', 'desfecho_em', 'is', null]);
    expect(primeira.chamadas).toContainEqual(['range', 0, 999]);
    expect(segunda.chamadas).toContainEqual(['range', 1000, 1999]);
  });
});
