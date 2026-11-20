import { criarApp } from './app.js';
import { ambiente } from './config/ambiente.js';

criarApp().listen(ambiente.porta, (erro) => {
  if (erro) throw erro;
  console.log(`API de Leads ouvindo na porta ${ambiente.porta}`);
});
