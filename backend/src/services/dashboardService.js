// Números do dashboard. A conversão por faixa (seção 8.10) vem da função SQL
// contar_desfechos, a mesma que o score usa para a chance de fechar.

import { supabase } from '../config/supabase.js';
import { resultadoOuErro } from '../utils/erros.js';

export const FAIXAS = ['alta', 'media', 'baixa', 'na'];

/**
 * { faixas: { alta: { convertidos, descartados }, ... }, motivos: { motivo: n } }
 * → { faixas: { alta: { convertidos, descartados, taxa }, ... }, motivos: [{ motivo, total }] }.
 * Taxa = convertidos ÷ (convertidos + descartados), nula sem desfechos.
 */
export function montarConversao(contagem) {
  const faixas = {};
  for (const faixa of FAIXAS) {
    const convertidos = Number(contagem?.faixas?.[faixa]?.convertidos ?? 0);
    const descartados = Number(contagem?.faixas?.[faixa]?.descartados ?? 0);
    const total = convertidos + descartados;
    faixas[faixa] = {
      convertidos,
      descartados,
      taxa: total === 0 ? null : Math.round((convertidos / total) * 10000) / 10000,
    };
  }
  const motivos = Object.entries(contagem?.motivos ?? {})
    .map(([motivo, total]) => ({ motivo, total: Number(total) }))
    .sort((a, b) => b.total - a.total || a.motivo.localeCompare(b.motivo, 'pt-BR'));
  return { faixas, motivos };
}

export async function conversaoPorFaixa(organizacaoId) {
  const contagem = resultadoOuErro(await supabase.rpc('contar_desfechos', { p_organizacao_id: organizacaoId }));
  return montarConversao(contagem);
}
