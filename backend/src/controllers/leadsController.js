import * as leadsService from '../services/leadsService.js';
import { naoEncontrado, requisicaoInvalida } from '../utils/erros.js';
import {
  cnpjObrigatorio,
  corpoObjeto,
  ehUuid,
  inteiroDaConsulta,
  numeroOpcional,
  opcaoDaConsulta,
  textoObrigatorio,
  textoOpcional,
  umDe,
} from '../utils/validacao.js';

export const STATUS_LEAD = ['novo', 'em_contato', 'qualificado', 'descartado', 'convertido'];
const ORDENS = ['score_compensacao', 'nota_final', 'created_at'];

// Lista branca de campos editáveis (especificação, seção 5, item 7).
// Tamanhos máximos dos textos opcionais:
const TEXTOS_OPCIONAIS = { link_cnpj: 500, nome_decisor: 150, numero_decisor: 50, redes_sociais: 2000 };
const NOTAS = ['calculadora_icp', 'calculadora_midias_sociais', 'nota_final'];

function responsavelOpcional(valor) {
  if (valor === undefined || valor === null) return null;
  if (!ehUuid(valor)) throw requisicaoInvalida('O campo "responsavel_id" deve ser um id válido');
  return valor;
}

function camposEditaveis(corpo) {
  const dados = {};
  const tem = (campo) => Object.hasOwn(corpo, campo);
  if (tem('nome_lead')) dados.nome_lead = textoObrigatorio(corpo.nome_lead, 'nome_lead', { max: 200 });
  for (const [campo, max] of Object.entries(TEXTOS_OPCIONAIS)) {
    if (tem(campo)) dados[campo] = textoOpcional(corpo[campo], campo, { max });
  }
  for (const campo of NOTAS) {
    if (tem(campo)) dados[campo] = numeroOpcional(corpo[campo], campo);
  }
  if (tem('status')) dados.status = umDe(corpo.status, STATUS_LEAD, 'status');
  if (tem('responsavel_id')) dados.responsavel_id = responsavelOpcional(corpo.responsavel_id);
  return dados;
}

function idDoLead(req) {
  // id malformado responde igual a lead inexistente.
  if (!ehUuid(req.params.id)) throw naoEncontrado('Lead não encontrado');
  return req.params.id;
}

export async function listar(req, res) {
  const { query } = req;
  if (query.busca !== undefined && typeof query.busca !== 'string') {
    throw requisicaoInvalida('O parâmetro "busca" deve ser um texto');
  }
  const busca = query.busca?.trim() || null;
  if (busca && busca.length > 100) {
    throw requisicaoInvalida('O parâmetro "busca" deve ter no máximo 100 caracteres');
  }
  const filtros = {
    status: opcaoDaConsulta(query.status, STATUS_LEAD, 'status', { padrao: null }),
    busca,
    ordem: opcaoDaConsulta(query.ordem, ORDENS, 'ordem', { padrao: 'score_compensacao' }),
    direcao: opcaoDaConsulta(query.direcao, ['asc', 'desc'], 'direcao', { padrao: 'desc' }),
    pagina: inteiroDaConsulta(query.pagina, 'pagina', { padrao: 1, min: 1, max: 100000 }),
    limite: inteiroDaConsulta(query.limite, 'limite', { padrao: 20, min: 1, max: 100 }),
  };
  res.json(await leadsService.listarLeads(req.organizacaoId, filtros));
}

export async function obter(req, res) {
  res.json(await leadsService.obterLead(req.organizacaoId, idDoLead(req)));
}

export async function criar(req, res) {
  const corpo = corpoObjeto(req.body);
  const dados = {
    ...camposEditaveis(corpo),
    cnpj: cnpjObrigatorio(corpo.cnpj),
    nome_lead: textoObrigatorio(corpo.nome_lead, 'nome_lead', { max: 200 }),
  };
  res.status(201).json(await leadsService.criarLead(req.organizacaoId, dados));
}

export async function atualizar(req, res) {
  const id = idDoLead(req);
  const corpo = corpoObjeto(req.body);
  // O CNPJ é a chave da importação (upsert por organização + CNPJ).
  if (Object.hasOwn(corpo, 'cnpj')) {
    throw requisicaoInvalida('O CNPJ não pode ser alterado. Exclua o lead e cadastre novamente');
  }
  const dados = camposEditaveis(corpo);
  if (Object.keys(dados).length === 0) throw requisicaoInvalida('Nenhum campo válido para atualizar');
  res.json(await leadsService.atualizarLead(req.organizacaoId, id, dados));
}

export async function excluir(req, res) {
  await leadsService.excluirLead(req.organizacaoId, idDoLead(req));
  res.status(204).end();
}

export async function calcularScore(req, res) {
  res.json(await leadsService.calcularScoreDoLead(req.organizacaoId, idDoLead(req)));
}

export async function recalcularScores(req, res) {
  res.json(await leadsService.recalcularScoresDaOrganizacao(req.organizacaoId));
}
