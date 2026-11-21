// Configuração do score por organização (especificação, seção 8.6).
// A organização guarda só o que mudou em relação ao padrão; o motor do score
// usa mesclarConfigScore() para obter a configuração completa.

import { requisicaoInvalida } from './erros.js';

export const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

export const BLOCOS_AVALIACAO = ['qualificacao', 'midias', 'relacionamento'];

const NAO_SEI = { id: 'nao_sei', rotulo: 'Não sei', pontos: null };
const SIM_NAO = [{ id: 'sim', rotulo: 'Sim', pontos: 100 }, { id: 'nao', rotulo: 'Não', pontos: 0 }, NAO_SEI];

// Modelo padrão de perguntas da avaliação do lead (seção 8.8).
export const AVALIACAO_PADRAO = [
  {
    id: 'orcamento', bloco: 'qualificacao', texto: 'A empresa tem orçamento para isso?', peso: 30,
    opcoes: [
      { id: 'confirmado', rotulo: 'Sim, confirmado', pontos: 100 },
      { id: 'provavelmente', rotulo: 'Provavelmente', pontos: 60 },
      { id: 'nao', rotulo: 'Não', pontos: 0 },
      NAO_SEI,
    ],
  },
  {
    id: 'decisor', bloco: 'qualificacao', texto: 'Vocês estão falando com quem decide?', peso: 25,
    opcoes: [
      { id: 'sim', rotulo: 'Sim', pontos: 100 },
      { id: 'influencia', rotulo: 'Com quem influencia', pontos: 60 },
      { id: 'nao', rotulo: 'Não', pontos: 20 },
      NAO_SEI,
    ],
  },
  {
    id: 'necessidade', bloco: 'qualificacao', texto: 'A necessidade está clara?', peso: 30,
    opcoes: [
      { id: 'muito_clara', rotulo: 'Muito clara', pontos: 100 },
      { id: 'alguma', rotulo: 'Alguma', pontos: 60 },
      { id: 'pouca', rotulo: 'Pouca', pontos: 30 },
      { id: 'nenhuma', rotulo: 'Nenhuma', pontos: 0 },
      NAO_SEI,
    ],
  },
  {
    id: 'prazo', bloco: 'qualificacao', texto: 'Quando pretendem decidir?', peso: 15,
    opcoes: [
      { id: 'ate_1_mes', rotulo: 'Em até 1 mês', pontos: 100 },
      { id: 'ate_3_meses', rotulo: 'Em até 3 meses', pontos: 70 },
      { id: 'ate_6_meses', rotulo: 'Em até 6 meses', pontos: 40 },
      { id: 'sem_prazo', rotulo: 'Sem prazo', pontos: 10 },
      NAO_SEI,
    ],
  },
  { id: 'perfil_ativo', bloco: 'midias', texto: 'Tem perfil ativo em alguma rede social?', peso: 30, opcoes: SIM_NAO },
  { id: 'frequencia', bloco: 'midias', texto: 'Publica pelo menos uma vez por semana?', peso: 25, opcoes: SIM_NAO },
  { id: 'site', bloco: 'midias', texto: 'Tem site profissional?', peso: 25, opcoes: SIM_NAO },
  { id: 'anuncios', bloco: 'midias', texto: 'Faz anúncios pagos?', peso: 20, opcoes: SIM_NAO },
  {
    id: 'origem_contato', bloco: 'relacionamento', texto: 'Como o lead chegou até vocês?', peso: 0,
    opcoes: [
      { id: 'frio', rotulo: 'Contato frio', pontos: 20 },
      { id: 'indicacao', rotulo: 'Indicação', pontos: 5 },
      { id: 'ja_conversamos', rotulo: 'Já conversamos antes', pontos: 0 },
      { id: 'ex_cliente', rotulo: 'Já foi cliente', pontos: 0 },
      NAO_SEI,
    ],
  },
];

