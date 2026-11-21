// Rotas e serviço de interações com o Supabase simulado: validação, permissão
// de exclusão, isolamento por organização e atualização do resumo do lead.

import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/supabase.js', () => ({
  supabase: { auth: { getClaims: vi.fn() }, from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../src/services/contaService.js', () => ({ buscarPerfil: vi.fn() }));
vi.mock('../src/services/scoreService.js', () => ({ recalcularSemInterromper: vi.fn() }));

const { supabase } = await import('../src/config/supabase.js');
const contaService = await import('../src/services/contaService.js');
const scoreService = await import('../src/services/scoreService.js');
const { criarApp } = await import('../src/app.js');

const app = criarApp();
const TOKEN = 'Bearer token-valido';
const USUARIO_ID = '11111111-1111-4111-8111-111111111111';
const OUTRO_PERFIL = '66666666-6666-4666-8666-666666666666';
const ORG = '22222222-2222-4222-8222-222222222222';
const LEAD = '44444444-4444-4444-8444-444444444444';
const INTERACAO = '55555555-5555-4555-8555-555555555555';

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

function logado(papel = 'membro') {
  contaService.buscarPerfil.mockResolvedValue({ id: USUARIO_ID, organizacao_id: ORG, nome: 'Ana', papel });
}

const rota = `/leads/${LEAD}/interacoes`;
const get = (caminho) => request(app).get(caminho).set('Authorization', TOKEN);
const post = (caminho, corpo) => request(app).post(caminho).set('Authorization', TOKEN).send(corpo);
const del = (caminho) => request(app).delete(caminho).set('Authorization', TOKEN);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  supabase.auth.getClaims.mockResolvedValue({
    data: { claims: { sub: USUARIO_ID, email: 'ana@exemplo.com', role: 'authenticated' } },
    error: null,
  });
  supabase.rpc.mockResolvedValue({ data: null, error: null });
  logado();
});

