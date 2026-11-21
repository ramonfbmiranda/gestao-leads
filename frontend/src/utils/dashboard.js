// Contas e textos do dashboard (seção 11.3). Funções puras.

import { faixaDoPotencial } from './formatos.js';

export const ORDEM_FAIXAS = ['alta', 'media', 'baixa', 'na'];

/** { alta: n, ... } → [{ faixa, total, parte }] na ordem alto → N/A; parte de 0 a 1. */
export function partesDaCarteira(porFaixa) {
  const total = ORDEM_FAIXAS.reduce((soma, faixa) => soma + (porFaixa?.[faixa] ?? 0), 0);
  return ORDEM_FAIXAS.map((faixa) => {
    const n = porFaixa?.[faixa] ?? 0;
    return { faixa, total: n, parte: total === 0 ? 0 : n / total };
  });
}

/** 0,193 → "19%"; acima de zero e abaixo de 1% → "<1%". */
export function formatarParte(fracao) {
  if (fracao > 0 && fracao < 0.005) return '<1%';
  return `${Math.round(fracao * 100)}%`;
}

/** Intervalo de pontos de cada faixa pelos limites da organização. */
export function intervaloDaFaixa(faixa, limites) {
  const numero = (n) => String(n).replace('.', ',');
  if (faixa === 'alta') return `${numero(limites.alta)} a 100`;
  if (faixa === 'media') return `${numero(limites.media)} a ${numero(limites.alta)}`;
  if (faixa === 'baixa') return `abaixo de ${numero(limites.media)}`;
  return 'sem dados';
}

/** Faixa de um bloco de 10 pontos do histograma, pelo meio do bloco. */
export function faixaDoBloco(de, limites) {
  return faixaDoPotencial(de + 5, limites).faixa;
}

/** Rótulo do bloco: "30 a 40"; o último inclui o 100. */
export function rotuloDoBloco(de) {
  return `${de} a ${de + 10}`;
}

const ROTULOS_CAMPO = { situacao_cadastral: 'Situação', porte: 'Porte' };

function capitalizar(texto) {
  if (texto === null || texto === undefined || texto === '') return '—';
  const minusculo = String(texto).toLowerCase();
  return minusculo.charAt(0).toUpperCase() + minusculo.slice(1);
}

/** { campo: 'porte', de: 'MICRO EMPRESA', para: 'DEMAIS' } → "Porte: Micro empresa → Demais". */
export function textoDaMudanca({ campo, de, para }) {
  return `${ROTULOS_CAMPO[campo] ?? campo}: ${capitalizar(de)} → ${capitalizar(para)}`;
}

/** Data ISO → "18/11". */
export function dataCurta(iso) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/**
 * Conversão por faixa para a tela: só as faixas com algum desfecho, na ordem
 * alto → N/A. Devolve [{ faixa, convertidos, total, taxa }].
 */
export function linhasDeConversao(faixas) {
  return ORDEM_FAIXAS.map((faixa) => {
    const { convertidos = 0, descartados = 0, taxa = null } = faixas?.[faixa] ?? {};
    return { faixa, convertidos, total: convertidos + descartados, taxa };
  }).filter((linha) => linha.total > 0);
}
