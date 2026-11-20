// Rotas da fase 3 (organização, responsáveis e leads) com os serviços
// simulados: conferem acesso, validação de entrada e uso da organização do perfil.

import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/supabase.js', () => ({ supabase: { auth: { getClaims: vi.fn() } } }));
vi.mock('../src/services/contaService.js', () => ({ buscarPerfil: vi.fn() }));
vi.mock('../src/services/organizacaoService.js', () => ({ atualizarOrganizacao: vi.fn() }));
vi.mock('../src/services/responsaveisService.js', () => ({
  listarResponsaveis: vi.fn(),
  criarResponsavel: vi.fn(),
}));
vi.mock('../src/services/leadsService.js', () => ({
  listarLeads: vi.fn(),
  obterLead: vi.fn(),
  criarLead: vi.fn(),
  atualizarLead: vi.fn(),
  excluirLead: vi.fn(),
}));

const { supabase } = await import('../src/config/supabase.js');
const contaService = await import('../src/services/contaService.js');
const organizacaoService = await import('../src/services/organizacaoService.js');
const responsaveisService = await import('../src/services/responsaveisService.js');
const leadsService = await import('../src/services/leadsService.js');
const { criarApp } = await import('../src/app.js');

const app = criarApp();
const TOKEN = 'Bearer token-valido';
const USUARIO_ID = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const OUTRA_ORG = '33333333-3333-4333-8333-333333333333';
const LEAD = '44444444-4444-4444-8444-444444444444';

function logado(papel = 'membro') {
  supabase.auth.getClaims.mockResolvedValue({
    data: { claims: { sub: USUARIO_ID, email: 'ana@exemplo.com', role: 'authenticated' } },
    error: null,
  });
  contaService.buscarPerfil.mockResolvedValue({ id: USUARIO_ID, organizacao_id: ORG, nome: 'Ana', papel });
}

const get = (rota) => request(app).get(rota).set('Authorization', TOKEN);
const post = (rota, corpo) => request(app).post(rota).set('Authorization', TOKEN).send(corpo);
const put = (rota, corpo) => request(app).put(rota).set('Authorization', TOKEN).send(corpo);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('PUT /organizacao', () => {
  it('membro não pode alterar a organização', async () => {
    logado('membro');
    const resposta = await put('/organizacao', { nome: 'Nova' });
    expect(resposta.status).toBe(403);
    expect(organizacaoService.atualizarOrganizacao).not.toHaveBeenCalled();
  });

  it('admin atualiza só os campos da lista branca, na própria organização', async () => {
    logado('admin');
    organizacaoService.atualizarOrganizacao.mockResolvedValue({ id: ORG });
    const resposta = await put('/organizacao', {
      nome: ' Nova ',
      escala_icp_max: 10,
      config_score: { esforco: { ufs_atendidas: ['sp'] } },
      id: OUTRA_ORG,
      created_at: '2020-01-01',
    });
    expect(resposta.status).toBe(200);
    expect(organizacaoService.atualizarOrganizacao).toHaveBeenCalledWith(ORG, {
      nome: 'Nova',
      escala_icp_max: 10,
      config_score: { esforco: { ufs_atendidas: ['SP'] } },
    });
  });

  it.each([
    [{ escala_icp_max: 0 }, 'maior que zero'],
    [{ escala_nota_max: '10' }, 'maior que zero'],
    [{ nome: '' }, 'obrigatório'],
    [{ config_score: { faixas: { alta: 10 } } }, 'alta'],
    [{}, 'Nenhum campo'],
  ])('recusa %j com 400', async (corpo, trecho) => {
    logado('admin');
    const resposta = await put('/organizacao', corpo);
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro).toContain(trecho);
  });
});

describe('responsáveis', () => {
  it('lista os responsáveis da organização do perfil', async () => {
    logado();
    responsaveisService.listarResponsaveis.mockResolvedValue([]);
    const resposta = await get(`/responsaveis?organizacao_id=${OUTRA_ORG}`);
    expect(resposta.status).toBe(200);
    expect(responsaveisService.listarResponsaveis).toHaveBeenCalledWith(ORG);
  });

  it('cria com o nome normalizado', async () => {
    logado();
    responsaveisService.criarResponsavel.mockResolvedValue({ id: LEAD, nome: 'Ana Souza' });
    const resposta = await post('/responsaveis', { nome: '  Ana   Souza ' });
    expect(resposta.status).toBe(201);
    expect(responsaveisService.criarResponsavel).toHaveBeenCalledWith(ORG, 'Ana Souza');
  });

  it('sem perfil responde 403', async () => {
    logado();
    contaService.buscarPerfil.mockResolvedValue(null);
    const resposta = await get('/responsaveis');
    expect(resposta.status).toBe(403);
  });
});

