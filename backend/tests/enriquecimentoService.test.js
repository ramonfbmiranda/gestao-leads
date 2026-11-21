// Serviço e fila de enriquecimento com o Supabase e a BrasilAPI simulados.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const metodos = (chamadas) => chamadas.map(([metodo]) => metodo);

// Simula supabase.from(...) e registra as chamadas de cada consulta.
// `responder` recebe as chamadas da consulta e devolve o { data, error }.
function simularFrom(responder) {
  const consultas = [];
  supabase.from.mockImplementation((tabela) => {
    const chamadas = [];
    consultas.push({ tabela, chamadas });
    const consulta = new Proxy(
      {},
      {
        get(_, metodo) {
          if (metodo === 'then') return (resolver) => resolver(responder(chamadas, tabela));
          return (...args) => {
            chamadas.push([metodo, ...args]);
            return consulta;
          };
        },
      },
    );
    return consulta;
  });
  return consultas;
}

// Leituras (select sem update) devolvem `anterior`: os valores já gravados no lead.
const registrarGravacoes = (anterior = null) =>
  simularFrom((chamadas) => {
    const leitura = metodos(chamadas).includes('select') && !metodos(chamadas).includes('update');
    return { data: leitura ? anterior : null, error: null };
  });

const gravacao = (consultas) => consultas.find(({ chamadas }) => metodos(chamadas).includes('update'));
const camposGravados = (consultas) => gravacao(consultas).chamadas.find(([metodo]) => metodo === 'update')[1];

