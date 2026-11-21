// Mapa de rotas. Acesso conforme a especificação (seção 10):
// público, só token (autenticar), com perfil (comPerfil) ou admin (somenteAdmin).
// O middleware vai em cada rota, nunca em router.use, para não vazar para outras.

import { Router } from 'express';
import * as avaliacao from '../controllers/avaliacaoController.js';
import * as conta from '../controllers/contaController.js';
import * as dashboard from '../controllers/dashboardController.js';
import * as enriquecimento from '../controllers/enriquecimentoController.js';
import * as importacoes from '../controllers/importacoesController.js';
import * as interacoes from '../controllers/interacoesController.js';
import * as leads from '../controllers/leadsController.js';
import * as membros from '../controllers/membrosController.js';
import * as organizacao from '../controllers/organizacaoController.js';
import * as responsaveis from '../controllers/responsaveisController.js';
import * as sistema from '../controllers/sistemaController.js';
import { autenticar, comPerfil, somenteAdmin } from '../middlewares/autenticacao.js';
import { receberPlanilha } from '../middlewares/upload.js';

export const rotas = Router();

// Públicas
rotas.get('/', sistema.inicio);
rotas.get('/saude', sistema.saude);

// Só token: o usuário pode ainda não ter organização
rotas.get('/me', autenticar, conta.me);
rotas.post('/onboarding', autenticar, conta.onboarding);
rotas.post('/convites/:id/aceitar', autenticar, conta.aceitarConvite);

// Admin
rotas.put('/organizacao', ...somenteAdmin, organizacao.atualizar);
rotas.get('/organizacao/sugestao-pesos', ...somenteAdmin, organizacao.sugestaoPesos);
rotas.get('/membros', ...somenteAdmin, membros.listarMembros);
rotas.post('/membros/convite', ...somenteAdmin, membros.convidar);
rotas.get('/convites', ...somenteAdmin, membros.listarConvites);
rotas.delete('/convites/:id', ...somenteAdmin, membros.cancelarConvite);

// Com perfil (qualquer membro da organização)
rotas.get('/responsaveis', ...comPerfil, responsaveis.listar);
rotas.post('/responsaveis', ...comPerfil, responsaveis.criar);
rotas.get('/organizacao', ...comPerfil, organizacao.obter);
rotas.get('/avaliacao/modelo', ...comPerfil, avaliacao.modelo);
rotas.get('/dashboard/resumo', ...comPerfil, dashboard.resumo);
rotas.get('/dashboard/conversao', ...comPerfil, dashboard.conversao);

// Rotas fixas de /leads (ex.: /leads/enriquecimento/status) entram antes de /leads/:id.
rotas.get('/leads', ...comPerfil, leads.listar);
rotas.post('/leads', ...comPerfil, leads.criar);
rotas.get('/leads/enriquecimento/status', ...comPerfil, enriquecimento.status);
rotas.post('/leads/enriquecer-lote', ...comPerfil, enriquecimento.enfileirar);
rotas.post('/leads/recalcular-score', ...comPerfil, leads.recalcularScores);
rotas.get('/leads/prioridade', ...comPerfil, leads.prioridade);
rotas.post('/leads/:id/enriquecer', ...comPerfil, enriquecimento.enriquecer);
rotas.post('/leads/:id/calcular-score', ...comPerfil, leads.calcularScore);
rotas.put('/leads/:id/avaliacao', ...comPerfil, avaliacao.avaliar);
rotas.get('/leads/:id/interacoes', ...comPerfil, interacoes.listar);
rotas.post('/leads/:id/interacoes', ...comPerfil, interacoes.criar);
rotas.delete('/leads/:id/interacoes/:interacaoId', ...comPerfil, interacoes.excluir);
rotas.get('/leads/:id', ...comPerfil, leads.obter);
rotas.put('/leads/:id', ...comPerfil, leads.atualizar);
rotas.delete('/leads/:id', ...comPerfil, leads.excluir);

// O arquivo só é recebido depois de conferir token e perfil.
rotas.post('/importacoes/preview', ...comPerfil, receberPlanilha, importacoes.preview);
rotas.post('/importacoes', ...comPerfil, receberPlanilha, importacoes.importar);
rotas.get('/importacoes', ...comPerfil, importacoes.listar);
rotas.get('/importacoes/:id', ...comPerfil, importacoes.obter);
