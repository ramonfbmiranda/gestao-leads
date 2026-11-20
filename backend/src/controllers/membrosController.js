import * as membrosService from '../services/membrosService.js';
import { naoEncontrado } from '../utils/erros.js';
import { corpoObjeto, ehUuid, emailValido, umDe } from '../utils/validacao.js';

export async function listarMembros(req, res) {
  res.json(await membrosService.listarMembros(req.organizacaoId));
}

export async function convidar(req, res) {
  const corpo = corpoObjeto(req.body);
  const dados = {
    email: emailValido(corpo.email),
    papel: umDe(corpo.papel, ['admin', 'membro'], 'papel', { padrao: 'membro' }),
  };
  res.status(201).json(await membrosService.convidarMembro(req.organizacaoId, req.perfil, dados));
}

export async function listarConvites(req, res) {
  res.json(await membrosService.listarConvitesPendentes(req.organizacaoId));
}

export async function cancelarConvite(req, res) {
  if (!ehUuid(req.params.id)) throw naoEncontrado('Convite não encontrado');
  await membrosService.cancelarConvite(req.organizacaoId, req.params.id);
  res.status(204).end();
}