export const CONFIG_SCORE_PADRAO = congelar({
  valor: {
    pesos: { porte: 45, capital_social: 40, idade: 15 },
    porte: { 'MICRO EMPRESA': 30, 'EMPRESA DE PEQUENO PORTE': 60, DEMAIS: 100 },
    capital_social_faixas: [[10000, 10], [100000, 30], [500000, 50], [1000000, 70], [5000000, 85], [null, 100]],
    idade_faixas: [[1, 20], [3, 40], [5, 60], [10, 80], [null, 100]],
  },
  probabilidade: { pesos: { icp: 35, qualificacao: 40, midias_sociais: 25 } },
  perfil_ideal: {
    pesos: { setor: 50, porte: 30, idade: 20 },
    setores: [],
    portes: [],
    idade_minima: null,
  },
  esforco: {
    contato_decisor: 35,
    reducao_canais: { telefone_decisor: 100, email_decisor: 60, linkedin_decisor: 40, contato_empresa: 20 },
    sem_nome_decisor: 25,
    reducao_decisor_provavel: 50,
    sem_redes_sociais: 20,
    fora_ufs_atendidas: 20,
    ufs_atendidas: [],
    tentativas: { toleradas: 2, pontos_por_tentativa: 5, maximo: 30 },
  },
  avaliacao: { perguntas: AVALIACAO_PADRAO },
  financeiro: { ticket_por_porte: {}, horas_esforco_zero: null, horas_esforco_maximo: null },
  prioridade: { dias_espera: 2, dias_retomar: 7 },
  reconsulta_dias: 90,
  motivos_descarte: ['Sem orçamento', 'Sem interesse', 'Já tem fornecedor', 'Não conseguimos contato', 'Fora do perfil', 'Outro'],
  situacao_inativa_limite: 10,
  faixas: { alta: 70, media: 40 },
  equivalencia_letras: { A: 100, B: 75, C: 50, D: 25, E: 0 },
});

function congelar(objeto) {
  for (const valor of Object.values(objeto)) {
    if (valor && typeof valor === 'object') congelar(valor);
  }
  return Object.freeze(objeto);
}

const semChaves = (objeto, chaves) =>
  Object.fromEntries(Object.entries(objeto ?? {}).filter(([chave]) => !chaves.includes(chave)));

/**
 * Configuração completa: padrão + o que a organização definiu. Seções, pesos e
 * reduções são mesclados chave a chave; tabelas e listas (porte, faixas,
 * listas, letras, tentativas, perguntas, ticket por porte) são substituídas
 * inteiras quando a organização as define.
 *
 * Chaves anteriores à revisão 7 que ainda estejam gravadas são lidas pelo
 * nome novo (a migração da revisão 7 já as converte no banco).
 */
export function mesclarConfigScore(config = {}) {
  const padrao = CONFIG_SCORE_PADRAO;
  const valorOrg = config.valor ?? {};
  const esforcoOrg = { ...config.esforco };
  if ('sem_numero_decisor' in esforcoOrg && !('contato_decisor' in esforcoOrg)) {
    esforcoOrg.contato_decisor = esforcoOrg.sem_numero_decisor;
  }
  const perfilOrg = { ...config.perfil_ideal };
  if (Array.isArray(valorOrg.cnaes_prioritarios) && !('setores' in perfilOrg)) {
    perfilOrg.setores = valorOrg.cnaes_prioritarios;
  }

  return structuredClone({
    valor: {
      ...padrao.valor,
      ...semChaves(valorOrg, ['cnaes_prioritarios', 'pesos']),
      pesos: { ...padrao.valor.pesos, ...semChaves(valorOrg.pesos, ['cnae']) },
    },
    probabilidade: { pesos: { ...padrao.probabilidade.pesos, ...config.probabilidade?.pesos } },
    perfil_ideal: {
      ...padrao.perfil_ideal,
      ...semChaves(perfilOrg, ['pesos']),
      pesos: { ...padrao.perfil_ideal.pesos, ...perfilOrg.pesos },
    },
    esforco: {
      ...padrao.esforco,
      ...semChaves(esforcoOrg, ['sem_numero_decisor', 'reducao_canais']),
      reducao_canais: { ...padrao.esforco.reducao_canais, ...esforcoOrg.reducao_canais },
    },
    avaliacao: { perguntas: config.avaliacao?.perguntas ?? padrao.avaliacao.perguntas },
    financeiro: { ...padrao.financeiro, ...config.financeiro },
    prioridade: { ...padrao.prioridade, ...config.prioridade },
    reconsulta_dias: config.reconsulta_dias ?? padrao.reconsulta_dias,
    motivos_descarte: config.motivos_descarte ?? padrao.motivos_descarte,
    situacao_inativa_limite: config.situacao_inativa_limite ?? padrao.situacao_inativa_limite,
    faixas: { ...padrao.faixas, ...config.faixas },
    equivalencia_letras: config.equivalencia_letras ?? padrao.equivalencia_letras,
  });
}

