// Regras do potencial usadas na interface. O cálculo oficial é do backend
// (utils/score.js); aqui só há o necessário para pré-visualizar e explicar.

const arredondar = (n) => Math.round(n * 100) / 100;

/** Média ponderada das respostas de um bloco; null se nenhuma tiver pontos. */
export function notaDoBloco(perguntas, respostas, bloco) {
  let soma = 0;
  let pesos = 0;
  for (const pergunta of perguntas.filter((p) => p.bloco === bloco)) {
    const opcao = pergunta.opcoes.find((o) => o.id === respostas[pergunta.id]);
    if (!opcao || opcao.pontos === null || !(pergunta.peso > 0)) continue;
    soma += opcao.pontos * pergunta.peso;
    pesos += pergunta.peso;
  }
  return pesos === 0 ? null : arredondar(soma / pesos);
}

/**
 * Prévia do potencial com novas respostas, a partir do score_detalhes (v2)
 * atual do lead. Valor e encaixe no perfil continuam os mesmos; mudam
 * qualificação, mídias e as penalidades do bloco relacionamento.
 * Devolve { valor, probabilidade, esforco, compensacao, qualificacao, midias }.
 */
export function simularAvaliacao(detalhes, perguntas, respostas) {
  if (!detalhes || detalhes.versao !== 2) return null;
  const fatores = detalhes.probabilidade?.fatores ?? [];
  const fator = (nome) => fatores.find((f) => f.fator === nome);

  const qualificacao = notaDoBloco(perguntas, respostas, 'qualificacao');
  const midiasAvaliacao = notaDoBloco(perguntas, respostas, 'midias');
  const midiasAtual = fator('midias_sociais');
  // Sem respostas de mídias, vale a nota da planilha (se o fator atual veio dela).
  const midias = midiasAvaliacao ?? (midiasAtual?.origem === 'planilha' ? midiasAtual.pontos : null);
  const icp = fator('icp');

  const partes = [
    [icp?.situacao === 'ok' ? icp.pontos : null, icp?.peso ?? 0],
    [qualificacao, fator('qualificacao')?.peso ?? 0],
    [midias, midiasAtual?.peso ?? 0],
  ].filter(([pontos, peso]) => pontos !== null && peso > 0);
  const somaPesos = partes.reduce((t, [, peso]) => t + peso, 0);
  const probabilidade = somaPesos === 0 ? null : arredondar(partes.reduce((t, [p, w]) => t + p * w, 0) / somaPesos);

  const penalidades = detalhes.esforco?.penalidades ?? [];
  let esforco = penalidades
    .filter((p) => p.aplicada && !p.penalidade.startsWith('relacionamento:'))
    .reduce((t, p) => t + p.pontos, 0);
  for (const pergunta of perguntas.filter((p) => p.bloco === 'relacionamento')) {
    const opcao = pergunta.opcoes.find((o) => o.id === respostas[pergunta.id]);
    if (opcao?.pontos) esforco += opcao.pontos;
  }
  esforco = arredondar(Math.min(100, esforco));

  const valor = detalhes.valor?.valor ?? null;
  let compensacao = null;
  if (valor !== null && probabilidade !== null) compensacao = Math.sqrt(valor * probabilidade);
  else if (valor !== null || probabilidade !== null) compensacao = valor ?? probabilidade;
  if (compensacao !== null) {
    compensacao = arredondar(Math.min(100, Math.max(0, compensacao / (1 + esforco / 100))));
    if (detalhes.limite_situacao) compensacao = Math.min(compensacao, detalhes.limite_situacao.limite);
  }
  return { valor, probabilidade, esforco, compensacao, qualificacao, midias };
}

const QUALIFICACOES_DE_DECISAO = ['ADMINISTRADOR', 'PRESIDENTE', 'DIRETOR', 'GERENTE'];
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** Mesma regra do backend (seção 9.1): o sócio que provavelmente decide. */
export function decisorProvavel(socios) {
  if (!Array.isArray(socios) || socios.length === 0) return null;
  const validos = socios.filter((s) => s && typeof s.nome === 'string' && s.nome.trim());
  const decide = validos.find((s) => QUALIFICACOES_DE_DECISAO.some((p) => semAcento(s.qualificacao).includes(p)));
  if (decide) return decide;
  return validos.length === 1 ? validos[0] : null;
}

/** Ponto do arco do medidor (semicírculo de centro 120,120 e raio 96) para um valor 0–100. */
export function pontoDoArco(valor, raio = 96) {
  const angulo = Math.PI * (1 - Math.min(100, Math.max(0, valor)) / 100);
  return { x: arredondar(120 + raio * Math.cos(angulo)), y: arredondar(120 - raio * Math.sin(angulo)) };
}

export const PROXIMO_STATUS = { novo: 'em_contato', em_contato: 'qualificado', qualificado: 'convertido' };
