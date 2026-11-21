// Processador da fila de enriquecimento, dentro do próprio backend.
//
// Um lead por vez, com pausa entre consultas para não sobrecarregar a
// BrasilAPI. O estado fica no banco: se o servidor reiniciar ou dormir, a fila
// recomeça de onde parou quando ele voltar (iniciarFila no server.js).

import { supabase } from '../config/supabase.js';
import { resultadoOuErro } from '../utils/erros.js';
import { processarReserva } from './enriquecimentoService.js';

export const PAUSA_ENTRE_CONSULTAS_MS = 1_000;
export const ESPERA_FILA_VAZIA_MS = 30_000;
const ESPERA_APOS_FALHA_MS = 30_000;
const ESPERA_MAXIMA_MS = 5 * 60_000;

let ultimaOrganizacao = null;
let rodando = false;
let despertar = null;

/**
 * Reserva e processa o próximo lead da fila. Devolve o resultado de
 * processarReserva, ou null se não houver lead pronto.
 * A organização atendida é guardada para o rodízio entre organizações.
 */
export async function processarProximo() {
  const reserva = resultadoOuErro(
    await supabase.rpc('pegar_proximo_enriquecimento', { p_depois_de: ultimaOrganizacao }),
  );
  if (!reserva) return null;
  ultimaOrganizacao = reserva.organizacao_id;
  return processarReserva(reserva);
}

/**
 * Quanto esperar depois de um ciclo. Com a BrasilAPI fora do ar, a espera
 * cresce a cada falha seguida, para não gastar as tentativas de todos os leads
 * da fila durante a mesma queda. `resultado` é o retorno de processarProximo,
 * ou `erro: true` se o próprio ciclo falhou (ex.: banco indisponível).
 */
export function proximaEspera({ resultado, erro = false }, falhasSeguidas) {
  if (erro || resultado?.transitorio) {
    const falhas = falhasSeguidas + 1;
    return { espera: Math.min(ESPERA_APOS_FALHA_MS * falhas, ESPERA_MAXIMA_MS), despertavel: false, falhas };
  }
  if (!resultado) return { espera: ESPERA_FILA_VAZIA_MS, despertavel: true, falhas: 0 };
  return { espera: PAUSA_ENTRE_CONSULTAS_MS, despertavel: false, falhas: 0 };
}

function esperar(ms, despertavel) {
  return new Promise((resolver) => {
    const fim = () => {
      clearTimeout(temporizador);
      if (despertar === fim) despertar = null;
      resolver();
    };
    const temporizador = setTimeout(fim, ms);
    if (despertavel) despertar = fim;
  });
}

/** Chamado depois de enfileirar: se a fila estiver ociosa, começa na hora. */
export function acordarFila() {
  despertar?.();
}

export function iniciarFila() {
  if (rodando) return;
  rodando = true;
  console.log('[enriquecimento] fila iniciada');

  (async () => {
    let falhas = 0;
    while (rodando) {
      let ciclo;
      try {
        ciclo = { resultado: await processarProximo() };
      } catch (erro) {
        console.error('[enriquecimento] falha na fila:', erro.message);
        ciclo = { erro: true };
      }
      const proximo = proximaEspera(ciclo, falhas);
      falhas = proximo.falhas;
      await esperar(proximo.espera, proximo.despertavel);
    }
  })();
}

export function pararFila() {
  rodando = false;
  acordarFila();
}
