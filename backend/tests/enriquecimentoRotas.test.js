// Rotas de enriquecimento com o serviço simulado: acesso, validação e
// organização do perfil.

import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/supabase.js', () => ({ supabase: { auth: { getClaims: vi.fn() } } }));
vi.mock('../src/services/contaService.js', () => ({ buscarPerfil: vi.fn() }));
vi.mock('../src/services/enriquecimentoService.js', () => ({
  enriquecerLead: vi.fn(),
  enfileirarLeads: vi.fn(),
  statusEnriquecimento: vi.fn(),
}));
vi.mock('../src/services/filaEnriquecimento.js', () => ({ acordarFila: vi.fn() }));
vi.mock('../src/services/leadsService.js', () => ({ obterLead: vi.fn() }));

const { supabase } = await import('../src/config/supabase.js');
const contaService = await import('../src/services/contaService.js');
const servico = await import('../src/services/enriquecimentoService.js');
const { acordarFila } = await import('../src/services/filaEnriquecimento.js');
const leadsService = await import('../src/services/leadsService.js');
const { criarApp } = await import('../src/app.js');

const app = criarApp();
const TOKEN = 'Bearer token-valido';
const USUARIO_ID = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const LEAD = '44444444-4444-4444-8444-444444444444';

const post = (rota, corpo) => {
  const requisicao = request(app).post(rota).set('Authorization', TOKEN);
  return corpo === undefined ? requisicao : requisicao.send(corpo);
};

beforeEach(() => {
  vi.resetAllMocks();
  supabase.auth.getClaims.mockResolvedValue({
    data: { claims: { sub: USUARIO_ID, email: 'ana@exemplo.com', role: 'authenticated' } },
    error: null,
  });
  contaService.buscarPerfil.mockResolvedValue({ id: USUARIO_ID, organizacao_id: ORG, papel: 'membro' });
});

describe('GET /leads/enriquecimento/status', () => {
  it('responde a contagem da organização (não cai em /leads/:id)', async () => {
    servico.statusEnriquecimento.mockResolvedValue({ pendente: 1, total: 3 });
    const resposta = await request(app).get('/leads/enriquecimento/status').set('Authorization', TOKEN);
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ pendente: 1, total: 3 });
    expect(servico.statusEnriquecimento).toHaveBeenCalledWith(ORG);
    expect(leadsService.obterLead).not.toHaveBeenCalled();
  });

  it('sem token responde 401', async () => {
    expect((await request(app).get('/leads/enriquecimento/status')).status).toBe(401);
  });
});

describe('POST /leads/enriquecer-lote', () => {
  it('sem corpo enfileira os não enriquecidos, responde 202 e acorda a fila', async () => {
    servico.enfileirarLeads.mockResolvedValue({ enfileirados: 4 });
    const resposta = await post('/leads/enriquecer-lote');
    expect(resposta.status).toBe(202);
    expect(resposta.body).toEqual({ enfileirados: 4 });
    expect(servico.enfileirarLeads).toHaveBeenCalledWith(ORG, null);
    expect(acordarFila).toHaveBeenCalled();
  });

  it('com ids: remove repetidos e ignora organizacao_id do corpo', async () => {
    servico.enfileirarLeads.mockResolvedValue({ enfileirados: 1 });
    await post('/leads/enriquecer-lote', { ids: [LEAD, LEAD.toUpperCase()], organizacao_id: 'outra' });
    expect(servico.enfileirarLeads).toHaveBeenCalledWith(ORG, [LEAD]);
  });

  it('nada enfileirado não acorda a fila', async () => {
    servico.enfileirarLeads.mockResolvedValue({ enfileirados: 0 });
    expect((await post('/leads/enriquecer-lote', {})).status).toBe(202);
    expect(acordarFila).not.toHaveBeenCalled();
  });

  it.each([
    [{ ids: [] }],
    [{ ids: 'abc' }],
    [{ ids: ['abc'] }],
    [{ ids: Array.from({ length: 1001 }, () => LEAD) }],
    [[LEAD]],
  ])('recusa %j com 400', async (corpo) => {
    const resposta = await post('/leads/enriquecer-lote', corpo);
    expect(resposta.status).toBe(400);
    expect(servico.enfileirarLeads).not.toHaveBeenCalled();
  });
});

describe('POST /leads/:id/enriquecer', () => {
  it('enriquece na organização do perfil e devolve o lead', async () => {
    servico.enriquecerLead.mockResolvedValue({ id: LEAD, enriquecimento_status: 'concluido' });
    const resposta = await post(`/leads/${LEAD}/enriquecer`);
    expect(resposta.status).toBe(200);
    expect(servico.enriquecerLead).toHaveBeenCalledWith(ORG, LEAD);
  });

  it('id malformado responde 404 sem consultar nada', async () => {
    const resposta = await post('/leads/abc/enriquecer');
    expect(resposta.status).toBe(404);
    expect(servico.enriquecerLead).not.toHaveBeenCalled();
  });

  it('sem perfil responde 403', async () => {
    contaService.buscarPerfil.mockResolvedValue(null);
    expect((await post(`/leads/${LEAD}/enriquecer`)).status).toBe(403);
  });
});
