import * as organizacaoService from '../services/organizacaoService.js';
import { validarConfigScore } from '../utils/configScore.js';
import { requisicaoInvalida } from '../utils/erros.js';
import { corpoObjeto, escalaValida, textoObrigatorio } from '../utils/validacao.js';

const ESCALAS = ['escala_icp_max', 'escala_midias_max', 'escala_nota_max'];

/**
 * PUT /organizacao (admin). Atualiza só os campos enviados. O config_score
 * enviado substitui o anterior por inteiro; o que não vier usa o padrão.
 */
export async function atualizar(req, res) {
  const corpo = corpoObjeto(req.body);
  const dados = {};
  if (Object.hasOwn(corpo, 'nome')) dados.nome = textoObrigatorio(corpo.nome, 'nome', { max: 150 });
  for (const escala of ESCALAS) {
    if (Object.hasOwn(corpo, escala)) dados[escala] = escalaValida(corpo[escala], escala);
  }
  if (Object.hasOwn(corpo, 'config_score')) dados.config_score = validarConfigScore(corpo.config_score);

  if (Object.keys(dados).length === 0) throw requisicaoInvalida('Nenhum campo válido para atualizar');
  res.json(await organizacaoService.atualizarOrganizacao(req.organizacaoId, dados));
}

/** GET /organizacao/sugestao-pesos (admin): só sugere, não altera a configuração. */
export async function sugestaoPesos(req, res) {
  res.json(await organizacaoService.sugestaoDePesos(req.organizacaoId));
}