// ---------------------------------------------------------------------------
// Validação: cada chave é opcional, mas, se vier, precisa estar correta.
// Chaves desconhecidas são recusadas para um erro de digitação não passar
// despercebido (o score simplesmente ignoraria o valor).
// ---------------------------------------------------------------------------

const erro = (caminho, mensagem) => requisicaoInvalida(`config_score.${caminho}: ${mensagem}`);

function objeto(valor, caminho) {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    throw erro(caminho, 'deve ser um objeto');
  }
  return valor;
}

function somenteChaves(valor, chaves, caminho) {
  for (const chave of Object.keys(valor)) {
    if (!chaves.includes(chave)) throw erro(caminho, `chave desconhecida "${chave}"`);
  }
}

function pontos(valor, caminho) {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > 100) {
    throw erro(caminho, 'deve ser um número entre 0 e 100');
  }
  return valor;
}

function inteiro(valor, caminho, minimo, maximo) {
  if (!Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw erro(caminho, `deve ser um número inteiro de ${minimo} a ${maximo}`);
  }
  return valor;
}

function positivoOuNulo(valor, caminho, maximo) {
  if (valor === null) return null;
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0 || valor > maximo) {
    throw erro(caminho, `deve ser null ou um número maior que 0 e até ${maximo}`);
  }
  return valor;
}

function texto(valor, caminho, maximo) {
  if (typeof valor !== 'string' || valor.trim().length === 0 || valor.trim().length > maximo) {
    throw erro(caminho, `deve ser um texto de 1 a ${maximo} caracteres`);
  }
  return valor.trim().replace(/\s+/g, ' ');
}

function mapaDePontos(valor, caminho, chaves) {
  const resultado = {};
  for (const [chave, valorChave] of Object.entries(objeto(valor, caminho))) {
    if (!chaves.includes(chave)) throw erro(caminho, `chave desconhecida "${chave}"`);
    resultado[chave] = pontos(valorChave, `${caminho}.${chave}`);
  }
  return resultado;
}

const normalizarPorte = (chave) => chave.trim().replace(/\s+/g, ' ').toUpperCase();

function tabela(valor, caminho, { normalizarChave, chaveValida, mensagemChave, maximo, valorItem = pontos, permitirVazio = false }) {
  const entradas = Object.entries(objeto(valor, caminho));
  if (entradas.length === 0 && !permitirVazio) throw erro(caminho, 'não pode ficar vazio');
  if (entradas.length > maximo) throw erro(caminho, `no máximo ${maximo} itens`);
  const resultado = {};
  for (const [chaveOriginal, valorChave] of entradas) {
    const chave = normalizarChave(chaveOriginal);
    if (!chaveValida(chave)) throw erro(caminho, mensagemChave(chaveOriginal));
    if (Object.hasOwn(resultado, chave)) throw erro(caminho, `"${chave}" repetido`);
    resultado[chave] = valorItem(valorChave, `${caminho}.${chave}`);
  }
  return resultado;
}

// [[limite_superior_exclusivo, pontos], ..., [null, pontos]]
function faixas(valor, caminho) {
  if (!Array.isArray(valor) || valor.length === 0 || valor.length > 20) {
    throw erro(caminho, 'deve ser uma lista de 1 a 20 faixas [limite, pontos]');
  }
  let anterior = -Infinity;
  return valor.map((faixa, i) => {
    const ultima = i === valor.length - 1;
    if (!Array.isArray(faixa) || faixa.length !== 2) {
      throw erro(`${caminho}[${i}]`, 'deve ser um par [limite, pontos]');
    }
    const [limite, pontosFaixa] = faixa;
    if (ultima) {
      if (limite !== null) throw erro(caminho, 'a última faixa deve ter limite null (acima do anterior)');
    } else if (typeof limite !== 'number' || !Number.isFinite(limite) || limite <= anterior || limite <= 0) {
      throw erro(`${caminho}[${i}]`, 'os limites devem ser números positivos em ordem crescente');
    }
    anterior = limite ?? anterior;
    return [limite, pontos(pontosFaixa, `${caminho}[${i}]`)];
  });
}

function listaUnica(valor, caminho, { normalizar, valido, mensagem, maximo, minimo = 0 }) {
  if (!Array.isArray(valor) || valor.length > maximo || valor.length < minimo) {
    throw erro(caminho, `deve ser uma lista com ${minimo > 0 ? `de ${minimo} a ` : 'no máximo '}${maximo} itens`);
  }
  const itens = valor.map((item) => (typeof item === 'string' ? normalizar(item) : null));
  itens.forEach((item, i) => {
    if (!valido(item)) throw erro(caminho, mensagem(valor[i]));
  });
  return [...new Set(itens)];
}