describe('GET /leads/:id/interacoes', () => {
  it('confere o lead na organização e lista da mais recente para a mais antiga', async () => {
    const consultas = filaDeConsultas({ data: { id: LEAD }, error: null }, { data: [{ id: INTERACAO }], error: null });
    const resposta = await get(rota);
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual([{ id: INTERACAO }]);
    expect(consultas[0]).toMatchObject({ tabela: 'leads' });
    expect(consultas[0].chamadas).toContainEqual(['eq', 'organizacao_id', ORG]);
    expect(consultas[1].tabela).toBe('interacoes');
    expect(consultas[1].chamadas).toContainEqual(['eq', 'organizacao_id', ORG]);
    expect(consultas[1].chamadas).toContainEqual(['eq', 'lead_id', LEAD]);
    expect(consultas[1].chamadas).toContainEqual(['order', 'ocorreu_em', { ascending: false }]);
  });

  it('lead de outra organização ou inexistente responde 404', async () => {
    const consultas = filaDeConsultas({ data: null, error: null });
    const resposta = await get(rota);
    expect(resposta.status).toBe(404);
    expect(resposta.body).toEqual({ erro: 'Lead não encontrado' });
    expect(consultas).toHaveLength(1);
  });

  it('id malformado responde 404 sem consultar o banco', async () => {
    const resposta = await get('/leads/abc/interacoes');
    expect(resposta.status).toBe(404);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('POST /leads/:id/interacoes', () => {
  it('grava com quem registrou, atualiza o resumo e recalcula; 201 com a interação', async () => {
    const interacao = { id: INTERACAO, tipo: 'ligacao', teve_resposta: false };
    const consultas = filaDeConsultas({ data: interacao, error: null });
    const resposta = await post(rota, {
      tipo: 'ligacao',
      teve_resposta: false,
      observacao: '  Caixa postal ',
      ocorreu_em: '2026-01-10T14:00:00-03:00',
      perfil_id: OUTRO_PERFIL,
      organizacao_id: '33333333-3333-4333-8333-333333333333',
    });

    expect(resposta.status).toBe(201);
    expect(resposta.body).toEqual(interacao);
    expect(consultas[0].tabela).toBe('interacoes');
    expect(consultas[0].chamadas[0]).toEqual([
      'insert',
      {
        tipo: 'ligacao',
        teve_resposta: false,
        observacao: 'Caixa postal',
        ocorreu_em: '2026-01-10T17:00:00.000Z',
        organizacao_id: ORG,
        lead_id: LEAD,
        perfil_id: USUARIO_ID,
      },
    ]);
    expect(supabase.rpc).toHaveBeenCalledWith('atualizar_resumo_interacoes', { p_organizacao_id: ORG, p_lead_id: LEAD });
    expect(scoreService.recalcularSemInterromper).toHaveBeenCalledWith(ORG, { ids: [LEAD] });
  });

  it('sem ocorreu_em, deixa o banco usar a hora atual', async () => {
    const consultas = filaDeConsultas({ data: { id: INTERACAO }, error: null });
    await post(rota, { tipo: 'whatsapp', teve_resposta: true });
    const [, dados] = consultas[0].chamadas[0];
    expect(dados).not.toHaveProperty('ocorreu_em');
    expect(dados.observacao).toBeNull();
  });

  it('aceita até 5 minutos no futuro (diferença de relógio)', async () => {
    filaDeConsultas({ data: { id: INTERACAO }, error: null });
    const resposta = await post(rota, {
      tipo: 'email',
      teve_resposta: false,
      ocorreu_em: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
    });
    expect(resposta.status).toBe(201);
  });

  it.each([
    [{ teve_resposta: false }, 'tipo'],
    [{ tipo: 'telegrama', teve_resposta: false }, 'tipo'],
    [{ tipo: 'ligacao' }, 'teve_resposta'],
    [{ tipo: 'ligacao', teve_resposta: 'sim' }, 'teve_resposta'],
    [{ tipo: 'ligacao', teve_resposta: true, observacao: 'x'.repeat(2001) }, 'observacao'],
    [{ tipo: 'ligacao', teve_resposta: true, ocorreu_em: '10/01/2026' }, 'ocorreu_em'],
    [{ tipo: 'ligacao', teve_resposta: true, ocorreu_em: new Date(Date.now() + 10 * 60 * 1000).toISOString() }, 'futuro'],
  ])('recusa %j com 400', async (corpo, trecho) => {
    const resposta = await post(rota, corpo);
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro).toContain(trecho);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('lead de outra organização (a chave estrangeira recusa) responde 404 sem mexer no resumo', async () => {
    filaDeConsultas({ data: null, error: { code: '23503', message: 'violates foreign key constraint' } });
    const resposta = await post(rota, { tipo: 'ligacao', teve_resposta: false });
    expect(resposta.status).toBe(404);
    expect(resposta.body).toEqual({ erro: 'Lead não encontrado' });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(scoreService.recalcularSemInterromper).not.toHaveBeenCalled();
  });

  it('lead malformado responde 404', async () => {
    const resposta = await post('/leads/abc/interacoes', { tipo: 'ligacao', teve_resposta: false });
    expect(resposta.status).toBe(404);
  });
});

describe('DELETE /leads/:id/interacoes/:interacaoId', () => {
  const rotaExclusao = `${rota}/${INTERACAO}`;

  it('quem registrou exclui: 204, atualiza o resumo e recalcula', async () => {
    const consultas = filaDeConsultas(
      { data: { id: INTERACAO, perfil_id: USUARIO_ID }, error: null },
      { data: [{ id: INTERACAO }], error: null },
    );
    const resposta = await del(rotaExclusao);
    expect(resposta.status).toBe(204);
    expect(consultas[0].chamadas).toEqual(
      expect.arrayContaining([
        ['eq', 'id', INTERACAO],
        ['eq', 'lead_id', LEAD],
        ['eq', 'organizacao_id', ORG],
      ]),
    );
    expect(consultas[1].chamadas).toContainEqual(['delete']);
    expect(consultas[1].chamadas).toContainEqual(['eq', 'organizacao_id', ORG]);
    expect(supabase.rpc).toHaveBeenCalledWith('atualizar_resumo_interacoes', { p_organizacao_id: ORG, p_lead_id: LEAD });
    expect(scoreService.recalcularSemInterromper).toHaveBeenCalledWith(ORG, { ids: [LEAD] });
  });

  it('outro membro recebe 403 e nada é excluído', async () => {
    const consultas = filaDeConsultas({ data: { id: INTERACAO, perfil_id: OUTRO_PERFIL }, error: null });
    const resposta = await del(rotaExclusao);
    expect(resposta.status).toBe(403);
    expect(resposta.body.erro).toContain('administrador');
    expect(consultas).toHaveLength(1);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('admin exclui a interação de outro membro (ou de perfil já removido)', async () => {
    logado('admin');
    filaDeConsultas({ data: { id: INTERACAO, perfil_id: null }, error: null }, { data: [{ id: INTERACAO }], error: null });
    expect((await del(rotaExclusao)).status).toBe(204);
  });

  it('interação inexistente, de outro lead ou de outra organização responde 404', async () => {
    filaDeConsultas({ data: null, error: null });
    const resposta = await del(rotaExclusao);
    expect(resposta.status).toBe(404);
    expect(resposta.body).toEqual({ erro: 'Interação não encontrada' });
  });

  it('ids malformados respondem 404 sem consultar o banco', async () => {
    expect((await del(`${rota}/abc`)).status).toBe(404);
    expect((await del(`/leads/abc/interacoes/${INTERACAO}`)).status).toBe(404);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
