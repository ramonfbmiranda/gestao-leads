// Sugestão de pesos a partir dos desfechos (seção 8.10). Função pura: recebe
// os leads com desfecho ({ status, desfecho_score }) e a configuração já
// mesclada. Só sugere: aplicar é decisão do admin, pelo PUT /organizacao.

export const MINIMO_DESFECHOS = 30;
const PESO_MINIMO = 5;
const PONTOS_MAXIMOS_ESFORCO = 50;

export const FATORES_POR_PILAR = {
  valor: ['porte', 'capital_social', 'idade'],
  probabilidade: ['icp', 'qualificacao', 'midias_sociais'],
};
const PENALIDADES_FIXAS = ['contato_decisor', 'sem_nome_decisor', 'sem_redes_sociais', 'fora_ufs_atendidas'];

const arredondar = (numero, casas = 2) => (numero === null ? null : Math.round(numero * 10 ** casas) / 10 ** casas);
const media = (valores) => (valores.length === 0 ? null : valores.reduce((soma, valor) => soma + valor, 0) / valores.length);
const itensDe = (lista) => (Array.isArray(lista) ? lista : []);

/** Arredonda para inteiros mantendo a soma (maiores restos primeiro). Zeros continuam zero. */
function inteirosSomando(valores, total) {
  const chaves = Object.keys(valores);
  // A folga evita que 4,9999999 vire 4.
  const inteiros = Object.fromEntries(chaves.map((chave) => [chave, Math.floor(valores[chave] + 1e-9)]));
  let falta = total - chaves.reduce((soma, chave) => soma + inteiros[chave], 0);
  const ordem = chaves
    .filter((chave) => valores[chave] > 0)
    .sort((a, b) => valores[b] - inteiros[b] - (valores[a] - inteiros[a]));
  for (let i = 0; falta > 0 && ordem.length > 0; i += 1, falta -= 1) inteiros[ordem[i % ordem.length]] += 1;
  return inteiros;
}

/**
 * Pesos proporcionais às diferenças positivas, com mínimo de 5 por fator e
 * soma 100. Fator com peso atual 0 (desligado pela organização) continua 0.
 * Sem nenhuma diferença positiva não há o que sugerir: null.
 */
export function distribuirPesos(fatores, pesosAtuais) {
  const ligados = fatores.filter(({ fator }) => (pesosAtuais[fator] ?? 0) > 0);
  const ganho = new Map(ligados.map(({ fator, diferenca }) => [fator, Math.max(diferenca ?? 0, 0)]));
  if ([...ganho.values()].every((valor) => valor === 0)) return null;

  const pesos = Object.fromEntries(fatores.map(({ fator }) => [fator, 0]));
  let livres = ligados.map(({ fator }) => fator);
  let restante = 100;
  // Quem ficaria abaixo do mínimo recebe o mínimo, e o resto é redividido entre os outros.
  while (livres.length > 0) {
    const soma = livres.reduce((total, fator) => total + ganho.get(fator), 0);
    const abaixo = livres.filter((fator) => (restante * ganho.get(fator)) / soma < PESO_MINIMO);
    if (abaixo.length === 0) {
      for (const fator of livres) pesos[fator] = (restante * ganho.get(fator)) / soma;
      break;
    }
    for (const fator of abaixo) pesos[fator] = PESO_MINIMO;
    restante -= PESO_MINIMO * abaixo.length;
    livres = livres.filter((fator) => !abaixo.includes(fator));
  }
  return inteirosSomando(pesos, 100);
}

/** Valor e probabilidade: média dos pontos nos convertidos menos nos descartados (só fator "ok"). */
function sugerirPilar(leads, pilar, pesosAtuais) {
  const fatores = FATORES_POR_PILAR[pilar].map((fator) => {
    const pontos = { convertidos: [], descartados: [] };
    for (const { convertido, detalhes } of leads) {
      const item = itensDe(detalhes[pilar]?.fatores).find((candidato) => candidato?.fator === fator);
      if (item?.situacao === 'ok' && typeof item.pontos === 'number' && Number.isFinite(item.pontos)) {
        pontos[convertido ? 'convertidos' : 'descartados'].push(item.pontos);
      }
    }
    const mediaConvertidos = media(pontos.convertidos);
    const mediaDescartados = media(pontos.descartados);
    return {
      fator,
      leads: pontos.convertidos.length + pontos.descartados.length,
      convertidos: pontos.convertidos.length,
      descartados: pontos.descartados.length,
      media_convertidos: arredondar(mediaConvertidos),
      media_descartados: arredondar(mediaDescartados),
      diferenca:
        mediaConvertidos === null || mediaDescartados === null ? null : arredondar(mediaConvertidos - mediaDescartados),
    };
  });
  const atuais = Object.fromEntries(FATORES_POR_PILAR[pilar].map((fator) => [fator, pesosAtuais[fator] ?? 0]));
  return { atuais, sugeridos: distribuirPesos(fatores, atuais), fatores };
}

