import * as avaliacaoService from '../services/avaliacaoService.js';
import { naoEncontrado } from '../utils/erros.js';
import { corpoObjeto, ehUuid } from '../utils/validacao.js';

export async function modelo(req, res) {
  res.json(await avaliacaoService.obterModelo(req.organizacaoId));
}

export async function avaliar(req, res) {
  // id malformado responde igual a lead inexistente.
  if (!ehUuid(req.params.id)) throw naoEncontrado('Lead não encontrado');
  res.json(await avaliacaoService.avaliarLead(req.organizacaoId, req.params.id, req.perfil.id, corpoObjeto(req.body)));
}
