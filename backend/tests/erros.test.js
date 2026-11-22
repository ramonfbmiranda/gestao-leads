import { describe, expect, it } from 'vitest';
import { carregarAmbiente } from '../src/config/ambiente.js';
import { ErroHttp, resultadoOuErro, traduzirErroBanco } from '../src/utils/erros.js';

describe('traduzirErroBanco', () => {
  it('converte códigos conhecidos do Postgres em status HTTP', () => {
    expect(traduzirErroBanco({ code: '23505' }).status).toBe(409);
    expect(traduzirErroBanco({ code: '23514' }).status).toBe(400);
    expect(traduzirErroBanco({ code: '22P02' }).status).toBe(400);
    expect(traduzirErroBanco({ code: 'P0002' }).status).toBe(404);
  });

  it('usa a mensagem personalizada do código', () => {
    const erro = traduzirErroBanco({ code: '23505' }, { 23505: 'Já existe' });
    expect(erro).toBeInstanceOf(ErroHttp);
    expect(erro.message).toBe('Já existe');
  });

  it('erro desconhecido vira erro interno (não ErroHttp), sem expor detalhes', () => {
    const erro = traduzirErroBanco({ code: '42P01', message: 'relation does not exist' });
    expect(erro).not.toBeInstanceOf(ErroHttp);
  });
});

describe('resultadoOuErro', () => {
  it('devolve data quando não há erro', () => {
    expect(resultadoOuErro({ data: [1], error: null })).toEqual([1]);
  });

  it('lança o erro traduzido', () => {
    expect(() => resultadoOuErro({ data: null, error: { code: '23505' } })).toThrow(ErroHttp);
  });
});

describe('carregarAmbiente', () => {
  const completo = {
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_SECRET_KEY: 'segredo',
    CORS_ORIGIN: 'http://localhost:5173, https://app.exemplo.com',
    FRONTEND_URL: 'http://localhost:5173',
  };

  it('lê as variáveis e separa as origens do CORS', () => {
    const ambiente = carregarAmbiente(completo);
    expect(ambiente.porta).toBe(3000);
    expect(ambiente.corsOrigin).toEqual(['http://localhost:5173', 'https://app.exemplo.com']);
  });

  it('acusa variáveis ausentes pelo nome, sem mostrar valores', () => {
    expect(() => carregarAmbiente({ ...completo, SUPABASE_SECRET_KEY: ' ' })).toThrow(
      'Variáveis de ambiente ausentes: SUPABASE_SECRET_KEY',
    );
  });

  it('recusa porta inválida', () => {
    expect(() => carregarAmbiente({ ...completo, PORT: 'abc' })).toThrow('PORT');
  });

  it('tira a barra final das origens e do endereço do frontend', () => {
    const ambiente = carregarAmbiente({ ...completo, CORS_ORIGIN: 'https://app.exemplo.com/', FRONTEND_URL: 'https://app.exemplo.com//' });
    expect(ambiente.corsOrigin).toEqual(['https://app.exemplo.com']);
    expect(ambiente.frontendUrl).toBe('https://app.exemplo.com');
  });

  it('limites de requisições só ficam desligados nos testes', () => {
    expect(carregarAmbiente(completo).limitesDesligados).toBe(false);
    expect(carregarAmbiente({ ...completo, NODE_ENV: 'production' }).limitesDesligados).toBe(false);
    expect(carregarAmbiente({ ...completo, NODE_ENV: 'test' }).limitesDesligados).toBe(true);
  });
});
