// Serviço de recálculo com o supabase-js simulado: paginação, filtro pela
// organização e gravação em lotes.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/supabase.js', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const { supabase } = await import('../src/config/supabase.js');
const { recalcularScores, recalcularSemInterromper } = await import('../src/services/scoreService.js');

const ORG = '22222222-2222-4222-8222-222222222222';
const IMPORTACAO = '55555555-5555-4555-8555-555555555555';

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

const ORGANIZACAO = {
  data: { escala_icp_max: 10, escala_midias_max: 100, escala_nota_max: 100, config_score: {}, updated_at: null },
  error: null,
};
const lead = (i) => ({ id: `lead-${i}`, calculadora_icp: 5, lead_redes_sociais: [{ id: 'x' }] });

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('recalcularScores', () => {
  it('pagina de 1000 em 1000 e grava em lotes de 500, sempre na organização', async () => {
    const pagina1 = Array.from({ length: 1000 }, (_, i) => lead(i));
    const pagina2 = Array.from({ length: 3 }, (_, i) => lead(1000 + i));
    const consultas = filaDeConsultas(ORGANIZACAO, { data: pagina1, error: null }, { data: pagina2, error: null });
    supabase.rpc.mockImplementation(async (_, { p_scores }) => ({ data: p_scores.length, error: null }));

    const total = await recalcularScores(ORG);

    expect(total).toBe(1003);
    expect(consultas[1].chamadas).toContainEqual(['eq', 'organizacao_id', ORG]);
    expect(consultas[1].chamadas).toContainEqual(['range', 0, 999]);
    expect(consultas[2].chamadas).toContainEqual(['range', 1000, 1999]);
    expect(supabase.rpc.mock.calls.map(([, args]) => args.p_scores.length)).toEqual([500, 500, 3]);
    expect(supabase.rpc.mock.calls[0][1].p_organizacao_id).toBe(ORG);

    const gravado = supabase.rpc.mock.calls[0][1].p_scores[0];
    expect(gravado).toMatchObject({ id: 'lead-0', score_probabilidade: 50, score_parcial: true });
    expect(gravado).not.toHaveProperty('lead_redes_sociais');
  });

  it('filtra pela importação quando informada', async () => {
    const consultas = filaDeConsultas(ORGANIZACAO, { data: [], error: null });
    await recalcularScores(ORG, { importacaoId: IMPORTACAO });
    expect(consultas[1].chamadas).toContainEqual(['eq', 'ultima_importacao_id', IMPORTACAO]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('filtra pelos ids quando informados', async () => {
    const consultas = filaDeConsultas(ORGANIZACAO, { data: [lead(1)], error: null });
    supabase.rpc.mockResolvedValue({ data: 1, error: null });
    expect(await recalcularScores(ORG, { ids: ['lead-1'] })).toBe(1);
    expect(consultas[1].chamadas).toContainEqual(['in', 'id', ['lead-1']]);
  });
});

describe('recalcularSemInterromper', () => {
  it('falha no recálculo é registrada e não interrompe a operação principal', async () => {
    filaDeConsultas({ data: null, error: { code: 'XX000', message: 'fora do ar' } });
    await expect(recalcularSemInterromper(ORG, { ids: ['x'] })).resolves.toBe(0);
    expect(console.error).toHaveBeenCalled();
  });
});
