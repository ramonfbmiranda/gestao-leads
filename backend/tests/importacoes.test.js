// Rotas e serviço de importação com o Supabase simulado.

import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/supabase.js', () => ({
  supabase: { auth: { getClaims: vi.fn() }, from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../src/services/contaService.js', () => ({ buscarPerfil: vi.fn() }));
vi.mock('../src/services/scoreService.js', () => ({ recalcularSemInterromper: vi.fn() }));

const { supabase } = await import('../src/config/supabase.js');
const scoreService = await import('../src/services/scoreService.js');
const contaService = await import('../src/services/contaService.js');
const { TAMANHO_LOTE } = await import('../src/services/importacoesService.js');
const { criarApp } = await import('../src/app.js');

const app = criarApp();
const TOKEN = 'Bearer token-valido';
const USUARIO_ID = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const IMPORTACAO = '55555555-5555-4555-8555-555555555555';

const CSV = Buffer.from('CNPJ;Nome do Lead;Nota final\n11222333000181;Padaria;8\n12ABC34501DE35;Mercado;B\n');
const MAPEAMENTO = JSON.stringify({ cnpj: 'CNPJ', nome_lead: 'Nome do Lead', nota_final: 'Nota final' });

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
  data: { escala_icp_max: 10, escala_midias_max: 100, escala_nota_max: 100, config_score: {} },
  error: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  supabase.auth.getClaims.mockResolvedValue({
    data: { claims: { sub: USUARIO_ID, email: 'ana@exemplo.com', role: 'authenticated' } },
    error: null,
  });
  contaService.buscarPerfil.mockResolvedValue({ id: USUARIO_ID, organizacao_id: ORG, papel: 'membro' });
});

