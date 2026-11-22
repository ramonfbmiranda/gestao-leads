// Limites de requisições: contam por usuário e respondem 429 em JSON.

import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { criarLimite } from '../src/middlewares/limites.js';
import { criarApp } from '../src/app.js';

function appCom(limitador) {
  const app = express();
  // Simula o autenticar: o usuário vem do cabeçalho de teste.
  app.use((req, res, next) => {
    const id = req.get('x-usuario');
    if (id) req.usuario = { id };
    next();
  });
  app.use(limitador);
  app.get('/', (req, res) => res.json({ ok: true }));
  return app;
}

const comoUsuario = (app, id) => request(app).get('/').set('x-usuario', id);

describe('criarLimite', () => {
  it('passa do limite: 429 com a mensagem em JSON e o tempo de espera', async () => {
    const app = appCom(criarLimite({ limite: 2, janelaMs: 60_000, mensagem: 'Calma', pular: () => false }));
    expect((await comoUsuario(app, 'ana')).status).toBe(200);
    expect((await comoUsuario(app, 'ana')).status).toBe(200);
    const bloqueada = await comoUsuario(app, 'ana');
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.body).toEqual({ erro: 'Calma' });
    expect(bloqueada.headers['retry-after']).toBeDefined();
  });

  it('cada usuário tem a própria conta', async () => {
    const app = appCom(criarLimite({ limite: 1, janelaMs: 60_000, mensagem: 'Calma', pular: () => false }));
    expect((await comoUsuario(app, 'ana')).status).toBe(200);
    expect((await comoUsuario(app, 'ana')).status).toBe(429);
    expect((await comoUsuario(app, 'bruno')).status).toBe(200);
  });

  it('sem usuário (rota pública) não conta', async () => {
    const app = appCom(criarLimite({ limite: 1, janelaMs: 60_000, mensagem: 'Calma', pular: () => false }));
    expect((await request(app).get('/')).status).toBe(200);
    expect((await request(app).get('/')).status).toBe(200);
  });

  it('desligado nos testes automatizados', async () => {
    const app = appCom(criarLimite({ limite: 1, janelaMs: 60_000, mensagem: 'Calma' }));
    expect((await comoUsuario(app, 'ana')).status).toBe(200);
    expect((await comoUsuario(app, 'ana')).status).toBe(200);
  });
});

describe('cabeçalhos de segurança da API', () => {
  it('respostas sem cache, sem sniffing e fora de iframes', async () => {
    const resposta = await request(criarApp()).get('/');
    expect(resposta.headers['cache-control']).toBe('no-store');
    expect(resposta.headers['x-content-type-options']).toBe('nosniff');
    expect(resposta.headers['x-frame-options']).toBe('DENY');
    expect(resposta.headers['referrer-policy']).toBe('no-referrer');
    expect(resposta.headers['x-powered-by']).toBeUndefined();
  });
});
