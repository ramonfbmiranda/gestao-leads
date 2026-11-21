// Avaliação do lead: validação das respostas (função pura) e serviço com o
// supabase-js simulado.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validarAvaliacao } from '../src/utils/avaliacao.js';
import { AVALIACAO_PADRAO } from '../src/utils/configScore.js';

vi.mock('../src/config/supabase.js', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../src/services/scoreService.js', () => ({ recalcularSemInterromper: vi.fn(async () => 1) }));
vi.mock('../src/services/leadsService.js', () => ({ obterLead: vi.fn(async (_, id) => ({ id, nome_lead: 'Lead' })) }));

const { supabase } = await import('../src/config/supabase.js');
const { recalcularSemInterromper } = await import('../src/services/scoreService.js');
const { avaliarLead, obterModelo } = await import('../src/services/avaliacaoService.js');

const ORG = '22222222-2222-4222-8222-222222222222';
const LEAD = '33333333-3333-4333-8333-333333333333';
const PERFIL = '44444444-4444-4444-8444-444444444444';

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

const mensagemDeErro = (fn) => {
  try {
    fn();
  } catch (erro) {
    expect(erro.status).toBe(400);
    return erro.message;
  }
  throw new Error('Era esperado um erro');
};

describe('validarAvaliacao', () => {
  it('guarda só as respostas preenchidas e ignora as nulas', () => {
    expect(validarAvaliacao({ respostas: { orcamento: 'confirmado', prazo: null } }, AVALIACAO_PADRAO)).toEqual({
      respostas: { orcamento: 'confirmado' },
    });
  });

  it('ticket enviado é arredondado; null limpa; ausente não mexe', () => {
    expect(validarAvaliacao({ respostas: {}, ticket_estimado: 1234.567 }, AVALIACAO_PADRAO)).toEqual({ respostas: {}, ticket_estimado: 1234.57 });
    expect(validarAvaliacao({ respostas: {}, ticket_estimado: null }, AVALIACAO_PADRAO).ticket_estimado).toBeNull();
    expect(validarAvaliacao({ respostas: {} }, AVALIACAO_PADRAO)).not.toHaveProperty('ticket_estimado');
  });

  it.each([
    [{}, 'deve ser um objeto'],
    [{ respostas: [] }, 'deve ser um objeto'],
    [{ respostas: { inventada: 'sim' } }, 'Pergunta desconhecida: "inventada"'],
    [{ respostas: { orcamento: 'talvez' } }, 'Opção inválida para a pergunta "orcamento"'],
    [{ respostas: { orcamento: 1 } }, 'Opção inválida'],
    [{ respostas: {}, ticket_estimado: -1 }, 'ticket_estimado'],
    [{ respostas: {}, ticket_estimado: '100' }, 'ticket_estimado'],
  ])('recusa %j', (corpo, trecho) => {
    expect(mensagemDeErro(() => validarAvaliacao(corpo, AVALIACAO_PADRAO))).toContain(trecho);
  });
});

describe('avaliacaoService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('devolve o modelo padrão quando a organização não mudou nada', async () => {
    filaDeConsultas({ data: { config_score: {} }, error: null });
    const modelo = await obterModelo(ORG);
    expect(modelo.perguntas.map((p) => p.id)).toEqual(AVALIACAO_PADRAO.map((p) => p.id));
  });

  it('usa o modelo próprio da organização', async () => {
    const perguntas = [{ id: 'p1', bloco: 'qualificacao', texto: 'P1?', peso: 10, opcoes: [{ id: 'a', rotulo: 'A', pontos: 100 }, { id: 'b', rotulo: 'B', pontos: 0 }] }];
    filaDeConsultas({ data: { config_score: { avaliacao: { perguntas } } }, error: null });
    expect(await obterModelo(ORG)).toEqual({ perguntas });
  });

  it('grava as respostas na organização, recalcula e devolve o lead', async () => {
    const consultas = filaDeConsultas({ data: { config_score: {} }, error: null }, { data: [{ id: LEAD }], error: null });
    const lead = await avaliarLead(ORG, LEAD, PERFIL, { respostas: { orcamento: 'confirmado' }, ticket_estimado: 5000 });

    const atualizacao = consultas[1];
    expect(atualizacao.tabela).toBe('leads');
    const [, dados] = atualizacao.chamadas.find(([metodo]) => metodo === 'update');
    expect(dados).toMatchObject({ avaliacao: { respostas: { orcamento: 'confirmado' } }, avaliado_por: PERFIL, ticket_estimado: 5000 });
    expect(dados.avaliado_em).toEqual(expect.any(String));
    expect(atualizacao.chamadas).toContainEqual(['eq', 'organizacao_id', ORG]);
    expect(atualizacao.chamadas).toContainEqual(['eq', 'id', LEAD]);
    expect(recalcularSemInterromper).toHaveBeenCalledWith(ORG, { ids: [LEAD] });
    expect(lead).toEqual({ id: LEAD, nome_lead: 'Lead' });
  });

  it('lead de outra organização (nada atualizado) responde 404 e não recalcula', async () => {
    filaDeConsultas({ data: { config_score: {} }, error: null }, { data: [], error: null });
    await expect(avaliarLead(ORG, LEAD, PERFIL, { respostas: {} })).rejects.toMatchObject({ status: 404 });
    expect(recalcularSemInterromper).not.toHaveBeenCalled();
  });

  it('resposta inválida não chega ao banco', async () => {
    const consultas = filaDeConsultas({ data: { config_score: {} }, error: null });
    await expect(avaliarLead(ORG, LEAD, PERFIL, { respostas: { orcamento: 'x' } })).rejects.toMatchObject({ status: 400 });
    expect(consultas).toHaveLength(1);
  });
});