describe('POST /importacoes/preview', () => {
  it('devolve colunas, amostra, total e sugestão sem gravar nada', async () => {
    const resposta = await request(app)
      .post('/importacoes/preview')
      .set('Authorization', TOKEN)
      .attach('arquivo', CSV, 'Leads São Paulo.csv');
    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({
      nome_arquivo: 'Leads São Paulo.csv',
      colunas: ['CNPJ', 'Nome do Lead', 'Nota final'],
      amostra: [
        { CNPJ: '11222333000181', 'Nome do Lead': 'Padaria', 'Nota final': '8' },
        { CNPJ: '12ABC34501DE35', 'Nome do Lead': 'Mercado', 'Nota final': 'B' },
      ],
      total_linhas: 2,
      mapeamento_sugerido: { cnpj: 'CNPJ', nome_lead: 'Nome do Lead', nota_final: 'Nota final', nome_decisor: null },
    });
    expect(resposta.body.campos).toHaveLength(10);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('sem arquivo responde 400', async () => {
    const resposta = await request(app).post('/importacoes/preview').set('Authorization', TOKEN).send({});
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro).toContain('campo "arquivo"');
  });

  it('arquivo em outro campo responde 400', async () => {
    const resposta = await request(app)
      .post('/importacoes/preview')
      .set('Authorization', TOKEN)
      .attach('planilha', CSV, 'leads.csv');
    expect(resposta.status).toBe(400);
  });

  it('arquivo acima de 5 MB responde 413', async () => {
    const grande = Buffer.alloc(5 * 1024 * 1024 + 1, 'a');
    const resposta = await request(app)
      .post('/importacoes/preview')
      .set('Authorization', TOKEN)
      .attach('arquivo', grande, 'leads.csv');
    expect(resposta.status).toBe(413);
    expect(resposta.body).toEqual({ erro: 'Arquivo maior que 5 MB' });
  });

  it('sem token não recebe o arquivo', async () => {
    const resposta = await request(app).post('/importacoes/preview').attach('arquivo', CSV, 'leads.csv');
    expect(resposta.status).toBe(401);
  });
});

describe('POST /importacoes', () => {
  it('sem mapeamento ou com JSON inválido responde 400', async () => {
    let resposta = await request(app).post('/importacoes').set('Authorization', TOKEN).attach('arquivo', CSV, 'a.csv');
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro).toContain('mapeamento');

    resposta = await request(app)
      .post('/importacoes')
      .set('Authorization', TOKEN)
      .field('mapeamento', '{cnpj:')
      .attach('arquivo', CSV, 'a.csv');
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro).toContain('não é um JSON válido');
  });

  it('mapeamento sem campo obrigatório responde 400 antes de gravar', async () => {
    const resposta = await request(app)
      .post('/importacoes')
      .set('Authorization', TOKEN)
      .field('mapeamento', JSON.stringify({ cnpj: 'CNPJ' }))
      .attach('arquivo', CSV, 'a.csv');
    expect(resposta.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('cria o histórico, grava o lote e finaliza como concluída', async () => {
    const consultas = filaDeConsultas(ORGANIZACAO, { data: { id: IMPORTACAO }, error: null }, {
      data: { id: IMPORTACAO, status: 'concluida', inseridos: 1, atualizados: 1 },
      error: null,
    });
    supabase.rpc.mockResolvedValue({ data: { inseridos: 1, atualizados: 1 }, error: null });

    const resposta = await request(app)
      .post('/importacoes')
      .set('Authorization', TOKEN)
      .field('mapeamento', MAPEAMENTO)
      .attach('arquivo', CSV, 'leads.csv');

    expect(resposta.status).toBe(201);
    expect(consultas[1].tabela).toBe('importacoes');
    expect(consultas[1].chamadas[0]).toEqual([
      'insert',
      expect.objectContaining({ organizacao_id: ORG, criado_por: USUARIO_ID, nome_arquivo: 'leads.csv', total_linhas: 2 }),
    ]);

    const [nomeFuncao, argumentos] = supabase.rpc.mock.calls[0];
    expect(nomeFuncao).toBe('importar_leads_lote');
    expect(argumentos.p_organizacao_id).toBe(ORG);
    expect(argumentos.p_leads.map((lead) => [lead.cnpj, lead.nota_final])).toEqual([
      ['11222333000181', 8],
      ['12ABC34501DE35', 75],
    ]);
    expect(consultas[2].chamadas[0]).toEqual([
      'update',
      { inseridos: 1, atualizados: 1, ignorados: 0, erros: [], status: 'concluida' },
    ]);
    expect(scoreService.recalcularSemInterromper).toHaveBeenCalledWith(ORG, { importacaoId: IMPORTACAO });
  });

  it(`divide em lotes de ${TAMANHO_LOTE} e, se um lote falhar, marca como falhou`, async () => {
    const linhas = Array.from({ length: TAMANHO_LOTE + 1 }, (_, i) => {
      const base = String(i + 1).padStart(12, '0');
      return `${base}${calcularDv(base)};Lead ${i + 1}`;
    });
    const csv = Buffer.from(`CNPJ;Nome do Lead\n${linhas.join('\n')}\n`);
    const consultas = filaDeConsultas(ORGANIZACAO, { data: { id: IMPORTACAO }, error: null }, { data: {}, error: null });
    supabase.rpc
      .mockResolvedValueOnce({ data: { inseridos: TAMANHO_LOTE, atualizados: 0 }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'falha' } });

    const resposta = await request(app)
      .post('/importacoes')
      .set('Authorization', TOKEN)
      .field('mapeamento', JSON.stringify({ cnpj: 'CNPJ', nome_lead: 'Nome do Lead' }))
      .attach('arquivo', csv, 'grande.csv');

    expect(resposta.status).toBe(500);
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
    expect(supabase.rpc.mock.calls[0][1].p_leads).toHaveLength(TAMANHO_LOTE);
    const [, atualizacao] = consultas[2].chamadas[0];
    expect(atualizacao).toMatchObject({ inseridos: TAMANHO_LOTE, atualizados: 0, ignorados: 1, status: 'falhou' });
    expect(scoreService.recalcularSemInterromper).not.toHaveBeenCalled();
  });
});

describe('GET /importacoes', () => {
  it('lista o histórico da organização', async () => {
    const consultas = filaDeConsultas({ data: [], error: null });
    const resposta = await request(app).get('/importacoes').set('Authorization', TOKEN);
    expect(resposta.status).toBe(200);
    expect(consultas[0].chamadas).toContainEqual(['eq', 'organizacao_id', ORG]);
  });

  it('detalhe de outra organização ou inexistente responde 404', async () => {
    filaDeConsultas({ data: null, error: null });
    const resposta = await request(app).get(`/importacoes/${IMPORTACAO}`).set('Authorization', TOKEN);
    expect(resposta.status).toBe(404);
  });

  it('id malformado responde 404', async () => {
    const resposta = await request(app).get('/importacoes/abc').set('Authorization', TOKEN);
    expect(resposta.status).toBe(404);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

// Dígitos verificadores de CNPJs numéricos gerados para o teste de lotes.
function calcularDv(base) {
  const digito = (texto, pesos) => {
    const resto = pesos.reduce((soma, peso, i) => soma + Number(texto[i]) * peso, 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const dv1 = digito(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = digito(base + dv1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${dv1}${dv2}`;
}
