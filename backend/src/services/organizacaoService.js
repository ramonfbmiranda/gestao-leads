import { supabase } from '../config/supabase.js';
import { mesclarConfigScore } from '../utils/configScore.js';
import { resultadoOuErro } from '../utils/erros.js';
import { sugerirPesos } from '../utils/sugestaoPesos.js';

const TAMANHO_PAGINA_DESFECHOS = 1000;

export const COLUNAS_ORGANIZACAO =
  'id, nome, escala_icp_max, escala_midias_max, escala_nota_max, config_score, created_at, updated_at';

export async function buscarOrganizacao(organizacaoId, colunas = COLUNAS_ORGANIZACAO) {
  return resultadoOuErro(
    await supabase.from('organizacoes').select(colunas).eq('id', organizacaoId).single(),
  );
}

/** `dados` já validado pelo controller (lista branca: nome, escalas e config_score). */
export async function atualizarOrganizacao(organizacaoId, dados) {
  return resultadoOuErro(
    await supabase
      .from('organizacoes')
      .update(dados)
      .eq('id', organizacaoId)
      .select(COLUNAS_ORGANIZACAO)
      .single(),
  );
}

/** Leads da organização com desfecho registrado (status e cópia do score), em páginas. */
async function buscarDesfechos(organizacaoId) {
  const leads = [];
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA_DESFECHOS) {
    const { data, error } = await supabase
      .from('leads')
      .select('status, desfecho_score')
      .eq('organizacao_id', organizacaoId)
      .in('status', ['convertido', 'descartado'])
      .not('desfecho_em', 'is', null)
      .order('id')
      .range(inicio, inicio + TAMANHO_PAGINA_DESFECHOS - 1);
    if (error?.code === 'PGRST103') break;
    const pagina = resultadoOuErro({ data, error });
    leads.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA_DESFECHOS) break;
  }
  return leads;
}

/** GET /organizacao/sugestao-pesos (seção 8.10). */
export async function sugestaoDePesos(organizacaoId) {
  const { config_score: config } = await buscarOrganizacao(organizacaoId, 'config_score');
  return sugerirPesos(await buscarDesfechos(organizacaoId), mesclarConfigScore(config ?? {}));
}