const listaDeCnaes = (valor, caminho) =>
  // CNAE com 7 dígitos; aceita com máscara (ex.: 6201-5/01).
  listaUnica(valor, caminho, {
    normalizar: (item) => item.replace(/[\s./-]/g, ''),
    valido: (item) => typeof item === 'string' && /^\d{7}$/.test(item),
    mensagem: (item) => `CNAE inválido: ${JSON.stringify(item)} (use 7 dígitos)`,
    maximo: 200,
  });

const ID_AVALIACAO = /^[a-z0-9_]{1,40}$/;

function pergunta(valor, caminho) {
  objeto(valor, caminho);
  somenteChaves(valor, ['id', 'bloco', 'texto', 'peso', 'opcoes'], caminho);
  if (typeof valor.id !== 'string' || !ID_AVALIACAO.test(valor.id)) {
    throw erro(`${caminho}.id`, 'use de 1 a 40 letras minúsculas, dígitos ou _');
  }
  if (!BLOCOS_AVALIACAO.includes(valor.bloco)) {
    throw erro(`${caminho}.bloco`, `deve ser um de: ${BLOCOS_AVALIACAO.join(', ')}`);
  }
  const peso = valor.bloco === 'relacionamento' && valor.peso === undefined ? 0 : pontos(valor.peso, `${caminho}.peso`);
  if (!Array.isArray(valor.opcoes) || valor.opcoes.length < 2 || valor.opcoes.length > 8) {
    throw erro(`${caminho}.opcoes`, 'deve ter de 2 a 8 opções');
  }
  const ids = new Set();
  const opcoes = valor.opcoes.map((opcao, i) => {
    const caminhoOpcao = `${caminho}.opcoes[${i}]`;
    objeto(opcao, caminhoOpcao);
    somenteChaves(opcao, ['id', 'rotulo', 'pontos'], caminhoOpcao);
    if (typeof opcao.id !== 'string' || !ID_AVALIACAO.test(opcao.id)) {
      throw erro(`${caminhoOpcao}.id`, 'use de 1 a 40 letras minúsculas, dígitos ou _');
    }
    if (ids.has(opcao.id)) throw erro(`${caminho}.opcoes`, `opção "${opcao.id}" repetida`);
    ids.add(opcao.id);
    return {
      id: opcao.id,
      rotulo: texto(opcao.rotulo, `${caminhoOpcao}.rotulo`, 80),
      pontos: opcao.pontos === null ? null : pontos(opcao.pontos, `${caminhoOpcao}.pontos`),
    };
  });
  return { id: valor.id, bloco: valor.bloco, texto: texto(valor.texto, `${caminho}.texto`, 200), peso, opcoes };
}

