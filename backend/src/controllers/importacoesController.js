import * as importacoesService from '../services/importacoesService.js';
import { naoEncontrado, requisicaoInvalida } from '../utils/erros.js';
import { ehUuid } from '../utils/validacao.js';

export async function preview(req, res) {
  res.json(importacoesService.preview(req.file));
}

// No multipart, o mapeamento chega como texto JSON no campo "mapeamento".
function lerMapeamento(valor) {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw requisicaoInvalida('Envie o campo "mapeamento" com o De-Para em JSON');
  }
  try {
    return JSON.parse(valor);
  } catch {
    throw requisicaoInvalida('O campo "mapeamento" não é um JSON válido');
  }
}

export async function importar(req, res) {
  const mapeamento = lerMapeamento(req.body?.mapeamento);
  const importacao = await importacoesService.importar(req.organizacaoId, req.perfil, req.file, mapeamento);
  res.status(201).json(importacao);
}

export async function listar(req, res) {
  res.json(await importacoesService.listarImportacoes(req.organizacaoId));
}

export async function obter(req, res) {
  if (!ehUuid(req.params.id)) throw naoEncontrado('Importação não encontrada');
  res.json(await importacoesService.obterImportacao(req.organizacaoId, req.params.id));
}
