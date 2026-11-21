import * as dashboardService from '../services/dashboardService.js';

/** GET /dashboard/resumo: totais, faixas, distribuição, ranking e mudanças na Receita. */
export async function resumo(req, res) {
  res.json(await dashboardService.resumoDoDashboard(req.organizacaoId));
}

/** GET /dashboard/conversao: conversão por faixa e contagem por motivo de descarte. */
export async function conversao(req, res) {
  res.json(await dashboardService.conversaoPorFaixa(req.organizacaoId));
}
