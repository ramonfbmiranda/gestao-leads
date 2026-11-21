// Resumo do dashboard (GET /dashboard/resumo) a partir de resumo_dashboard.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/supabase.js', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('../src/services/organizacaoService.js', () => ({ buscarOrganizacao: vi.fn() }));

const { supabase } = await import('../src/config/supabase.js');
const { buscarOrganizacao } = await import('../src/services/organizacaoService.js');
const { resumoDoDashboard } = await import('../src/services/dashboardService.js');

const ORG = '22222222-2222-4222-8222-222222222222';
const RESUMO = { total: 3, em_aberto: 2, media_potencial: 55.5, top: [], mudancas_receita: [] };

beforeEach(() => {
  vi.resetAllMocks();
});

describe('resumoDoDashboard', () => {
  it('usa as faixas da organização e as devolve junto', async () => {
    buscarOrganizacao.mockResolvedValue({ config_score: { faixas: { alta: 80, media: 50 } } });
    supabase.rpc.mockResolvedValue({ data: RESUMO, error: null });

    const resultado = await resumoDoDashboard(ORG);

    expect(buscarOrganizacao).toHaveBeenCalledWith(ORG, 'config_score');
    expect(supabase.rpc).toHaveBeenCalledWith('resumo_dashboard', { p_organizacao_id: ORG, p_alta: 80, p_media: 50 });
    expect(resultado).toEqual({ ...RESUMO, faixas: { alta: 80, media: 50 } });
  });

  it('sem configuração própria, usa as faixas padrão (70 e 40)', async () => {
    buscarOrganizacao.mockResolvedValue({ config_score: null });
    supabase.rpc.mockResolvedValue({ data: RESUMO, error: null });

    const resultado = await resumoDoDashboard(ORG);

    expect(supabase.rpc).toHaveBeenCalledWith('resumo_dashboard', { p_organizacao_id: ORG, p_alta: 70, p_media: 40 });
    expect(resultado.faixas).toEqual({ alta: 70, media: 40 });
  });

  it('erro do banco vira 500 genérico', async () => {
    buscarOrganizacao.mockResolvedValue({ config_score: {} });
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'falha' } });
    await expect(resumoDoDashboard(ORG)).rejects.toThrow('Erro do banco');
  });
});
