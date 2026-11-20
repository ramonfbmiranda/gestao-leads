import * as responsaveisService from '../services/responsaveisService.js';
import { corpoObjeto, nomeNormalizado } from '../utils/validacao.js';

export async function listar(req, res) {
  res.json(await responsaveisService.listarResponsaveis(req.organizacaoId));
}

export async function criar(req, res) {
  const corpo = corpoObjeto(req.body);
  const nome = nomeNormalizado(corpo.nome, 'nome', { max: 150 });
  res.status(201).json(await responsaveisService.criarResponsavel(req.organizacaoId, nome));
}