/**
 * Pontos atuais de cada penalidade. Tentativas somam pontos por tentativa até
 * um máximo, e cada pergunta do bloco relacionamento soma os pontos da opção:
 * o comparável é o máximo de cada uma.
 */
function pontosAtuaisDoEsforco(config) {
  const { esforco } = config;
  const atuais = Object.fromEntries(PENALIDADES_FIXAS.map((penalidade) => [penalidade, esforco[penalidade]]));
  atuais.tentativas_sem_resposta = esforco.tentativas.maximo;
  for (const pergunta of itensDe(config.avaliacao?.perguntas)) {
    if (pergunta.bloco !== 'relacionamento') continue;
    atuais[`relacionamento:${pergunta.id}`] = Math.max(0, ...itensDe(pergunta.opcoes).map((opcao) => opcao.pontos ?? 0));
  }
  return atuais;
}

/**
 * Esforço: taxa de conversão de quem tinha a penalidade aplicada contra a de
 * quem não tinha. A queda é a diferença das taxas; os pontos sugeridos são
 * proporcionais a ela, de 0 a 50 (a maior queda recebe 50). Sem os dois grupos
 * não há comparação: null.
 */
function sugerirEsforco(leads, config) {
  const atuais = pontosAtuaisDoEsforco(config);
  const penalidades = Object.keys(atuais).map((penalidade) => {
    const com = { leads: 0, convertidos: 0 };
    const sem = { leads: 0, convertidos: 0 };
    for (const { convertido, detalhes } of leads) {
      const item = itensDe(detalhes.esforco?.penalidades).find((candidato) => candidato?.penalidade === penalidade);
      // Sem dado ou desligada: não se sabe se a penalidade valia para o lead.
      if (!item || item.situacao === 'na' || item.situacao === 'desligado') continue;
      const grupo = item.aplicada === true ? com : sem;
      grupo.leads += 1;
      if (convertido) grupo.convertidos += 1;
    }
    const taxaCom = com.leads > 0 ? com.convertidos / com.leads : null;
    const taxaSem = sem.leads > 0 ? sem.convertidos / sem.leads : null;
    return {
      penalidade,
      leads: com.leads + sem.leads,
      com: { ...com, taxa: arredondar(taxaCom, 4) },
      sem: { ...sem, taxa: arredondar(taxaSem, 4) },
      queda: taxaCom === null || taxaSem === null ? null : arredondar(taxaSem - taxaCom, 4),
    };
  });

  const maiorQueda = Math.max(0, ...penalidades.map(({ queda }) => queda ?? 0));
  const sugeridos = Object.fromEntries(
    penalidades.map(({ penalidade, queda }) => {
      if (queda === null) return [penalidade, null];
      if (maiorQueda === 0) return [penalidade, 0];
      return [penalidade, Math.round((Math.max(queda, 0) / maiorQueda) * PONTOS_MAXIMOS_ESFORCO)];
    }),
  );
  return { atuais, sugeridos, penalidades };
}

/**
 * Exige pelo menos 30 convertidos e 30 descartados com score_detalhes da
 * versão 2. Com menos: { suficiente: false, convertidos, descartados, minimo }.
 * Com o bastante: pesos atuais e sugeridos de cada pilar, com o número de
 * leads usado em cada fator e penalidade.
 */
export function sugerirPesos(leads, config) {
  const usados = leads
    .filter(
      ({ status, desfecho_score: desfecho }) =>
        (status === 'convertido' || status === 'descartado') && desfecho?.score_detalhes?.versao === 2,
    )
    .map(({ status, desfecho_score: desfecho }) => ({
      convertido: status === 'convertido',
      detalhes: desfecho.score_detalhes,
    }));
  const convertidos = usados.filter(({ convertido }) => convertido).length;
  const descartados = usados.length - convertidos;
  const contagem = { convertidos, descartados, minimo: MINIMO_DESFECHOS };
  if (convertidos < MINIMO_DESFECHOS || descartados < MINIMO_DESFECHOS) return { suficiente: false, ...contagem };

  return {
    suficiente: true,
    ...contagem,
    valor: sugerirPilar(usados, 'valor', config.valor.pesos),
    probabilidade: sugerirPilar(usados, 'probabilidade', config.probabilidade.pesos),
    esforco: sugerirEsforco(usados, config),
  };
}
