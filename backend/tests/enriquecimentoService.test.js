// Serviço e fila de enriquecimento com o Supabase e a BrasilAPI simulados.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/supabase.js', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../src/services/brasilApiService.js', () => ({ consultarCnpj: vi.fn() }));
vi.mock('../src/services/scoreService.js', () => ({ recalcularSemInterromper: vi.fn() }));
vi.mock('../src/services/leadsService.js', () => ({ obterLead: vi.fn() }));

const { supabase } = await import('../src/config/supabase.js');
const { consultarCnpj } = await import('../src/services/brasilApiService.js');
const { recalcularSemInterromper } = await import('../src/services/scoreService.js');
const { obterLead } = await import('../src/services/leadsService.js');
const servico = await import('../src/services/enriquecimentoService.js');
const fila = await import('../src/services/filaEnriquecimento.js');

const ORG = '22222222-2222-4222-8222-222222222222';
const OUTRA_ORG = '33333333-3333-4333-8333-333333333333';
const LEAD = '44444444-4444-4444-8444-444444444444';
const RESERVA = { id: LEAD, organizacao_id: ORG, cnpj: '00000000000191', tentativas: 1 };

// Registra as chamadas de supabase.from('leads').update(...).eq(...).
function registrarGravacoes() {
  const gravacoes = [];
  supabase.from.mockImplementation((tabela) => {
    const chamadas = [];
    gravacoes.push({ tabela, chamadas });
    const consulta = new Proxy(
      {},
      {
        get(_, metodo) {
          if (metodo === 'then') return (resolver) => resolver({ data: null, error: null });
          return (...args) => {
            chamadas.push([metodo, ...args]);
            return consulta;
          };
        },
      },
    );
    return consulta;
  });
  return gravacoes;
}

const camposGravados = (gravacoes) => gravacoes[0].chamadas.find(([metodo]) => metodo === 'update')[1];

beforeEach(() => {
  vi.resetAllMocks();
});

describe('processarReserva', () => {
  it('sucesso: grava os dados, marca concluído e recalcula o score do lead', async () => {
    const gravacoes = registrarGravacoes();
    consultarCnpj.mockResolvedValue({ tipo: 'ok', dados: { razao_social: 'BANCO DO BRASIL SA', uf: 'DF' } });

    const resultado = await servico.processarReserva(RESERVA);

    expect(resultado).toEqual({ status: 'concluido', transitorio: false });
    expect(consultarCnpj).toHaveBeenCalledWith('00000000000191');
    expect(camposGravados(gravacoes)).toMatchObject({
      razao_social: 'BANCO DO BRASIL SA',
      uf: 'DF',
      enriquecimento_status: 'concluido',
      enriquecimento_erro: null,
      enriquecimento_proxima_em: null,
      enriquecido_em: expect.any(String),
    });
    // A gravação é sempre filtrada pelo lead e pela organização.
    expect(gravacoes[0].chamadas).toContainEqual(['eq', 'id', LEAD]);
    expect(gravacoes[0].chamadas).toContainEqual(['eq', 'organizacao_id', ORG]);
    expect(recalcularSemInterromper).toHaveBeenCalledWith(ORG, { ids: [LEAD] });
  });

  it.each(['nao_encontrado', 'nao_suportado', 'erro'])('%s é definitivo e não mexe nos dados', async (tipo) => {
    const gravacoes = registrarGravacoes();
    consultarCnpj.mockResolvedValue({ tipo, mensagem: 'motivo' });

    const resultado = await servico.processarReserva(RESERVA);

    expect(resultado).toEqual({ status: tipo, transitorio: false, mensagem: 'motivo' });
    expect(camposGravados(gravacoes)).toEqual({
      enriquecimento_status: tipo,
      enriquecimento_erro: 'motivo',
      enriquecimento_proxima_em: null,
    });
    expect(recalcularSemInterromper).not.toHaveBeenCalled();
  });

  it('falha passageira volta para a fila com espera', async () => {
    const gravacoes = registrarGravacoes();
    consultarCnpj.mockResolvedValue({ tipo: 'transitorio', mensagem: 'BrasilAPI indisponível (HTTP 503)' });
    const antes = Date.now();

    const resultado = await servico.processarReserva({ ...RESERVA, tentativas: 2 });

    expect(resultado).toMatchObject({ status: 'pendente', transitorio: true });
    const campos = camposGravados(gravacoes);
    expect(campos.enriquecimento_status).toBe('pendente');
    // 2ª tentativa falhou: a 3ª espera 2 minutos.
    const espera = new Date(campos.enriquecimento_proxima_em).getTime() - antes;
    expect(espera).toBeGreaterThanOrEqual(120_000);
    expect(espera).toBeLessThan(125_000);
  });

  it('na última tentativa a falha passageira vira erro', async () => {
    const gravacoes = registrarGravacoes();
    consultarCnpj.mockResolvedValue({ tipo: 'transitorio', mensagem: 'BrasilAPI indisponível (HTTP 503)' });

    const resultado = await servico.processarReserva({ ...RESERVA, tentativas: 3 });

    expect(resultado).toMatchObject({ status: 'erro', transitorio: true });
    expect(camposGravados(gravacoes)).toMatchObject({
      enriquecimento_status: 'erro',
      enriquecimento_erro: 'BrasilAPI indisponível (HTTP 503); desistiu após 3 tentativas',
    });
  });
});

