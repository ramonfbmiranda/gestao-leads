// Testes do serviço de leads com o supabase-js simulado: conferem os filtros
// enviados ao banco (sempre com a organização) e as regras de integridade.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/supabase.js', () => ({ supabase: { from: vi.fn() } }));
vi.mock('../src/services/scoreService.js', () => ({
  CAMPOS_DO_SCORE: [
    'calculadora_icp', 'calculadora_midias_sociais', 'nome_decisor', 'numero_decisor', 'redes_sociais',
    'email_decisor', 'linkedin_decisor',
  ],
  recalcularScores: vi.fn(),
  recalcularSemInterromper: vi.fn(),
}));

const { supabase } = await import('../src/config/supabase.js');
const scoreService = await import('../src/services/scoreService.js');
const leadsService = await import('../src/services/leadsService.js');

const ORG = '22222222-2222-4222-8222-222222222222';
const LEAD = '44444444-4444-4444-8444-444444444444';

/**
 * Simula a consulta encadeada do supabase-js: cada método devolve a própria
 * consulta e registra a chamada; o "await" entrega o resultado configurado.
 */
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

// Cada chamada a supabase.from(tabela) consome o próximo resultado da fila.
function filaDeConsultas(...resultados) {
  const consultas = [];
  supabase.from.mockImplementation((tabela) => {
    const consulta = consultaFalsa(resultados.shift());
    consultas.push({ tabela, chamadas: consulta.chamadas });
    return consulta;
  });
  return consultas;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('filtroDeBusca', () => {
  it('busca em nome, decisor, razão social e CNPJ sem máscara', () => {
    expect(leadsService.filtroDeBusca('12.abc.345')).toBe(
      'nome_lead.ilike.*12*abc*345*,nome_decisor.ilike.*12*abc*345*,razao_social.ilike.*12*abc*345*,cnpj.ilike.*12ABC345*',
    );
  });

  it('caracteres da sintaxe do filtro viram curinga (sem injeção)', () => {
    const filtro = leadsService.filtroDeBusca('a),status.eq.novo');
    expect(filtro).not.toContain(')');
    expect(filtro.split(',')).toHaveLength(3);
    expect(filtro).toContain('nome_lead.ilike.*a*status*eq*novo*');
  });

  it('termo só com símbolos não filtra nada', () => {
    expect(leadsService.filtroDeBusca('(),*')).toBeNull();
  });

  it('nomes com espaço e acento são mantidos', () => {
    expect(leadsService.filtroDeBusca('Padaria São João')).toContain('nome_lead.ilike.*Padaria São João*');
  });
});

describe('listarLeads', () => {
  const filtros = { status: 'novo', busca: null, ordem: 'score_compensacao', direcao: 'desc', pagina: 2, limite: 20 };

  it('filtra pela organização, ordena com N/A no fim e pagina', async () => {
    const consultas = filaDeConsultas({ data: [{ id: LEAD }], error: null, count: 21 });
    const resultado = await leadsService.listarLeads(ORG, filtros);

    expect(resultado).toEqual({ leads: [{ id: LEAD }], total: 21, pagina: 2, limite: 20 });
    const { chamadas } = consultas[0];
    expect(chamadas).toContainEqual(['eq', 'organizacao_id', ORG]);
    expect(chamadas).toContainEqual(['eq', 'status', 'novo']);
    expect(chamadas).toContainEqual(['order', 'score_compensacao', { ascending: false, nullsFirst: false }]);
    expect(chamadas).toContainEqual(['range', 20, 39]);
  });

  it('sem filtro de faixa não consulta a organização', async () => {
    const consultas = filaDeConsultas({ data: [], error: null, count: 0 });
    await leadsService.listarLeads(ORG, filtros);
    expect(consultas.map((c) => c.tabela)).toEqual(['leads']);
  });

  it.each([
    ['alta', [['gte', 'score_compensacao', 75]]],
    ['media', [['gte', 'score_compensacao', 50], ['lt', 'score_compensacao', 75]]],
    ['baixa', [['lt', 'score_compensacao', 50]]],
    ['na', [['is', 'score_compensacao', null]]],
  ])('filtra a faixa %s com os limites da organização', async (faixa, esperadas) => {
    const consultas = filaDeConsultas(
      { data: { config_score: { faixas: { alta: 75, media: 50 } } }, error: null },
      { data: [], error: null, count: 0 },
    );
    await leadsService.listarLeads(ORG, { ...filtros, faixa });
    const { chamadas } = consultas[1];
    for (const chamada of esperadas) expect(chamadas).toContainEqual(chamada);
    expect(chamadas).toContainEqual(['eq', 'organizacao_id', ORG]);
  });

  it('página além do fim devolve lista vazia com o total', async () => {
    filaDeConsultas(
      { data: null, error: { code: 'PGRST103', message: 'range not satisfiable' }, count: null },
      { data: null, error: null, count: 5 },
    );
    const resultado = await leadsService.listarLeads(ORG, { ...filtros, pagina: 9 });
    expect(resultado).toEqual({ leads: [], total: 5, pagina: 9, limite: 20 });
  });
});

describe('criarLead', () => {
  it('recusa nota acima da escala da organização sem gravar nada', async () => {
    const consultas = filaDeConsultas({
      data: { escala_icp_max: 10, escala_midias_max: 100, escala_nota_max: 100 },
      error: null,
    });
    await expect(
      leadsService.criarLead(ORG, { cnpj: '11222333000181', nome_lead: 'X', calculadora_icp: 15 }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('entre 0 e 10') });
    expect(consultas.map((consulta) => consulta.tabela)).toEqual(['organizacoes']);
  });

  it('CNPJ já existente na organização responde 409', async () => {
    filaDeConsultas({ data: null, error: { code: '23505' } });
    await expect(leadsService.criarLead(ORG, { cnpj: '11222333000181', nome_lead: 'X' })).rejects.toMatchObject({
      status: 409,
      message: 'Já existe um lead com este CNPJ na organização',
    });
  });

  it('responsável de outra organização responde 400', async () => {
    filaDeConsultas({ data: null, error: { code: '23503' } });
    await expect(
      leadsService.criarLead(ORG, { cnpj: '11222333000181', nome_lead: 'X', responsavel_id: LEAD }),
    ).rejects.toMatchObject({ status: 400, message: 'Responsável não encontrado' });
  });

  it('grava o lead com a organização e acrescenta os links', async () => {
    const consultas = filaDeConsultas(
      { data: { id: LEAD }, error: null },
      { data: null, error: null },
      { data: { id: LEAD }, error: null },
    );
    await leadsService.criarLead(ORG, { cnpj: '11222333000181', nome_lead: 'X', redes_sociais: 'instagram.com/x' });

    expect(consultas[0].chamadas[0]).toEqual([
      'insert',
      { cnpj: '11222333000181', nome_lead: 'X', redes_sociais: 'instagram.com/x', organizacao_id: ORG },
    ]);
    expect(consultas[1].tabela).toBe('lead_redes_sociais');
    expect(consultas[1].chamadas[0]).toEqual([
      'upsert',
      [{ lead_id: LEAD, plataforma: 'instagram', url: 'https://instagram.com/x' }],
      { onConflict: 'lead_id,url', ignoreDuplicates: true },
    ]);
    expect(scoreService.recalcularSemInterromper).toHaveBeenCalledWith(ORG, { ids: [LEAD] });
  });

  it('se gravar os links falhar, desfaz o lead', async () => {
    const consultas = filaDeConsultas(
      { data: { id: LEAD }, error: null },
      { data: null, error: { code: 'XX000', message: 'falha' } },
      { data: null, error: null },
    );
    await expect(
      leadsService.criarLead(ORG, { cnpj: '11222333000181', nome_lead: 'X', redes_sociais: 'empresa.com.br' }),
    ).rejects.toThrow();
    expect(consultas[2].tabela).toBe('leads');
    expect(consultas[2].chamadas).toContainEqual(['delete']);
    expect(consultas[2].chamadas).toContainEqual(['eq', 'organizacao_id', ORG]);
  });
});

describe('atualizarLead e excluirLead', () => {
  it('lead de outra organização (nenhuma linha afetada) responde 404', async () => {
    let consultas = filaDeConsultas({ data: [], error: null });
    await expect(leadsService.atualizarLead(ORG, LEAD, { nome_decisor: 'Ana' })).rejects.toMatchObject({
      status: 404,
    });
    expect(consultas[0].chamadas).toContainEqual(['eq', 'organizacao_id', ORG]);

    // Com status, o lead é lido antes (regras do desfecho): não achou, 404 sem gravar.
    consultas = filaDeConsultas({ data: null, error: null });
    await expect(leadsService.atualizarLead(ORG, LEAD, { status: 'qualificado' })).rejects.toMatchObject({
      status: 404,
    });
    expect(consultas).toHaveLength(1);
    expect(consultas[0].chamadas).toContainEqual(['eq', 'organizacao_id', ORG]);
  });

  it('editar campo que influencia o score recalcula; editar só o status não', async () => {
    filaDeConsultas(
      { data: { status: 'novo', motivo_descarte: null }, error: null },
      { data: [{ id: LEAD }], error: null },
      { data: { id: LEAD }, error: null },
    );
    await leadsService.atualizarLead(ORG, LEAD, { status: 'qualificado' });
    expect(scoreService.recalcularSemInterromper).not.toHaveBeenCalled();

    filaDeConsultas({ data: [{ id: LEAD }], error: null }, { data: { id: LEAD }, error: null });
    await leadsService.atualizarLead(ORG, LEAD, { nome_decisor: null });
    expect(scoreService.recalcularSemInterromper).toHaveBeenCalledWith(ORG, { ids: [LEAD] });

    scoreService.recalcularSemInterromper.mockClear();
    filaDeConsultas({ data: [{ id: LEAD }], error: null }, { data: { id: LEAD }, error: null });
    await leadsService.atualizarLead(ORG, LEAD, { email_decisor: 'ana@exemplo.com' });
    expect(scoreService.recalcularSemInterromper).toHaveBeenCalledWith(ORG, { ids: [LEAD] });
  });

  it('calcular score de lead inexistente responde 404', async () => {
    scoreService.recalcularScores.mockResolvedValue(0);
    await expect(leadsService.calcularScoreDoLead(ORG, LEAD)).rejects.toMatchObject({ status: 404 });
  });

  it('exclusão sem linha afetada responde 404', async () => {
    filaDeConsultas({ data: [], error: null });
    await expect(leadsService.excluirLead(ORG, LEAD)).rejects.toMatchObject({ status: 404 });
  });
});

describe('desfecho (seção 8.10)', () => {
  const SCORE = {
    score_valor: 70,
    score_probabilidade: 60,
    score_esforco: 20,
    score_compensacao: 54.1,
    score_confianca: 90,
    score_parcial: false,
    score_detalhes: { versao: 2, faixa: 'media' },
    score_calculado_em: '2026-11-20T10:00:00Z',
  };
  const ORGANIZACAO = { data: { config_score: {} }, error: null };
  const ok = (data) => ({ data, error: null });
  // Fila padrão: lê o lead, [organização], grava, devolve o detalhe.
  const gravacao = (consultas) => consultas.find(({ chamadas }) => chamadas[0][0] === 'update').chamadas[0][1];

  it('descartar sem motivo responde 400 sem gravar', async () => {
    const consultas = filaDeConsultas(ok({ status: 'em_contato', motivo_descarte: null, ...SCORE }));
    await expect(leadsService.atualizarLead(ORG, LEAD, { status: 'descartado' })).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('motivo_descarte'),
    });
    expect(consultas.map(({ chamadas }) => chamadas[0][0])).toEqual(['select']);
  });

  it('motivo fora da lista da organização responde 400 com as opções', async () => {
    filaDeConsultas(
      ok({ status: 'em_contato', motivo_descarte: null, ...SCORE }),
      ok({ config_score: { motivos_descarte: ['Preço', 'Prazo'] } }),
    );
    await expect(
      leadsService.atualizarLead(ORG, LEAD, { status: 'descartado', motivo_descarte: 'Sem orçamento' }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('Preço, Prazo') });
  });

  it('descartar grava o motivo como configurado, desfecho_em e a cópia do score', async () => {
    const consultas = filaDeConsultas(
      ok({ status: 'em_contato', motivo_descarte: null, ...SCORE }),
      ORGANIZACAO,
      ok([{ id: LEAD }]),
      ok({ id: LEAD }),
    );
    await leadsService.atualizarLead(ORG, LEAD, { status: 'descartado', motivo_descarte: 'sem orçamento' });
    const dados = gravacao(consultas);
    expect(dados).toEqual({
      status: 'descartado',
      motivo_descarte: 'Sem orçamento',
      desfecho_em: expect.any(String),
      desfecho_score: SCORE,
    });
    expect(Date.now() - new Date(dados.desfecho_em).getTime()).toBeLessThan(5000);
    expect(consultas[0].chamadas).toContainEqual(['eq', 'organizacao_id', ORG]);
  });

  it('converter não exige motivo; de descartado para convertido grava de novo e limpa o motivo', async () => {
    let consultas = filaDeConsultas(ok({ status: 'qualificado', motivo_descarte: null, ...SCORE }), ok([{ id: LEAD }]), ok({}));
    await leadsService.atualizarLead(ORG, LEAD, { status: 'convertido' });
    expect(gravacao(consultas)).toEqual({ status: 'convertido', desfecho_em: expect.any(String), desfecho_score: SCORE });

    consultas = filaDeConsultas(ok({ status: 'descartado', motivo_descarte: 'Outro', ...SCORE }), ok([{ id: LEAD }]), ok({}));
    await leadsService.atualizarLead(ORG, LEAD, { status: 'convertido' });
    expect(gravacao(consultas)).toEqual({
      status: 'convertido',
      motivo_descarte: null,
      desfecho_em: expect.any(String),
      desfecho_score: SCORE,
    });
  });

  it('voltar de um desfecho para o funil limpa desfecho_em, desfecho_score e motivo', async () => {
    const consultas = filaDeConsultas(
      ok({ status: 'descartado', motivo_descarte: 'Outro', ...SCORE }),
      ok([{ id: LEAD }]),
      ok({}),
    );
    // O motivo enviado junto é ignorado: fora de "descartado" não há motivo.
    await leadsService.atualizarLead(ORG, LEAD, { status: 'em_contato', motivo_descarte: 'Outro' });
    expect(gravacao(consultas)).toEqual({
      status: 'em_contato',
      motivo_descarte: null,
      desfecho_em: null,
      desfecho_score: null,
    });
  });

  it('lead já descartado com motivo: repetir o status não exige motivo nem refaz o desfecho', async () => {
    let consultas = filaDeConsultas(ok({ status: 'descartado', motivo_descarte: 'Outro', ...SCORE }), ok([{ id: LEAD }]), ok({}));
    await leadsService.atualizarLead(ORG, LEAD, { status: 'descartado', nome_decisor: 'Ana' });
    expect(gravacao(consultas)).toEqual({ status: 'descartado', nome_decisor: 'Ana' });

    // Trocar só o motivo.
    consultas = filaDeConsultas(
      ok({ status: 'descartado', motivo_descarte: 'Outro', ...SCORE }),
      ORGANIZACAO,
      ok([{ id: LEAD }]),
      ok({}),
    );
    await leadsService.atualizarLead(ORG, LEAD, { motivo_descarte: 'Fora do perfil' });
    expect(gravacao(consultas)).toEqual({ motivo_descarte: 'Fora do perfil' });

    // Apagar o motivo de um descartado não pode.
    filaDeConsultas(ok({ status: 'descartado', motivo_descarte: 'Outro', ...SCORE }));
    await expect(leadsService.atualizarLead(ORG, LEAD, { motivo_descarte: null })).rejects.toMatchObject({ status: 400 });
  });

  it('cadastro já descartado exige motivo', async () => {
    const consultas = filaDeConsultas();
    await expect(
      leadsService.criarLead(ORG, { cnpj: '11222333000181', nome_lead: 'X', status: 'descartado' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(consultas).toHaveLength(0);
  });

  it('cadastro já convertido: copia o score depois do primeiro cálculo', async () => {
    const consultas = filaDeConsultas(ok({ id: LEAD }), ok(SCORE), ok(null), ok({ id: LEAD }));
    await leadsService.criarLead(ORG, { cnpj: '11222333000181', nome_lead: 'X', status: 'convertido' });

    expect(consultas[0].chamadas[0]).toEqual([
      'insert',
      {
        cnpj: '11222333000181',
        nome_lead: 'X',
        status: 'convertido',
        desfecho_em: expect.any(String),
        desfecho_score: null,
        organizacao_id: ORG,
      },
    ]);
    expect(scoreService.recalcularSemInterromper).toHaveBeenCalledWith(ORG, { ids: [LEAD] });
    expect(consultas[2].chamadas[0]).toEqual(['update', { desfecho_score: SCORE }]);
    expect(consultas[2].chamadas).toContainEqual(['eq', 'organizacao_id', ORG]);
  });
});
