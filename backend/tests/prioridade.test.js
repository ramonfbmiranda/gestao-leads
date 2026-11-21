// Fila de prioridade (seção 8.10) com o Supabase simulado.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/supabase.js', () => ({ supabase: { from: vi.fn() } }));

const { supabase } = await import('../src/config/supabase.js');
const { listarPrioridade, motivoDaPrioridade } = await import('../src/services/prioridadeService.js');

const ORG = '22222222-2222-4222-8222-222222222222';
const RESPONSAVEL = '77777777-7777-4777-8777-777777777777';
const AGORA = new Date('2026-11-21T12:00:00.000Z');
const DIA = 24 * 60 * 60 * 1000;
const diasAtras = (dias) => new Date(AGORA.getTime() - dias * DIA).toISOString();

function consultaFalsa(resultado) {
  const chamadas = [];
  const consulta = new Proxy(
    {},
    {
      get(_, metodo) {
        if (metodo === 'then') return (resolver) => resolver(resultado);
        if (metodo === 'chamadas') return chamadas;
        return (...args) => {
          chamadas.push([metodo, ...args]);
          return consulta;
        };
      },
    },
  );
  return consulta;
}

function filaDeConsultas(...resultados) {
  const consultas = [];
  supabase.from.mockImplementation((tabela) => {
    const consulta = consultaFalsa(resultados.shift());
    consultas.push({ tabela, chamadas: consulta.chamadas });
    return consulta;
  });
  return consultas;
}

const ok = (data) => ({ data, error: null });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('motivoDaPrioridade', () => {
  it.each([
    [{ ultima_interacao_em: null, tentativas_sem_resposta: 0 }, 'nenhuma interação registrada'],
    [{ ultima_interacao_em: diasAtras(9), tentativas_sem_resposta: 0 }, 'sem contato há 9 dias'],
    [{ ultima_interacao_em: diasAtras(1.5), tentativas_sem_resposta: 1 }, 'sem contato há 1 dia (1 tentativa sem resposta)'],
    [{ ultima_interacao_em: diasAtras(8), tentativas_sem_resposta: 3 }, 'sem contato há 8 dias (3 tentativas sem resposta)'],
    [{ ultima_interacao_em: diasAtras(0.2), tentativas_sem_resposta: 0 }, 'última interação hoje'],
  ])('%j → %s', (lead, texto) => {
    expect(motivoDaPrioridade(lead, AGORA)).toBe(texto);
  });
});

describe('listarPrioridade', () => {
  const leadAbordar = {
    id: 'a', nome_lead: 'Padaria', cnpj: '11222333000181', score_compensacao: 75.5, score_parcial: false,
    status: 'novo', ultima_interacao_em: null, tentativas_sem_resposta: 0, responsavel: { id: RESPONSAVEL, nome: 'Ana' },
  };
  const leadRetomar = {
    id: 'b', nome_lead: 'Mercado', cnpj: '12ABC34501DE35', score_compensacao: null, score_parcial: true,
    status: 'em_contato', ultima_interacao_em: diasAtras(9), tentativas_sem_resposta: 2, responsavel: null,
  };

  it('monta as duas listas com os filtros da organização, por compensação e com N/A no fim', async () => {
    const consultas = filaDeConsultas(ok({ config_score: {} }), ok([leadAbordar]), ok([leadRetomar]));
    const resultado = await listarPrioridade(ORG, { limite: 10 }, AGORA);

    expect(consultas.map(({ tabela }) => tabela)).toEqual(['organizacoes', 'leads', 'leads']);
    const [, abordar, retomar] = consultas;
    for (const { chamadas } of [abordar, retomar]) {
      expect(chamadas).toContainEqual(['eq', 'organizacao_id', ORG]);
      expect(chamadas).toContainEqual(['order', 'score_compensacao', { ascending: false, nullsFirst: false }]);
      expect(chamadas).toContainEqual(['limit', 10]);
    }
    // Padrão: abordar sem interação nos últimos 2 dias; retomar com a última há 7 dias ou mais.
    expect(abordar.chamadas).toContainEqual(['in', 'status', ['novo']]);
    expect(abordar.chamadas).toContainEqual(['or', `ultima_interacao_em.is.null,ultima_interacao_em.lt."${diasAtras(2)}"`]);
    expect(retomar.chamadas).toContainEqual(['in', 'status', ['em_contato', 'qualificado']]);
    expect(retomar.chamadas).toContainEqual(['or', `ultima_interacao_em.is.null,ultima_interacao_em.lte."${diasAtras(7)}"`]);
    expect(abordar.chamadas.some(([metodo, coluna]) => metodo === 'eq' && coluna === 'responsavel_id')).toBe(false);

    expect(resultado).toEqual({
      abordar: [{ ...leadAbordar, faixa: 'alta', motivo: 'nenhuma interação registrada' }],
      retomar: [{ ...leadRetomar, faixa: 'na', motivo: 'sem contato há 9 dias (2 tentativas sem resposta)' }],
    });
  });

  it('usa os dias e as faixas configurados pela organização', async () => {
    const consultas = filaDeConsultas(
      ok({ config_score: { prioridade: { dias_espera: 0, dias_retomar: 30 }, faixas: { alta: 80, media: 50 } } }),
      ok([leadAbordar]),
      ok([]),
    );
    const resultado = await listarPrioridade(ORG, { limite: 5 }, AGORA);
    expect(consultas[1].chamadas).toContainEqual(['or', `ultima_interacao_em.is.null,ultima_interacao_em.lt."${diasAtras(0)}"`]);
    expect(consultas[2].chamadas).toContainEqual(['or', `ultima_interacao_em.is.null,ultima_interacao_em.lte."${diasAtras(30)}"`]);
    expect(consultas[1].chamadas).toContainEqual(['limit', 5]);
    expect(resultado.abordar[0].faixa).toBe('media');
  });

  it('filtra pelo responsável depois de conferir que ele é da organização', async () => {
    const consultas = filaDeConsultas(ok({ id: RESPONSAVEL }), ok({ config_score: {} }), ok([]), ok([]));
    await listarPrioridade(ORG, { responsavelId: RESPONSAVEL, limite: 10 }, AGORA);
    expect(consultas[0].tabela).toBe('responsaveis');
    expect(consultas[0].chamadas).toContainEqual(['eq', 'organizacao_id', ORG]);
    expect(consultas[2].chamadas).toContainEqual(['eq', 'responsavel_id', RESPONSAVEL]);
    expect(consultas[3].chamadas).toContainEqual(['eq', 'responsavel_id', RESPONSAVEL]);
  });

  it('responsável de outra organização responde 400 sem buscar leads', async () => {
    const consultas = filaDeConsultas(ok(null));
    await expect(listarPrioridade(ORG, { responsavelId: RESPONSAVEL, limite: 10 }, AGORA)).rejects.toMatchObject({
      status: 400,
      message: 'Responsável não encontrado',
    });
    expect(consultas).toHaveLength(1);
  });
});