describe('enriquecerLead (individual)', () => {
  it('reserva na organização do perfil, processa e devolve o lead', async () => {
    registrarGravacoes();
    supabase.rpc.mockResolvedValue({ data: RESERVA, error: null });
    consultarCnpj.mockResolvedValue({ tipo: 'ok', dados: {} });
    obterLead.mockResolvedValue({ id: LEAD, enriquecimento_status: 'concluido' });

    const lead = await servico.enriquecerLead(ORG, LEAD);

    expect(supabase.rpc).toHaveBeenCalledWith('reservar_enriquecimento', { p_organizacao_id: ORG, p_lead_id: LEAD });
    expect(lead).toEqual({ id: LEAD, enriquecimento_status: 'concluido' });
  });

  it('lead não encontrado (no_data_found) responde 404', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'Lead não encontrado' } });
    await expect(servico.enriquecerLead(ORG, LEAD)).rejects.toMatchObject({ status: 404, message: 'Lead não encontrado' });
  });

  it('lead já em processamento responde 409 sem consultar a BrasilAPI', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null });
    await expect(servico.enriquecerLead(ORG, LEAD)).rejects.toMatchObject({ status: 409 });
    expect(consultarCnpj).not.toHaveBeenCalled();
  });

  it('BrasilAPI fora do ar responde 503 e deixa o lead na fila', async () => {
    const gravacoes = registrarGravacoes();
    supabase.rpc.mockResolvedValue({ data: RESERVA, error: null });
    consultarCnpj.mockResolvedValue({ tipo: 'transitorio', mensagem: 'BrasilAPI não respondeu a tempo' });

    await expect(servico.enriquecerLead(ORG, LEAD)).rejects.toMatchObject({ status: 503 });
    expect(camposGravados(gravacoes).enriquecimento_status).toBe('pendente');
  });

  it('CNPJ não encontrado não é erro da requisição: devolve o lead com o status', async () => {
    registrarGravacoes();
    supabase.rpc.mockResolvedValue({ data: RESERVA, error: null });
    consultarCnpj.mockResolvedValue({ tipo: 'nao_encontrado', mensagem: 'CNPJ não encontrado' });
    obterLead.mockResolvedValue({ id: LEAD, enriquecimento_status: 'nao_encontrado' });

    expect(await servico.enriquecerLead(ORG, LEAD)).toMatchObject({ enriquecimento_status: 'nao_encontrado' });
  });
});

describe('enfileirar e status', () => {
  it('enfileira pela função SQL, com ou sem ids', async () => {
    supabase.rpc.mockResolvedValue({ data: 7, error: null });
    expect(await servico.enfileirarLeads(ORG)).toEqual({ enfileirados: 7 });
    expect(supabase.rpc).toHaveBeenLastCalledWith('enfileirar_enriquecimento', { p_organizacao_id: ORG, p_ids: null });

    await servico.enfileirarLeads(ORG, [LEAD]);
    expect(supabase.rpc).toHaveBeenLastCalledWith('enfileirar_enriquecimento', { p_organizacao_id: ORG, p_ids: [LEAD] });
  });

  it('status repassa a contagem da organização', async () => {
    const contagem = { pendente: 2, concluido: 5, total: 7 };
    supabase.rpc.mockResolvedValue({ data: contagem, error: null });
    expect(await servico.statusEnriquecimento(ORG)).toEqual(contagem);
    expect(supabase.rpc).toHaveBeenCalledWith('contar_enriquecimento', { p_organizacao_id: ORG });
  });
});

describe('fila', () => {
  it('processarProximo passa a última organização atendida para o rodízio', async () => {
    registrarGravacoes();
    consultarCnpj.mockResolvedValue({ tipo: 'nao_encontrado', mensagem: 'x' });
    supabase.rpc
      .mockResolvedValueOnce({ data: RESERVA, error: null })
      .mockResolvedValueOnce({ data: { ...RESERVA, organizacao_id: OUTRA_ORG }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    expect(await fila.processarProximo()).toMatchObject({ status: 'nao_encontrado' });
    await fila.processarProximo();
    expect(await fila.processarProximo()).toBeNull();

    const anteriores = supabase.rpc.mock.calls.map(([nome, args]) => [nome, args.p_depois_de]);
    expect(anteriores).toEqual([
      ['pegar_proximo_enriquecimento', null],
      ['pegar_proximo_enriquecimento', ORG],
      ['pegar_proximo_enriquecimento', OUTRA_ORG],
    ]);
  });

  it('proximaEspera: pausa curta, espera ociosa despertável e espera crescente nas falhas', () => {
    expect(fila.proximaEspera({ resultado: { transitorio: false } }, 3)).toEqual({
      espera: fila.PAUSA_ENTRE_CONSULTAS_MS,
      despertavel: false,
      falhas: 0,
    });
    expect(fila.proximaEspera({ resultado: null }, 0)).toEqual({
      espera: fila.ESPERA_FILA_VAZIA_MS,
      despertavel: true,
      falhas: 0,
    });
    expect(fila.proximaEspera({ resultado: { transitorio: true } }, 0)).toMatchObject({ espera: 30_000, falhas: 1 });
    expect(fila.proximaEspera({ resultado: { transitorio: true } }, 2)).toMatchObject({ espera: 90_000, falhas: 3 });
    expect(fila.proximaEspera({ erro: true }, 50)).toMatchObject({ espera: 300_000 });
  });
});