// Cada chamada de supabase.from('organizacoes') devolve a próxima página.
const simularOrganizacoes = (...paginas) => {
  let i = 0;
  return simularFrom(() => paginas[i++] ?? { data: [], error: null });
};

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
    expect(gravacao(gravacoes).chamadas).toContainEqual(['eq', 'id', LEAD]);
    expect(gravacao(gravacoes).chamadas).toContainEqual(['eq', 'organizacao_id', ORG]);
    expect(recalcularSemInterromper).toHaveBeenCalledWith(ORG, { ids: [LEAD] });
  });

  it('lê os valores anteriores do lead (na organização da reserva) antes de gravar', async () => {
    const consultas = registrarGravacoes();
    consultarCnpj.mockResolvedValue({ tipo: 'ok', dados: {} });

    await servico.processarReserva(RESERVA);

    expect(consultas.map(({ tabela, chamadas }) => [tabela, metodos(chamadas)[0]])).toEqual([
      ['leads', 'select'],
      ['leads', 'update'],
    ]);
    expect(consultas[0].chamadas).toContainEqual(['eq', 'id', LEAD]);
    expect(consultas[0].chamadas).toContainEqual(['eq', 'organizacao_id', ORG]);
  });

  it('grava telefone, e-mail e sócios da Receita junto com os outros dados', async () => {
    const gravacoes = registrarGravacoes();
    const socios = [{ nome: 'MARIA DA SILVA', qualificacao: 'Sócio-Administrador' }];
    consultarCnpj.mockResolvedValue({
      tipo: 'ok',
      dados: { razao_social: 'EMPRESA SA', telefone_receita: '1123851939', email_receita: 'contato@empresa.com.br', socios },
    });

    await servico.processarReserva(RESERVA);

    expect(camposGravados(gravacoes)).toMatchObject({
      razao_social: 'EMPRESA SA',
      telefone_receita: '1123851939',
      email_receita: 'contato@empresa.com.br',
      socios,
    });
  });

  it('lead já enriquecido com situação ou porte mudados grava ultima_mudanca_receita', async () => {
    const gravacoes = registrarGravacoes({
      enriquecido_em: '2026-08-01T12:00:00.000Z',
      situacao_cadastral: 'ATIVA',
      porte: 'MICRO EMPRESA',
    });
    consultarCnpj.mockResolvedValue({ tipo: 'ok', dados: { situacao_cadastral: 'BAIXADA', porte: 'MICRO EMPRESA' } });

    await servico.processarReserva(RESERVA);

    const campos = camposGravados(gravacoes);
    expect(campos.ultima_mudanca_receita).toEqual({
      em: campos.enriquecido_em,
      mudancas: [{ campo: 'situacao_cadastral', de: 'ATIVA', para: 'BAIXADA' }],
    });
    expect(Number.isNaN(Date.parse(campos.ultima_mudanca_receita.em))).toBe(false);
  });

  it.each([
    ['sem mudança', { enriquecido_em: '2026-08-01T12:00:00.000Z', situacao_cadastral: 'ATIVA', porte: 'DEMAIS' }],
    ['primeiro enriquecimento', { enriquecido_em: null, situacao_cadastral: null, porte: null }],
    ['lead não encontrado na leitura', null],
  ])('%s: mantém o ultima_mudanca_receita anterior', async (_, anterior) => {
    const gravacoes = registrarGravacoes(anterior);
    consultarCnpj.mockResolvedValue({ tipo: 'ok', dados: { situacao_cadastral: 'ATIVA', porte: 'DEMAIS' } });

    await servico.processarReserva(RESERVA);

    expect(camposGravados(gravacoes)).not.toHaveProperty('ultima_mudanca_receita');
  });

  it.each(['nao_encontrado', 'nao_suportado', 'erro'])('%s é definitivo e não mexe nos dados', async (tipo) => {
    const gravacoes = registrarGravacoes();
    consultarCnpj.mockResolvedValue({ tipo, mensagem: 'motivo' });

    const resultado = await servico.processarReserva(RESERVA);

    expect(resultado).toEqual({ status: tipo, transitorio: false, mensagem: 'motivo' });
    expect(gravacoes).toHaveLength(1);
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

describe('reconsultarVencidos', () => {
  const TERCEIRA = '55555555-5555-4555-8555-555555555555';
  const QUARTA = '66666666-6666-4666-8666-666666666666';
  const chamadasReconsulta = () =>
    supabase.rpc.mock.calls.filter(([nome]) => nome === 'enfileirar_reconsulta').map(([, args]) => args);

  let silenciados;
  beforeEach(() => {
    silenciados = [vi.spyOn(console, 'log').mockImplementation(() => {}), vi.spyOn(console, 'error').mockImplementation(() => {})];
  });
  afterEach(() => {
    for (const espiao of silenciados) espiao.mockRestore();
  });

  it('usa o reconsulta_dias mesclado de cada organização e pula quem desligou (0)', async () => {
    const consultas = simularOrganizacoes({
      data: [
        { id: ORG, config_score: {} },
        { id: OUTRA_ORG, config_score: { reconsulta_dias: 30 } },
        { id: TERCEIRA, config_score: { reconsulta_dias: 0 } },
        { id: QUARTA, config_score: null },
      ],
      error: null,
    });
    supabase.rpc
      .mockResolvedValueOnce({ data: 3, error: null })
      .mockResolvedValueOnce({ data: 2, error: null })
      .mockResolvedValueOnce({ data: 0, error: null });
    const acordar = vi.fn();

    expect(await fila.reconsultarVencidos({ acordar })).toBe(5);

    expect(consultas[0].tabela).toBe('organizacoes');
    expect(consultas[0].chamadas).toContainEqual(['select', 'id, config_score']);
    expect(chamadasReconsulta()).toEqual([
      { p_organizacao_id: ORG, p_dias: 90 },
      { p_organizacao_id: OUTRA_ORG, p_dias: 30 },
      { p_organizacao_id: QUARTA, p_dias: 90 },
    ]);
    expect(acordar).toHaveBeenCalledTimes(1);
  });

  it('nada enfileirado não acorda a fila', async () => {
    simularOrganizacoes({ data: [{ id: ORG, config_score: {} }], error: null });
    supabase.rpc.mockResolvedValue({ data: 0, error: null });
    const acordar = vi.fn();

    expect(await fila.reconsultarVencidos({ acordar })).toBe(0);
    expect(acordar).not.toHaveBeenCalled();
  });

  it('todas desligadas: não chama a função SQL', async () => {
    simularOrganizacoes({ data: [{ id: ORG, config_score: { reconsulta_dias: 0 } }], error: null });
    const acordar = vi.fn();

    expect(await fila.reconsultarVencidos({ acordar })).toBe(0);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(acordar).not.toHaveBeenCalled();
  });

  it('falha em uma organização vai para o log e não impede as outras', async () => {
    simularOrganizacoes({ data: [{ id: ORG, config_score: {} }, { id: OUTRA_ORG, config_score: {} }], error: null });
    supabase.rpc
      .mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'falhou' } })
      .mockResolvedValueOnce({ data: 4, error: null });
    const acordar = vi.fn();

    expect(await fila.reconsultarVencidos({ acordar })).toBe(4);
    expect(chamadasReconsulta()).toHaveLength(2);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(ORG), expect.any(String));
    expect(acordar).toHaveBeenCalledTimes(1);
  });

  it('falha ao listar as organizações vai para o log e devolve 0, sem lançar erro', async () => {
    simularOrganizacoes({ data: null, error: { code: 'XX000', message: 'banco fora do ar' } });
    const acordar = vi.fn();

    expect(await fila.reconsultarVencidos({ acordar })).toBe(0);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
    expect(acordar).not.toHaveBeenCalled();
  });

  it('lê as organizações em páginas de 1000', async () => {
    const desligadas = Array.from({ length: 1000 }, (_, i) => ({ id: `org-${i}`, config_score: { reconsulta_dias: 0 } }));
    const consultas = simularOrganizacoes(
      { data: desligadas, error: null },
      { data: [{ id: ORG, config_score: {} }], error: null },
    );
    supabase.rpc.mockResolvedValue({ data: 1, error: null });

    expect(await fila.reconsultarVencidos({ acordar: vi.fn() })).toBe(1);
    expect(consultas.map(({ chamadas }) => chamadas.find(([metodo]) => metodo === 'range').slice(1))).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(chamadasReconsulta()).toEqual([{ p_organizacao_id: ORG, p_dias: 90 }]);
  });

  describe('com a fila rodando', () => {
    const leiturasDeOrganizacoes = (consultas) => consultas.filter(({ tabela }) => tabela === 'organizacoes').length;
    const buscasNaFila = () => supabase.rpc.mock.calls.filter(([nome]) => nome === 'pegar_proximo_enriquecimento').length;

    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(async () => {
      fila.pararFila();
      await vi.advanceTimersByTimeAsync(fila.ESPERA_FILA_VAZIA_MS);
      vi.useRealTimers();
    });

    it('roda ao iniciar a fila e depois a cada 24 h; pararFila desliga', async () => {
      const consultas = simularOrganizacoes();
      supabase.rpc.mockResolvedValue({ data: null, error: null });

      fila.iniciarFila();
      await vi.advanceTimersByTimeAsync(0);
      expect(leiturasDeOrganizacoes(consultas)).toBe(1);
      // O laço da fila segue normalmente enquanto isso.
      expect(buscasNaFila()).toBe(1);

      await vi.advanceTimersByTimeAsync(fila.INTERVALO_RECONSULTA_MS - 1_000);
      expect(leiturasDeOrganizacoes(consultas)).toBe(1);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(leiturasDeOrganizacoes(consultas)).toBe(2);
      expect(buscasNaFila()).toBeGreaterThan(1);

      fila.pararFila();
      await vi.advanceTimersByTimeAsync(fila.INTERVALO_RECONSULTA_MS * 2);
      expect(leiturasDeOrganizacoes(consultas)).toBe(2);
    });

    it('leads enfileirados pela reconsulta acordam a fila ociosa na hora', async () => {
      simularOrganizacoes({ data: [], error: null }, { data: [{ id: ORG, config_score: {} }], error: null });
      supabase.rpc.mockImplementation(async (nome) => ({ data: nome === 'enfileirar_reconsulta' ? 2 : null, error: null }));

      fila.iniciarFila();
      await vi.advanceTimersByTimeAsync(0);
      expect(buscasNaFila()).toBe(1);

      // Sem avançar o relógio: a fila estava esperando 30 s e volta na hora.
      expect(await fila.reconsultarVencidos()).toBe(2);
      await vi.advanceTimersByTimeAsync(0);
      expect(buscasNaFila()).toBe(2);
    });
  });
});