const validadores = {
  valor(valor, caminho) {
    objeto(valor, caminho);
    somenteChaves(valor, ['pesos', 'porte', 'capital_social_faixas', 'idade_faixas'], caminho);
    const resultado = {};
    if ('pesos' in valor) {
      resultado.pesos = mapaDePontos(valor.pesos, `${caminho}.pesos`, ['porte', 'capital_social', 'idade']);
    }
    if ('porte' in valor) {
      resultado.porte = tabela(valor.porte, `${caminho}.porte`, {
        normalizarChave: normalizarPorte,
        chaveValida: (chave) => chave.length > 0 && chave.length <= 60,
        mensagemChave: () => 'nomes de porte devem ter de 1 a 60 caracteres',
        maximo: 20,
      });
    }
    for (const chave of ['capital_social_faixas', 'idade_faixas']) {
      if (chave in valor) resultado[chave] = faixas(valor[chave], `${caminho}.${chave}`);
    }
    return resultado;
  },

  probabilidade(valor, caminho) {
    objeto(valor, caminho);
    somenteChaves(valor, ['pesos'], caminho);
    if (!('pesos' in valor)) return {};
    return { pesos: mapaDePontos(valor.pesos, `${caminho}.pesos`, ['icp', 'qualificacao', 'midias_sociais']) };
  },

  perfil_ideal(valor, caminho) {
    objeto(valor, caminho);
    somenteChaves(valor, ['pesos', 'setores', 'portes', 'idade_minima'], caminho);
    const resultado = {};
    if ('pesos' in valor) {
      resultado.pesos = mapaDePontos(valor.pesos, `${caminho}.pesos`, ['setor', 'porte', 'idade']);
    }
    if ('setores' in valor) resultado.setores = listaDeCnaes(valor.setores, `${caminho}.setores`);
    if ('portes' in valor) {
      resultado.portes = listaUnica(valor.portes, `${caminho}.portes`, {
        normalizar: normalizarPorte,
        valido: (item) => typeof item === 'string' && item.length > 0 && item.length <= 60,
        mensagem: (item) => `porte inválido: ${JSON.stringify(item)}`,
        maximo: 20,
      });
    }
    if ('idade_minima' in valor) resultado.idade_minima = positivoOuNulo(valor.idade_minima, `${caminho}.idade_minima`, 200);
    return resultado;
  },

  esforco(valor, caminho) {
    const penalidades = ['contato_decisor', 'sem_nome_decisor', 'sem_redes_sociais', 'fora_ufs_atendidas', 'reducao_decisor_provavel'];
    objeto(valor, caminho);
    somenteChaves(valor, [...penalidades, 'reducao_canais', 'ufs_atendidas', 'tentativas'], caminho);
    const resultado = {};
    for (const chave of penalidades) {
      if (chave in valor) resultado[chave] = pontos(valor[chave], `${caminho}.${chave}`);
    }
    if ('reducao_canais' in valor) {
      resultado.reducao_canais = mapaDePontos(valor.reducao_canais, `${caminho}.reducao_canais`, [
        'telefone_decisor', 'email_decisor', 'linkedin_decisor', 'contato_empresa',
      ]);
    }
    if ('ufs_atendidas' in valor) {
      resultado.ufs_atendidas = listaUnica(valor.ufs_atendidas, `${caminho}.ufs_atendidas`, {
        normalizar: (item) => item.trim().toUpperCase(),
        valido: (item) => UFS.includes(item),
        mensagem: (item) => `UF inválida: ${JSON.stringify(item)}`,
        maximo: UFS.length,
      });
    }
    if ('tentativas' in valor) {
      const t = objeto(valor.tentativas, `${caminho}.tentativas`);
      somenteChaves(t, ['toleradas', 'pontos_por_tentativa', 'maximo'], `${caminho}.tentativas`);
      for (const chave of ['toleradas', 'pontos_por_tentativa', 'maximo']) {
        if (!(chave in t)) throw erro(`${caminho}.tentativas`, `falta "${chave}"`);
      }
      resultado.tentativas = {
        toleradas: inteiro(t.toleradas, `${caminho}.tentativas.toleradas`, 0, 100),
        pontos_por_tentativa: inteiro(t.pontos_por_tentativa, `${caminho}.tentativas.pontos_por_tentativa`, 0, 100),
        maximo: inteiro(t.maximo, `${caminho}.tentativas.maximo`, 0, 100),
      };
    }
    return resultado;
  },

  avaliacao(valor, caminho) {
    objeto(valor, caminho);
    somenteChaves(valor, ['perguntas'], caminho);
    if (!('perguntas' in valor)) return {};
    if (!Array.isArray(valor.perguntas) || valor.perguntas.length > 30) {
      throw erro(`${caminho}.perguntas`, 'deve ser uma lista com no máximo 30 perguntas');
    }
    const ids = new Set();
    const perguntas = valor.perguntas.map((item, i) => {
      const resultado = pergunta(item, `${caminho}.perguntas[${i}]`);
      if (ids.has(resultado.id)) throw erro(`${caminho}.perguntas`, `pergunta "${resultado.id}" repetida`);
      ids.add(resultado.id);
      return resultado;
    });
    for (const bloco of ['qualificacao', 'midias']) {
      const doBloco = perguntas.filter((p) => p.bloco === bloco);
      if (doBloco.length > 0 && doBloco.every((p) => p.peso === 0)) {
        throw erro(`${caminho}.perguntas`, `a soma dos pesos do bloco "${bloco}" não pode ser zero`);
      }
    }
    return { perguntas };
  },

  financeiro(valor, caminho) {
    objeto(valor, caminho);
    somenteChaves(valor, ['ticket_por_porte', 'horas_esforco_zero', 'horas_esforco_maximo'], caminho);
    const resultado = {};
    if ('ticket_por_porte' in valor) {
      resultado.ticket_por_porte = tabela(valor.ticket_por_porte, `${caminho}.ticket_por_porte`, {
        normalizarChave: normalizarPorte,
        chaveValida: (chave) => chave.length > 0 && chave.length <= 60,
        mensagemChave: () => 'nomes de porte devem ter de 1 a 60 caracteres',
        maximo: 20,
        permitirVazio: true,
        valorItem: (item, caminhoItem) => {
          if (typeof item !== 'number' || !Number.isFinite(item) || item < 0 || item > 1e12) {
            throw erro(caminhoItem, 'deve ser um valor em reais maior ou igual a 0');
          }
          return item;
        },
      });
    }
    for (const chave of ['horas_esforco_zero', 'horas_esforco_maximo']) {
      if (chave in valor) resultado[chave] = positivoOuNulo(valor[chave], `${caminho}.${chave}`, 10000);
    }
    return resultado;
  },

  prioridade(valor, caminho) {
    objeto(valor, caminho);
    somenteChaves(valor, ['dias_espera', 'dias_retomar'], caminho);
    const resultado = {};
    for (const chave of ['dias_espera', 'dias_retomar']) {
      if (chave in valor) resultado[chave] = inteiro(valor[chave], `${caminho}.${chave}`, 0, 365);
    }
    return resultado;
  },

  reconsulta_dias: (valor, caminho) => inteiro(valor, caminho, 0, 3650),

  motivos_descarte(valor, caminho) {
    return listaUnica(valor, caminho, {
      normalizar: (item) => item.trim().replace(/\s+/g, ' '),
      valido: (item) => typeof item === 'string' && item.length > 0 && item.length <= 60,
      mensagem: (item) => `motivo inválido: ${JSON.stringify(item)} (de 1 a 60 caracteres)`,
      minimo: 1,
      maximo: 20,
    });
  },

  situacao_inativa_limite: (valor, caminho) => pontos(valor, caminho),

  faixas(valor, caminho) {
    return mapaDePontos(valor, caminho, ['alta', 'media']);
  },

  equivalencia_letras(valor, caminho) {
    return tabela(valor, caminho, {
      normalizarChave: (chave) => chave.trim().toUpperCase(),
      chaveValida: (chave) => /^[A-Z]$/.test(chave),
      mensagemChave: (chave) => `"${chave}" não é uma letra de A a Z`,
      maximo: 26,
    });
  },
};

