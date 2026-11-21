import { criarApp } from './app.js';
import { ambiente } from './config/ambiente.js';
import { iniciarFila } from './services/filaEnriquecimento.js';

criarApp().listen(ambiente.porta, (erro) => {
  if (erro) throw erro;
  console.log(`API de Leads ouvindo na porta ${ambiente.porta}`);
  // Retoma os leads que ficaram na fila de enriquecimento.
  iniciarFila();
});
