import cors from 'cors';
import express from 'express';
import { ambiente } from './config/ambiente.js';
import { rotaNaoEncontrada, tratadorDeErros } from './middlewares/tratarErros.js';
import { rotas } from './routes/index.js';

// Monta a aplicação sem abrir porta, para os testes poderem usá-la diretamente.
export function criarApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: ambiente.corsOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.use(rotas);

  app.use(rotaNaoEncontrada);
  app.use(tratadorDeErros);
  return app;
}