describe('GET /leads', () => {
  it('usa os padrões da especificação', async () => {
    logado();
    leadsService.listarLeads.mockResolvedValue({ leads: [], total: 0, pagina: 1, limite: 20 });
    const resposta = await get('/leads');
    expect(resposta.status).toBe(200);
    expect(leadsService.listarLeads).toHaveBeenCalledWith(ORG, {
      status: null,
      busca: null,
      ordem: 'score_compensacao',
      direcao: 'desc',
      pagina: 1,
      limite: 20,
    });
  });

  it('repassa filtros válidos', async () => {
    logado();
    leadsService.listarLeads.mockResolvedValue({ leads: [], total: 0, pagina: 3, limite: 50 });
    await get('/leads?status=qualificado&busca=%20padaria%20&ordem=nota_final&direcao=asc&pagina=3&limite=50');
    expect(leadsService.listarLeads).toHaveBeenCalledWith(ORG, {
      status: 'qualificado',
      busca: 'padaria',
      ordem: 'nota_final',
      direcao: 'asc',
      pagina: 3,
      limite: 50,
    });
  });

  it.each([
    ['status=ganho'],
    ['ordem=nome_lead'],
    ['direcao=cima'],
    ['pagina=0'],
    ['limite=101'],
    ['limite=abc'],
    ['status=novo&status=qualificado'],
    [`busca=${'a'.repeat(101)}`],
  ])('recusa ?%s com 400', async (consulta) => {
    logado();
    const resposta = await get(`/leads?${consulta}`);
    expect(resposta.status).toBe(400);
    expect(leadsService.listarLeads).not.toHaveBeenCalled();
  });
});

describe('POST /leads', () => {
  it('normaliza o CNPJ, aplica a lista branca e usa a organização do perfil', async () => {
    logado();
    leadsService.criarLead.mockResolvedValue({ id: LEAD });
    const resposta = await post('/leads', {
      cnpj: '12.abc.345/01de-35',
      nome_lead: ' Padaria ',
      nota_final: 8.5,
      status: 'em_contato',
      organizacao_id: OUTRA_ORG,
      score_compensacao: 100,
      razao_social: 'Inventada',
      enriquecimento_status: 'concluido',
    });
    expect(resposta.status).toBe(201);
    expect(leadsService.criarLead).toHaveBeenCalledWith(ORG, {
      cnpj: '12ABC34501DE35',
      nome_lead: 'Padaria',
      nota_final: 8.5,
      status: 'em_contato',
    });
  });

  it.each([
    [{ nome_lead: 'X' }, 'O campo "cnpj" é obrigatório'],
    [{ cnpj: '12ABC34501DE36', nome_lead: 'X' }, 'CNPJ inválido'],
    [{ cnpj: '00000000000000', nome_lead: 'X' }, 'CNPJ inválido'],
    [{ cnpj: '11222333000181' }, 'O campo "nome_lead" é obrigatório'],
    [{ cnpj: '11222333000181', nome_lead: 'X', nota_final: -1 }, 'nota_final'],
    [{ cnpj: '11222333000181', nome_lead: 'X', nota_final: '8' }, 'nota_final'],
    [{ cnpj: '11222333000181', nome_lead: 'X', status: 'ganho' }, 'status'],
    [{ cnpj: '11222333000181', nome_lead: 'X', responsavel_id: 'abc' }, 'responsavel_id'],
  ])('recusa %j com 400', async (corpo, trecho) => {
    logado();
    const resposta = await post('/leads', corpo);
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro).toContain(trecho);
    expect(leadsService.criarLead).not.toHaveBeenCalled();
  });
});

describe('GET, PUT e DELETE /leads/:id', () => {
  it('detalhe busca na organização do perfil', async () => {
    logado();
    leadsService.obterLead.mockResolvedValue({ id: LEAD });
    const resposta = await get(`/leads/${LEAD}`);
    expect(resposta.status).toBe(200);
    expect(leadsService.obterLead).toHaveBeenCalledWith(ORG, LEAD);
  });

  it('id malformado responde 404 sem consultar o banco', async () => {
    logado();
    const resposta = await get('/leads/abc');
    expect(resposta.status).toBe(404);
    expect(resposta.body).toEqual({ erro: 'Lead não encontrado' });
    expect(leadsService.obterLead).not.toHaveBeenCalled();
  });

  it('atualização parcial: só os campos enviados, null limpa o campo', async () => {
    logado();
    leadsService.atualizarLead.mockResolvedValue({ id: LEAD });
    const resposta = await put(`/leads/${LEAD}`, { status: 'descartado', nome_decisor: null, score_valor: 99 });
    expect(resposta.status).toBe(200);
    expect(leadsService.atualizarLead).toHaveBeenCalledWith(ORG, LEAD, { status: 'descartado', nome_decisor: null });
  });

  it('CNPJ não pode ser alterado', async () => {
    logado();
    const resposta = await put(`/leads/${LEAD}`, { cnpj: '11222333000181' });
    expect(resposta.status).toBe(400);
    expect(leadsService.atualizarLead).not.toHaveBeenCalled();
  });

  it('nome_lead não pode ser apagado', async () => {
    logado();
    const resposta = await put(`/leads/${LEAD}`, { nome_lead: null });
    expect(resposta.status).toBe(400);
  });

  it('sem campos válidos responde 400', async () => {
    logado();
    const resposta = await put(`/leads/${LEAD}`, { organizacao_id: OUTRA_ORG });
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro).toBe('Nenhum campo válido para atualizar');
  });

  it('exclusão responde 204', async () => {
    logado();
    leadsService.excluirLead.mockResolvedValue();
    const resposta = await request(app).delete(`/leads/${LEAD}`).set('Authorization', TOKEN);
    expect(resposta.status).toBe(204);
    expect(leadsService.excluirLead).toHaveBeenCalledWith(ORG, LEAD);
  });
});
