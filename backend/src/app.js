import cors from 'cors';
import express from 'express';
import { ambiente } from './config/ambiente.js';
import { rotaNaoEncontrada, tratadorDeErros } from './middlewares/tratarErros.js';
import { rotas } from './routes/index.js';

// Monta a aplicação sem abrir porta, para os testes poderem usá-la diretamente.
export function criarApp() {
  const app = express();

  app.disable('x-powered-by');
  // A API só devolve JSON com dados da organização: nada de cache, de
  // interpretar como outro tipo ou de abrir dentro de outra página.
  app.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });
  app.use(cors({ origin: ambiente.corsOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.use(rotas);

  app.use(rotaNaoEncontrada);
  app.use(tratadorDeErros);
  return app;
}
