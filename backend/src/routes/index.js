// Mapa de rotas. Acesso conforme a especificação (seção 10):
// público, só token (autenticar), com perfil (comPerfil) ou admin (somenteAdmin).
// O middleware vai em cada rota, nunca em router.use, para não vazar para outras.

import { Router } from 'express';
import * as conta from '../controllers/contaController.js';
import * as membros from '../controllers/membrosController.js';
import * as sistema from '../controllers/sistemaController.js';
import { autenticar, somenteAdmin } from '../middlewares/autenticacao.js';

export const rotas = Router();

// Públicas
rotas.get('/', sistema.inicio);
rotas.get('/saude', sistema.saude);

// Só token: o usuário pode ainda não ter organização
rotas.get('/me', autenticar, conta.me);
rotas.post('/onboarding', autenticar, conta.onboarding);
rotas.post('/convites/:id/aceitar', autenticar, conta.aceitarConvite);

// Admin
rotas.get('/membros', ...somenteAdmin, membros.listarMembros);
rotas.post('/membros/convite', ...somenteAdmin, membros.convidar);
rotas.get('/convites', ...somenteAdmin, membros.listarConvites);
rotas.delete('/convites/:id', ...somenteAdmin, membros.cancelarConvite);
