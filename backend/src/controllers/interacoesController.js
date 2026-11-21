import * as interacoesService from '../services/interacoesService.js';
import { naoEncontrado, requisicaoInvalida } from '../utils/erros.js';
import { corpoObjeto, dataHoraOpcional, ehUuid, textoOpcional, umDe } from '../utils/validacao.js';

export const TIPOS_INTERACAO = ['ligacao', 'whatsapp', 'email', 'reuniao', 'visita', 'outro'];

// Diferença tolerada entre o relógio do cliente e o do servidor.
const TOLERANCIA_FUTURO_MS = 5 * 60 * 1000;

// id malformado responde igual a registro inexistente.
function idDe(valor, mensagem) {
  if (!ehUuid(valor)) throw naoEncontrado(mensagem);
  return valor;
}

const idDoLead = (req) => idDe(req.params.id, 'Lead não encontrado');

export async function listar(req, res) {
  res.json(await interacoesService.listarInteracoes(req.organizacaoId, idDoLead(req)));
}

export async function criar(req, res) {
  const leadId = idDoLead(req);
  const corpo = corpoObjeto(req.body);
  if (typeof corpo.teve_resposta !== 'boolean') {
    throw requisicaoInvalida('O campo "teve_resposta" é obrigatório e deve ser true ou false');
  }
  const dados = {
    tipo: umDe(corpo.tipo, TIPOS_INTERACAO, 'tipo'),
    teve_resposta: corpo.teve_resposta,
    observacao: textoOpcional(corpo.observacao, 'observacao', { max: 2000 }),
  };
  // Sem ocorreu_em, o banco usa a hora atual.
  const ocorreuEm = dataHoraOpcional(corpo.ocorreu_em, 'ocorreu_em');
  if (ocorreuEm) {
    if (ocorreuEm.getTime() > Date.now() + TOLERANCIA_FUTURO_MS) {
      throw requisicaoInvalida('O campo "ocorreu_em" não pode estar no futuro');
    }
    dados.ocorreu_em = ocorreuEm.toISOString();
  }
  const interacao = await interacoesService.registrarInteracao(req.organizacaoId, req.perfil.id, leadId, dados);
  res.status(201).json(interacao);
}

export async function excluir(req, res) {
  const leadId = idDoLead(req);
  const interacaoId = idDe(req.params.interacaoId, 'Interação não encontrada');
  await interacoesService.excluirInteracao(req.organizacaoId, req.perfil, leadId, interacaoId);
  res.status(204).end();
}
