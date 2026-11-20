// Testes da API com o Supabase simulado: verificam autenticação, papéis,
// isolamento por organização e formato dos erros, sem banco real.

import { AuthInvalidJwtError, AuthRetryableFetchError } from '@supabase/supabase-js';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/supabase.js', () => ({
  supabase: { auth: { getClaims: vi.fn() }, from: vi.fn() },
}));
vi.mock('../src/services/contaService.js', () => ({
  buscarPerfil: vi.fn(),
  obterDadosConta: vi.fn(),
  criarOrganizacao: vi.fn(),
  aceitarConvite: vi.fn(),
}));
vi.mock('../src/services/membrosService.js', () => ({
  listarMembros: vi.fn(),
  listarConvitesPendentes: vi.fn(),
  cancelarConvite: vi.fn(),
  convidarMembro: vi.fn(),
}));

const { supabase } = await import('../src/config/supabase.js');
const contaService = await import('../src/services/contaService.js');
const membrosService = await import('../src/services/membrosService.js');
const { criarApp } = await import('../src/app.js');

const app = criarApp();

const USUARIO_ID = '11111111-1111-4111-8111-111111111111';
const ORG_DO_USUARIO = '22222222-2222-4222-8222-222222222222';
const OUTRA_ORG = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'Bearer token-valido';

function tokenValido(claims = {}) {
  supabase.auth.getClaims.mockResolvedValue({
    data: { claims: { sub: USUARIO_ID, email: 'Ana@Exemplo.com', role: 'authenticated', ...claims } },
    error: null,
  });
}

function comPerfil(papel) {
  contaService.buscarPerfil.mockResolvedValue({
    id: USUARIO_ID,
    organizacao_id: ORG_DO_USUARIO,
    nome: 'Ana',
    papel,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('rotas públicas', () => {
  it('GET / responde online', async () => {
    const resposta = await request(app).get('/');
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ mensagem: 'API de Leads online' });
  });

  it('GET /saude responde ok quando o banco responde', async () => {
    supabase.from.mockReturnValue({
      select: () => ({ limit: () => ({ abortSignal: async () => ({ error: null }) }) }),
    });
    const resposta = await request(app).get('/saude');
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ status: 'ok', banco: 'ok' });
  });

  it('GET /saude responde 503 sem expor o erro do banco', async () => {
    supabase.from.mockReturnValue({
      select: () => ({
        limit: () => ({ abortSignal: async () => ({ error: { code: 'XX', message: 'detalhe interno' } }) }),
      }),
    });
    const resposta = await request(app).get('/saude');
    expect(resposta.status).toBe(503);
    expect(resposta.body).toEqual({ erro: 'Banco de dados indisponível' });
  });

  it('rota inexistente responde 404 no formato padrão', async () => {
    const resposta = await request(app).get('/nao-existe');
    expect(resposta.status).toBe(404);
    expect(resposta.body).toEqual({ erro: 'Rota não encontrada' });
  });
});

describe('autenticar', () => {
  it('sem cabeçalho Authorization responde 401', async () => {
    const resposta = await request(app).get('/me');
    expect(resposta.status).toBe(401);
    expect(resposta.body.erro).toBe('Token de acesso ausente');
    expect(supabase.auth.getClaims).not.toHaveBeenCalled();
  });

  it.each([['Basic abc'], ['Bearer'], ['Bearer a b']])('cabeçalho malformado "%s" responde 401', async (cabecalho) => {
    const resposta = await request(app).get('/me').set('Authorization', cabecalho);
    expect(resposta.status).toBe(401);
  });

  it('token inválido ou expirado responde 401', async () => {
    supabase.auth.getClaims.mockResolvedValue({ data: null, error: new AuthInvalidJwtError('jwt expirado') });
    const resposta = await request(app).get('/me').set('Authorization', TOKEN);
    expect(resposta.status).toBe(401);
    expect(resposta.body.erro).toBe('Token inválido ou expirado');
  });

  it('token da chave pública (role anon) responde 401', async () => {
    tokenValido({ role: 'anon', sub: undefined });
    const resposta = await request(app).get('/me').set('Authorization', TOKEN);
    expect(resposta.status).toBe(401);
  });

  it('sessão anônima responde 401', async () => {
    tokenValido({ is_anonymous: true });
    const resposta = await request(app).get('/me').set('Authorization', TOKEN);
    expect(resposta.status).toBe(401);
  });

  it('falha de rede no Supabase Auth responde 503, não 401', async () => {
    supabase.auth.getClaims.mockResolvedValue({ data: null, error: new AuthRetryableFetchError('rede', 0) });
    const resposta = await request(app).get('/me').set('Authorization', TOKEN);
    expect(resposta.status).toBe(503);
  });

  it('token válido: /me recebe id e e-mail normalizado do token', async () => {
    tokenValido();
    contaService.obterDadosConta.mockResolvedValue({ perfil: null, convites_pendentes: [] });
    const resposta = await request(app).get('/me').set('Authorization', TOKEN);
    expect(resposta.status).toBe(200);
    expect(contaService.obterDadosConta).toHaveBeenCalledWith({ id: USUARIO_ID, email: 'ana@exemplo.com' });
  });
});