/**
 * Valida o config_score enviado pelo admin e devolve a versão normalizada
 * (só com as chaves enviadas). Também confere regras que dependem do conjunto:
 * pesos de cada pilar não podem somar zero, a faixa alta fica acima da média,
 * os portes citados existem na tabela de porte e as horas estão em ordem.
 */
export function validarConfigScore(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw requisicaoInvalida('O campo "config_score" deve ser um objeto');
  }
  const resultado = {};
  for (const [chave, valor] of Object.entries(config)) {
    // hasOwn: "toString" e afins existem no protótipo e não são chaves válidas.
    if (!Object.hasOwn(validadores, chave)) {
      throw requisicaoInvalida(`config_score: chave desconhecida "${chave}"`);
    }
    resultado[chave] = validadores[chave](valor, chave);
  }

  const completa = mesclarConfigScore(resultado);
  const soma = (pesos) => Object.values(pesos).reduce((total, peso) => total + peso, 0);
  if (soma(completa.valor.pesos) === 0) throw erro('valor.pesos', 'a soma dos pesos não pode ser zero');
  if (soma(completa.probabilidade.pesos) === 0) {
    throw erro('probabilidade.pesos', 'a soma dos pesos não pode ser zero');
  }
  if (soma(completa.perfil_ideal.pesos) === 0) {
    throw erro('perfil_ideal.pesos', 'a soma dos pesos não pode ser zero');
  }
  if (completa.faixas.alta <= completa.faixas.media) {
    throw erro('faixas', '"alta" deve ser maior que "media"');
  }
  const portes = Object.keys(completa.valor.porte);
  for (const porte of completa.perfil_ideal.portes) {
    if (!portes.includes(porte)) throw erro('perfil_ideal.portes', `"${porte}" não está na tabela valor.porte`);
  }
  for (const porte of Object.keys(completa.financeiro.ticket_por_porte)) {
    if (!portes.includes(porte)) throw erro('financeiro.ticket_por_porte', `"${porte}" não está na tabela valor.porte`);
  }
  const { horas_esforco_zero: zero, horas_esforco_maximo: maximo } = completa.financeiro;
  if (zero !== null && maximo !== null && maximo < zero) {
    throw erro('financeiro', '"horas_esforco_maximo" deve ser maior ou igual a "horas_esforco_zero"');
  }
  return resultado;
}
