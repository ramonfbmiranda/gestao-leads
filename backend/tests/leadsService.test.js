// Testes do serviço de leads com o supabase-js simulado: conferem os filtros
// enviados ao banco (sempre com a organização) e as regras de integridade.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/supabase.js', () => ({ supabase: { from: vi.fn() } }));

const { supabase } = await import('../src/config/supabase.js');
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
    const consultas = filaDeConsultas({ data: [], error: null });
    await expect(leadsService.atualizarLead(ORG, LEAD, { status: 'qualificado' })).rejects.toMatchObject({
      status: 404,
    });
    expect(consultas[0].chamadas).toContainEqual(['eq', 'organizacao_id', ORG]);
  });

  it('exclusão sem linha afetada responde 404', async () => {
    filaDeConsultas({ data: [], error: null });
    await expect(leadsService.excluirLead(ORG, LEAD)).rejects.toMatchObject({ status: 404 });
  });
});
