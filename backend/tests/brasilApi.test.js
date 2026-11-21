// Cliente da BrasilAPI com o fetch simulado: nenhum teste acessa a internet.

import { describe, expect, it, vi } from 'vitest';
import { consultarCnpj } from '../src/services/brasilApiService.js';

const resposta = (status, corpo) =>
  new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('consultarCnpj', () => {
  it('chama a URL do CNPJ com User-Agent próprio e tempo limite', async () => {
    const fetch = vi.fn().mockResolvedValue(resposta(200, { razao_social: 'X', uf: 'SP' }));
    const resultado = await consultarCnpj('12ABC34501DE35', { fetch });

    const [url, opcoes] = fetch.mock.calls[0];
    expect(url).toBe('https://brasilapi.com.br/api/cnpj/v1/12ABC34501DE35');
    // O User-Agent padrão do Node é bloqueado (403) pela BrasilAPI.
    expect(opcoes.headers['User-Agent']).toMatch(/^gestao-leads\//);
    expect(opcoes.signal).toBeInstanceOf(AbortSignal);
    expect(resultado).toMatchObject({ tipo: 'ok', dados: { razao_social: 'X', uf: 'SP' } });
  });

  it('404 é CNPJ não encontrado', async () => {
    const fetch = vi.fn().mockResolvedValue(resposta(404, { message: 'CNPJ 00.000.000/0001-91 não encontrado.' }));
    expect(await consultarCnpj('00000000000191', { fetch })).toMatchObject({ tipo: 'nao_encontrado' });
  });

  it('503 e 429 são passageiros', async () => {
    for (const status of [503, 429]) {
      const fetch = vi.fn().mockResolvedValue(resposta(status, { message: 'indisponível' }));
      expect((await consultarCnpj('00000000000191', { fetch })).tipo).toBe('transitorio');
    }
  });

  it('falha de rede e tempo esgotado são passageiros', async () => {
    const semRede = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    expect(await consultarCnpj('00000000000191', { fetch: semRede })).toEqual({
      tipo: 'transitorio',
      mensagem: 'Falha de conexão com a BrasilAPI',
    });

    // fetch que só termina quando o sinal de tempo limite dispara.
    const lento = vi.fn((_, { signal }) => new Promise((_, rejeitar) => signal.addEventListener('abort', () => rejeitar(signal.reason))));
    expect(await consultarCnpj('00000000000191', { fetch: lento, tempoLimiteMs: 20 })).toEqual({
      tipo: 'transitorio',
      mensagem: 'BrasilAPI não respondeu a tempo',
    });
  });

  it('200 com corpo ilegível é passageiro (não grava lixo)', async () => {
    for (const corpo of ['<html>erro</html>', '[]', 'null']) {
      const fetch = vi.fn().mockResolvedValue(resposta(200, corpo));
      expect((await consultarCnpj('00000000000191', { fetch })).tipo).toBe('transitorio');
    }
  });
});
