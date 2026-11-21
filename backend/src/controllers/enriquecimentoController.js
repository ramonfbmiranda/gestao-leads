import * as enriquecimentoService from '../services/enriquecimentoService.js';
import { acordarFila } from '../services/filaEnriquecimento.js';
import { naoEncontrado, requisicaoInvalida } from '../utils/erros.js';
import { corpoObjeto, ehUuid } from '../utils/validacao.js';

const MAXIMO_IDS = 1000;

function idsOpcionais(valor) {
  if (valor === undefined || valor === null) return null;
  if (!Array.isArray(valor) || valor.length === 0 || valor.length > MAXIMO_IDS) {
    throw requisicaoInvalida(`O campo "ids" deve ser uma lista de 1 a ${MAXIMO_IDS} ids`);
  }
  if (!valor.every(ehUuid)) throw requisicaoInvalida('O campo "ids" contém um id inválido');
  return [...new Set(valor.map((id) => id.toLowerCase()))];
}

export async function enriquecer(req, res) {
  // id malformado responde igual a lead inexistente.
  if (!ehUuid(req.params.id)) throw naoEncontrado('Lead não encontrado');
  res.json(await enriquecimentoService.enriquecerLead(req.organizacaoId, req.params.id));
}

export async function enfileirar(req, res) {
  // O corpo é opcional: sem ele, entram todos os leads ainda não enriquecidos.
  const corpo = req.body === undefined ? {} : corpoObjeto(req.body);
  const resultado = await enriquecimentoService.enfileirarLeads(req.organizacaoId, idsOpcionais(corpo.ids));
  if (resultado.enfileirados > 0) acordarFila();
  res.status(202).json(resultado);
}

export async function status(req, res) {
  res.json(await enriquecimentoService.statusEnriquecimento(req.organizacaoId));
}
