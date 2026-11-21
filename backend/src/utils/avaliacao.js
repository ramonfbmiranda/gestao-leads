// Validação das respostas da avaliação do lead (especificação, seção 8.8).
// O corpo traz { respostas: { <pergunta>: <opção> | null }, ticket_estimado? }.

import { requisicaoInvalida } from './erros.js';

// numeric(14,2) no banco.
const TICKET_MAXIMO = 999999999999.99;

/**
 * Confere as respostas contra o modelo de perguntas da organização e devolve
 * { respostas, ticket_estimado? }: só as respostas preenchidas (null = sem
 * resposta) e o ticket apenas quando enviado (null limpa).
 */
export function validarAvaliacao(corpo, perguntas) {
  const { respostas, ticket_estimado: ticket } = corpo;
  if (respostas === null || typeof respostas !== 'object' || Array.isArray(respostas)) {
    throw requisicaoInvalida('O campo "respostas" deve ser um objeto { pergunta: opção }');
  }

  const porId = new Map(perguntas.map((pergunta) => [pergunta.id, pergunta]));
  const validas = {};
  for (const [idPergunta, idOpcao] of Object.entries(respostas)) {
    const pergunta = porId.get(idPergunta);
    if (!pergunta) throw requisicaoInvalida(`Pergunta desconhecida: "${idPergunta}"`);
    if (idOpcao === null) continue;
    if (typeof idOpcao !== 'string' || !pergunta.opcoes.some((opcao) => opcao.id === idOpcao)) {
      throw requisicaoInvalida(`Opção inválida para a pergunta "${idPergunta}": ${JSON.stringify(idOpcao)}`);
    }
    validas[idPergunta] = idOpcao;
  }

  const resultado = { respostas: validas };
  if (ticket !== undefined) {
    if (ticket === null) {
      resultado.ticket_estimado = null;
    } else if (typeof ticket !== 'number' || !Number.isFinite(ticket) || ticket < 0 || ticket > TICKET_MAXIMO) {
      throw requisicaoInvalida('O campo "ticket_estimado" deve ser um valor em reais maior ou igual a 0');
    } else {
      resultado.ticket_estimado = Math.round(ticket * 100) / 100;
    }
  }
  return resultado;
}
