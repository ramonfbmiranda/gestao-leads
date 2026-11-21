// Enriquecimento por CNPJ (especificação, seção 9). A reserva do lead é feita
// por funções SQL (o estado da fila fica no banco); aqui consulta a BrasilAPI,
// grava o resultado e recalcula o score.

import { supabase } from '../config/supabase.js';
import { conflito, resultadoOuErro, servicoIndisponivel } from '../utils/erros.js';
import { esperaAntesDaProxima } from '../utils/enriquecimento.js';
import { consultarCnpj } from './brasilApiService.js';
import { obterLead } from './leadsService.js';
import { recalcularSemInterromper } from './scoreService.js';

async function gravarResultado(reserva, campos) {
  resultadoOuErro(
    await supabase
      .from('leads')
      .update(campos)
      .eq('id', reserva.id)
      .eq('organizacao_id', reserva.organizacao_id),
  );
}

/**
 * Processa um lead já reservado ({ id, organizacao_id, cnpj, tentativas }).
 * Devolve { status, transitorio, mensagem? }: o status final gravado no lead e
 * se a falha foi passageira (BrasilAPI fora do ar, limite de taxa...).
 * Falha passageira volta para a fila com espera crescente até esgotar as
 * tentativas; depois disso, o lead fica como "erro".
 */
export async function processarReserva(reserva) {
  const resultado = await consultarCnpj(reserva.cnpj);

  if (resultado.tipo === 'ok') {
    await gravarResultado(reserva, {
      ...resultado.dados,
      enriquecido_em: new Date().toISOString(),
      enriquecimento_status: 'concluido',
      enriquecimento_erro: null,
      enriquecimento_proxima_em: null,
    });
    await recalcularSemInterromper(reserva.organizacao_id, { ids: [reserva.id] });
    return { status: 'concluido', transitorio: false };
  }

  if (resultado.tipo === 'transitorio') {
    const espera = esperaAntesDaProxima(reserva.tentativas);
    if (espera !== null) {
      await gravarResultado(reserva, {
        enriquecimento_status: 'pendente',
        enriquecimento_erro: resultado.mensagem,
        enriquecimento_proxima_em: new Date(Date.now() + espera).toISOString(),
      });
      return { status: 'pendente', transitorio: true, mensagem: resultado.mensagem };
    }
    const mensagem = `${resultado.mensagem}; desistiu após ${reserva.tentativas} tentativas`;
    await gravarResultado(reserva, {
      enriquecimento_status: 'erro',
      enriquecimento_erro: mensagem,
      enriquecimento_proxima_em: null,
    });
    return { status: 'erro', transitorio: true, mensagem };
  }

  // nao_encontrado, nao_suportado ou erro definitivo: não adianta tentar de novo.
  // Dados de um enriquecimento anterior são mantidos.
  await gravarResultado(reserva, {
    enriquecimento_status: resultado.tipo,
    enriquecimento_erro: resultado.mensagem,
    enriquecimento_proxima_em: null,
  });
  return { status: resultado.tipo, transitorio: false, mensagem: resultado.mensagem };
}

/**
 * POST /leads/:id/enriquecer: consulta na hora e devolve o lead atualizado.
 * Se a BrasilAPI estiver fora do ar, o lead entra na fila para nova tentativa
 * e a resposta é 503.
 */
export async function enriquecerLead(organizacaoId, leadId) {
  const reserva = resultadoOuErro(
    await supabase.rpc('reservar_enriquecimento', { p_organizacao_id: organizacaoId, p_lead_id: leadId }),
    { P0002: 'Lead não encontrado' },
  );
  if (!reserva) throw conflito('O enriquecimento deste lead já está em andamento');

  const resultado = await processarReserva(reserva);
  if (resultado.transitorio) {
    throw servicoIndisponivel(
      'A consulta de CNPJ está indisponível no momento. O lead entrou na fila e será tentado de novo automaticamente',
    );
  }
  return obterLead(organizacaoId, leadId);
}

/**
 * POST /leads/enriquecer-lote: coloca na fila os leads ainda não enriquecidos
 * (ou os `ids` informados) e devolve quantos entraram.
 */
export async function enfileirarLeads(organizacaoId, ids = null) {
  const enfileirados = resultadoOuErro(
    await supabase.rpc('enfileirar_enriquecimento', { p_organizacao_id: organizacaoId, p_ids: ids }),
  );
  return { enfileirados };
}

/** GET /leads/enriquecimento/status: contagem por situação. */
export async function statusEnriquecimento(organizacaoId) {
  return resultadoOuErro(await supabase.rpc('contar_enriquecimento', { p_organizacao_id: organizacaoId }));
}
