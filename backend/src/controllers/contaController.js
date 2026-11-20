import * as contaService from '../services/contaService.js';
import { naoEncontrado } from '../utils/erros.js';
import { corpoObjeto, ehUuid, textoObrigatorio, textoOpcional } from '../utils/validacao.js';

export async function me(req, res) {
  res.json(await contaService.obterDadosConta(req.usuario));
}

export async function onboarding(req, res) {
  const corpo = corpoObjeto(req.body);
  const dados = {
    nome_organizacao: textoObrigatorio(corpo.nome_organizacao, 'nome_organizacao', { max: 150 }),
    nome: textoOpcional(corpo.nome, 'nome', { max: 150 }),
  };
  res.status(201).json(await contaService.criarOrganizacao(req.usuario, dados));
}

export async function aceitarConvite(req, res) {
  // id malformado responde igual a convite inexistente (não revela nada).
  if (!ehUuid(req.params.id)) throw naoEncontrado('Convite não encontrado');
  const corpo = req.body === undefined ? {} : corpoObjeto(req.body);
  const dados = { nome: textoOpcional(corpo.nome, 'nome', { max: 150 }) };
  res.json(await contaService.aceitarConvite(req.usuario, req.params.id, dados));
}
