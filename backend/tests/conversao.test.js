// Conversão por faixa (GET /dashboard/conversao) a partir de contar_desfechos.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/supabase.js', () => ({ supabase: { rpc: vi.fn() } }));

const { supabase } = await import('../src/config/supabase.js');
const { conversaoPorFaixa, montarConversao } = await import('../src/services/dashboardService.js');

const ORG = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('montarConversao', () => {
  it('calcula a taxa por faixa e ordena os motivos do mais para o menos frequente', () => {
    const resultado = montarConversao({
      faixas: {
        alta: { convertidos: 2, descartados: 1 },
        media: { convertidos: 0, descartados: 2 },
        baixa: { convertidos: 0, descartados: 0 },
        na: { convertidos: 1, descartados: 3 },
      },
      motivos: { Outro: 1, 'Sem orçamento': 4, 'Já tem fornecedor': 1 },
    });
    expect(resultado).toEqual({
      faixas: {
        alta: { convertidos: 2, descartados: 1, taxa: 0.6667 },
        media: { convertidos: 0, descartados: 2, taxa: 0 },
        baixa: { convertidos: 0, descartados: 0, taxa: null },
        na: { convertidos: 1, descartados: 3, taxa: 0.25 },
      },
      motivos: [
        { motivo: 'Sem orçamento', total: 4 },
        { motivo: 'Já tem fornecedor', total: 1 },
        { motivo: 'Outro', total: 1 },
      ],
    });
  });

  it('faixa ausente conta como zero, com taxa nula', () => {
    const { faixas, motivos } = montarConversao({ faixas: {}, motivos: {} });
    expect(Object.keys(faixas)).toEqual(['alta', 'media', 'baixa', 'na']);
    expect(faixas.alta).toEqual({ convertidos: 0, descartados: 0, taxa: null });
    expect(motivos).toEqual([]);
  });
});

describe('conversaoPorFaixa', () => {
  it('chama contar_desfechos com a organização do perfil', async () => {
    supabase.rpc.mockResolvedValue({
      data: { faixas: { alta: { convertidos: 1, descartados: 1 } }, motivos: { Outro: 1 } },
      error: null,
    });
    const resultado = await conversaoPorFaixa(ORG);
    expect(supabase.rpc).toHaveBeenCalledWith('contar_desfechos', { p_organizacao_id: ORG });
    expect(resultado.faixas.alta).toEqual({ convertidos: 1, descartados: 1, taxa: 0.5 });
    expect(resultado.motivos).toEqual([{ motivo: 'Outro', total: 1 }]);
  });

  it('erro do banco vira 500 genérico (não é erro do cliente)', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'falha' } });
    await expect(conversaoPorFaixa(ORG)).rejects.toThrow('Erro do banco');
  });
});
