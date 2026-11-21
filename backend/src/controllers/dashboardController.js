import * as dashboardService from '../services/dashboardService.js';

/** GET /dashboard/conversao: conversão por faixa e contagem por motivo de descarte. */
export async function conversao(req, res) {
  res.json(await dashboardService.conversaoPorFaixa(req.organizacaoId));
}