describe('exigirPerfil e exigirAdmin', () => {
  it('usuário sem perfil recebe 403 "Onboarding pendente"', async () => {
    tokenValido();
    contaService.buscarPerfil.mockResolvedValue(null);
    const resposta = await request(app).get('/membros').set('Authorization', TOKEN);
    expect(resposta.status).toBe(403);
    expect(resposta.body).toEqual({ erro: 'Onboarding pendente' });
  });

  it('membro não acessa rota de admin', async () => {
    tokenValido();
    comPerfil('membro');
    const resposta = await request(app).get('/membros').set('Authorization', TOKEN);
    expect(resposta.status).toBe(403);
    expect(membrosService.listarMembros).not.toHaveBeenCalled();
  });

  it('a organização vem do perfil, nunca da requisição', async () => {
    tokenValido();
    comPerfil('admin');
    membrosService.listarMembros.mockResolvedValue([]);
    const resposta = await request(app)
      .get(`/membros?organizacao_id=${OUTRA_ORG}`)
      .set('Authorization', TOKEN);
    expect(resposta.status).toBe(200);
    expect(membrosService.listarMembros).toHaveBeenCalledWith(ORG_DO_USUARIO);
  });

  it('convite ignora organizacao_id enviado no corpo', async () => {
    tokenValido();
    comPerfil('admin');
    membrosService.convidarMembro.mockResolvedValue({ convite: {}, email_enviado: true });
    const resposta = await request(app)
      .post('/membros/convite')
      .set('Authorization', TOKEN)
      .send({ email: 'Nova@Exemplo.com', organizacao_id: OUTRA_ORG });
    expect(resposta.status).toBe(201);
    expect(membrosService.convidarMembro).toHaveBeenCalledWith(
      ORG_DO_USUARIO,
      expect.objectContaining({ id: USUARIO_ID }),
      { email: 'nova@exemplo.com', papel: 'membro' },
    );
  });
});

describe('validação de entrada', () => {
  it('JSON malformado responde 400', async () => {
    tokenValido();
    const resposta = await request(app)
      .post('/onboarding')
      .set('Authorization', TOKEN)
      .set('Content-Type', 'application/json')
      .send('{"nome_organizacao":');
    expect(resposta.status).toBe(400);
    expect(resposta.body).toEqual({ erro: 'JSON inválido' });
  });

  it('onboarding sem nome_organizacao responde 400', async () => {
    tokenValido();
    const resposta = await request(app).post('/onboarding').set('Authorization', TOKEN).send({ nome: 'Ana' });
    expect(resposta.status).toBe(400);
    expect(contaService.criarOrganizacao).not.toHaveBeenCalled();
  });

  it('onboarding válido responde 201', async () => {
    tokenValido();
    contaService.criarOrganizacao.mockResolvedValue({ perfil: { papel: 'admin' } });
    const resposta = await request(app)
      .post('/onboarding')
      .set('Authorization', TOKEN)
      .send({ nome_organizacao: '  Empresa X ', nome: 'Ana' });
    expect(resposta.status).toBe(201);
    expect(contaService.criarOrganizacao).toHaveBeenCalledWith(
      { id: USUARIO_ID, email: 'ana@exemplo.com' },
      { nome_organizacao: 'Empresa X', nome: 'Ana' },
    );
  });

  it('convite com papel inválido responde 400', async () => {
    tokenValido();
    comPerfil('admin');
    const resposta = await request(app)
      .post('/membros/convite')
      .set('Authorization', TOKEN)
      .send({ email: 'a@b.com', papel: 'dono' });
    expect(resposta.status).toBe(400);
  });

  it('id malformado responde 404 sem consultar o banco', async () => {
    tokenValido();
    comPerfil('admin');
    const resposta = await request(app).delete('/convites/nao-e-uuid').set('Authorization', TOKEN);
    expect(resposta.status).toBe(404);
    expect(membrosService.cancelarConvite).not.toHaveBeenCalled();
  });

  it('aceitar convite funciona sem corpo', async () => {
    tokenValido();
    contaService.aceitarConvite.mockResolvedValue({ perfil: { papel: 'membro' } });
    const resposta = await request(app)
      .post(`/convites/${OUTRA_ORG}/aceitar`)
      .set('Authorization', TOKEN);
    expect(resposta.status).toBe(200);
    expect(contaService.aceitarConvite).toHaveBeenCalledWith(
      { id: USUARIO_ID, email: 'ana@exemplo.com' },
      OUTRA_ORG,
      { nome: null },
    );
  });

  it('erro inesperado responde 500 genérico', async () => {
    tokenValido();
    contaService.obterDadosConta.mockRejectedValue(new Error('detalhe interno'));
    const resposta = await request(app).get('/me').set('Authorization', TOKEN);
    expect(resposta.status).toBe(500);
    expect(resposta.body).toEqual({ erro: 'Erro interno do servidor' });
  });
});
