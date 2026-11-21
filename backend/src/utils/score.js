// Score de compensação (especificação, seção 8). Funções puras: recebem o lead
// e a organização, não acessam o banco e não dependem do relógio (a data de
// referência é um parâmetro), então todo caso é testável.
//
// Regra central: dado que falta é N/A (null), nunca um número inventado.

import { mesclarConfigScore } from './configScore.js';

export const VERSAO_SCORE = 1;

const ROTULOS = {
  porte: 'Porte',
  capital_social: 'Capital social',
  idade: 'Idade da empresa',
  cnae: 'CNAE prioritário',
  icp: 'Calculadora ICP',
  midias_sociais: 'Calculadora de mídias sociais',
  sem_numero_decisor: 'Sem número do decisor',
  sem_nome_decisor: 'Sem nome do decisor',
  sem_redes_sociais: 'Sem redes sociais nem site',
  fora_ufs_atendidas: 'UF fora das atendidas',
};

const arredondar = (numero) => Math.round(numero * 100) / 100;
const limitar = (numero, minimo, maximo) => Math.min(maximo, Math.max(minimo, numero));

/** Maiúsculas, sem acento e com espaços simples: "Micro  Empresa" → "MICRO EMPRESA". */
export function normalizarRotulo(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const vazio = (valor) => valor === null || valor === undefined || String(valor).trim() === '';

/** [[limite_superior_exclusivo, pontos], ..., [null, pontos]] → pontos da faixa do valor. */
export function pontosDaFaixa(valor, faixas) {
  const faixa = faixas.find(([limite]) => limite === null || valor < limite);
  return faixa ? faixa[1] : faixas.at(-1)[1];
}

/** Anos completos (com fração) entre a data de abertura ("AAAA-MM-DD") e a referência. */
export function idadeEmAnos(dataAbertura, referencia) {
  const abertura = new Date(`${String(dataAbertura).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(abertura.getTime())) return null;
  const dias = (referencia.getTime() - abertura.getTime()) / 86400000;
  return Math.max(0, dias / 365.2425);
}

// Fator disponível: { pontos, valor_bruto }. N/A: { na: motivo }. Desligado pela organização: { desligado: motivo }.
function fatoresDoValor(lead, config, referencia) {
  const { valor } = config;
  const porteNormalizado = vazio(lead.porte) ? null : normalizarRotulo(lead.porte);
  const tabelaPorte = Object.fromEntries(Object.entries(valor.porte).map(([chave, pontos]) => [normalizarRotulo(chave), pontos]));
  const cnaes = valor.cnaes_prioritarios;
  const anos = vazio(lead.data_abertura) ? null : idadeEmAnos(lead.data_abertura, referencia);

  return {
    porte:
      porteNormalizado === null
        ? { na: 'Porte desconhecido' }
        : Object.hasOwn(tabelaPorte, porteNormalizado)
          ? { pontos: tabelaPorte[porteNormalizado], valor_bruto: lead.porte }
          : { na: `Porte "${lead.porte}" sem pontuação configurada` },
    // Na base da Receita, capital zero é o padrão de quem não declara capital
    // (empresário individual, associações): é falta de dado, não capital baixo.
    capital_social: vazio(lead.capital_social)
      ? { na: 'Capital social desconhecido' }
      : Number(lead.capital_social) === 0
        ? { na: 'Capital social não informado na Receita (zero)', valor_bruto: 0 }
        : {
          pontos: pontosDaFaixa(Number(lead.capital_social), valor.capital_social_faixas),
          valor_bruto: Number(lead.capital_social),
        },
    idade:
      anos === null
        ? { na: 'Data de abertura desconhecida' }
        : { pontos: pontosDaFaixa(anos, valor.idade_faixas), valor_bruto: arredondar(anos) },
    cnae:
      cnaes.length === 0
        ? { desligado: 'Nenhum CNAE prioritário configurado' }
        : vazio(lead.cnae_principal)
          ? { na: 'CNAE principal desconhecido' }
          : {
              pontos: cnaes.includes(String(lead.cnae_principal).replace(/\D/g, '')) ? 100 : 0,
              valor_bruto: String(lead.cnae_principal),
            },
  };
}

function nota(valorBruto, escala, rotulo) {
  if (vazio(valorBruto)) return { na: `${rotulo} sem nota` };
  const numero = Number(valorBruto);
  // Acima da escala (a organização pode ter reduzido a escala depois): limita a 100.
  return { pontos: arredondar(limitar((numero / escala) * 100, 0, 100)), valor_bruto: numero };
}

function fatoresDaProbabilidade(lead, organizacao) {
  return {
    icp: nota(lead.calculadora_icp, Number(organizacao.escala_icp_max), 'Calculadora ICP'),
    midias_sociais: nota(lead.calculadora_midias_sociais, Number(organizacao.escala_midias_max), 'Calculadora de mídias sociais'),
  };
}

/**
 * Média ponderada dos fatores disponíveis. Fator N/A sai da conta e os pesos
 * dos outros são redistribuídos; sem nenhum fator disponível, o pilar é N/A.
 * Fator com peso 0 ou desligado pela organização não torna o pilar parcial.
 */
export function calcularPilar(fatores, pesos) {
  const contaveis = Object.entries(fatores).filter(
    ([nome, fator]) => (pesos[nome] ?? 0) > 0 && !fator.desligado,
  );
  const disponiveis = contaveis.filter(([, fator]) => !fator.na);
  const somaPesos = disponiveis.reduce((soma, [nome]) => soma + pesos[nome], 0);

  const detalhes = Object.entries(fatores).map(([nome, fator]) => {
    const peso = pesos[nome] ?? 0;
    const base = { fator: nome, rotulo: ROTULOS[nome], peso };
    if (fator.desligado || peso === 0) {
      return { ...base, situacao: 'desligado', motivo: fator.desligado ?? 'Peso zero na configuração', pontos: null, peso_efetivo: 0, contribuicao: 0 };
    }
    if (fator.na) {
      return { ...base, situacao: 'na', motivo: fator.na, valor_bruto: fator.valor_bruto ?? null, pontos: null, peso_efetivo: 0, contribuicao: 0 };
    }
    const pesoEfetivo = peso / somaPesos;
    return {
      ...base,
      situacao: 'ok',
      valor_bruto: fator.valor_bruto,
      pontos: fator.pontos,
      peso_efetivo: arredondar(pesoEfetivo * 100),
      contribuicao: arredondar(fator.pontos * pesoEfetivo),
    };
  });

  const valor =
    disponiveis.length === 0
      ? null
      : arredondar(disponiveis.reduce((soma, [nome, fator]) => soma + fator.pontos * (pesos[nome] / somaPesos), 0));
  return {
    valor,
    parcial: disponiveis.length < contaveis.length,
    fatores: detalhes,
  };
}

/** Lead com presença digital: algum link separado ou um "@perfil" no texto original. */
function temRedesSociais(lead) {
  if ((lead.quantidade_redes ?? 0) > 0) return true;
  return /@[a-z0-9._]{2,}/i.test(lead.redes_sociais ?? '');
}

/** Soma das penalidades, limitada a 100. Sempre calculável. */
export function calcularEsforco(lead, config) {
  const { esforco } = config;
  const ufs = esforco.ufs_atendidas;
  const uf = vazio(lead.uf) ? null : String(lead.uf).toUpperCase();

  const penalidades = [
    ['sem_numero_decisor', vazio(lead.numero_decisor) ? 'aplicada' : 'ok'],
    ['sem_nome_decisor', vazio(lead.nome_decisor) ? 'aplicada' : 'ok'],
    ['sem_redes_sociais', temRedesSociais(lead) ? 'ok' : 'aplicada'],
    ['fora_ufs_atendidas', ufs.length === 0 ? 'desligado' : uf === null ? 'na' : ufs.includes(uf) ? 'ok' : 'aplicada'],
  ].map(([nome, situacao]) => ({
    penalidade: nome,
    rotulo: ROTULOS[nome],
    pontos: esforco[nome],
    situacao,
    aplicada: situacao === 'aplicada',
    ...(situacao === 'na' ? { motivo: 'UF desconhecida' } : {}),
    ...(situacao === 'desligado' ? { motivo: 'Nenhuma UF atendida configurada' } : {}),
  }));

  const soma = penalidades.filter((p) => p.aplicada).reduce((total, p) => total + p.pontos, 0);
  return {
    valor: arredondar(Math.min(100, soma)),
    parcial: penalidades.some((p) => p.situacao === 'na'),
    penalidades,
  };
}

export function faixaDoScore(score, faixas) {
  if (score === null) return 'na';
  if (score >= faixas.alta) return 'alta';
  if (score >= faixas.media) return 'media';
  return 'baixa';
}

/**
 * Calcula o score completo de um lead.
 * lead: colunas do lead + quantidade_redes (links em lead_redes_sociais).
 * organizacao: escalas, config_score e updated_at.
 * Devolve as colunas de score prontas para gravar.
 */
export function calcularScore(lead, organizacao, { referencia = new Date() } = {}) {
  const config = mesclarConfigScore(organizacao.config_score ?? {});
  const valor = calcularPilar(fatoresDoValor(lead, config, referencia), config.valor.pesos);
  const probabilidade = calcularPilar(fatoresDaProbabilidade(lead, organizacao), config.probabilidade.pesos);
  const esforco = calcularEsforco(lead, config);

  const divisor = 1 + esforco.valor / 100;
  let formula;
  let compensacao;
  if (valor.valor !== null && probabilidade.valor !== null) {
    formula = 'media_geometrica';
    compensacao = Math.sqrt(valor.valor * probabilidade.valor) / divisor;
  } else if (valor.valor !== null || probabilidade.valor !== null) {
    formula = 'pilar_unico';
    compensacao = (valor.valor ?? probabilidade.valor) / divisor;
  } else {
    formula = 'na';
    compensacao = null;
  }
  if (compensacao !== null) compensacao = arredondar(limitar(compensacao, 0, 100));
  const compensacaoSemLimite = compensacao;

  // Situação cadastral conhecida e diferente de ativa limita o score.
  const situacao = vazio(lead.situacao_cadastral) ? null : normalizarRotulo(lead.situacao_cadastral);
  let limiteSituacao = null;
  if (situacao !== null && situacao !== 'ATIVA') {
    limiteSituacao = { situacao: lead.situacao_cadastral, limite: config.situacao_inativa_limite };
    if (compensacao !== null) compensacao = Math.min(compensacao, config.situacao_inativa_limite);
  }

  const motivosParcial = [
    ...valor.fatores.filter((f) => f.situacao === 'na').map((f) => f.motivo),
    ...probabilidade.fatores.filter((f) => f.situacao === 'na').map((f) => f.motivo),
    ...esforco.penalidades.filter((p) => p.situacao === 'na').map((p) => p.motivo),
    ...(situacao === null ? ['Situação cadastral desconhecida'] : []),
  ];

  return {
    score_valor: valor.valor,
    score_probabilidade: probabilidade.valor,
    score_esforco: esforco.valor,
    score_compensacao: compensacao,
    score_parcial: motivosParcial.length > 0,
    score_detalhes: {
      versao: VERSAO_SCORE,
      config_em: organizacao.updated_at ?? null,
      formula,
      faixa: faixaDoScore(compensacao, config.faixas),
      compensacao_sem_limite: compensacaoSemLimite,
      limite_situacao: limiteSituacao,
      motivos_parcial: motivosParcial,
      valor,
      probabilidade,
      esforco,
    },
  };
}
