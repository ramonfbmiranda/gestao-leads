// Configuração do score por organização (especificação, seção 8.6).
// A organização guarda só o que mudou em relação ao padrão; o motor do score
// usa mesclarConfigScore() para obter a configuração completa.

import { requisicaoInvalida } from './erros.js';

export const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

export const CONFIG_SCORE_PADRAO = congelar({
  valor: {
    pesos: { porte: 40, capital_social: 35, idade: 15, cnae: 10 },
    porte: { 'MICRO EMPRESA': 30, 'EMPRESA DE PEQUENO PORTE': 60, DEMAIS: 100 },
    capital_social_faixas: [[10000, 10], [100000, 30], [500000, 50], [1000000, 70], [5000000, 85], [null, 100]],
    idade_faixas: [[1, 20], [3, 40], [5, 60], [10, 80], [null, 100]],
    cnaes_prioritarios: [],
  },
  probabilidade: { pesos: { icp: 65, midias_sociais: 35 } },
  esforco: {
    sem_numero_decisor: 35,
    sem_nome_decisor: 25,
    sem_redes_sociais: 20,
    fora_ufs_atendidas: 20,
    ufs_atendidas: [],
  },
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

/**
 * Configuração completa: padrão + o que a organização definiu. Seções e pesos
 * são mesclados chave a chave; tabelas (porte, faixas, listas, letras) são
 * substituídas inteiras quando a organização as define.
 */
export function mesclarConfigScore(config = {}) {
  const padrao = CONFIG_SCORE_PADRAO;
  return structuredClone({
    valor: {
      ...padrao.valor,
      ...config.valor,
      pesos: { ...padrao.valor.pesos, ...config.valor?.pesos },
    },
    probabilidade: { pesos: { ...padrao.probabilidade.pesos, ...config.probabilidade?.pesos } },
    esforco: { ...padrao.esforco, ...config.esforco },
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

function mapaDePontos(valor, caminho, chaves) {
  const resultado = {};
  for (const [chave, valorChave] of Object.entries(objeto(valor, caminho))) {
    if (!chaves.includes(chave)) throw erro(caminho, `chave desconhecida "${chave}"`);
    resultado[chave] = pontos(valorChave, `${caminho}.${chave}`);
  }
  return resultado;
}

function tabela(valor, caminho, { normalizarChave, chaveValida, mensagemChave, maximo }) {
  const entradas = Object.entries(objeto(valor, caminho));
  if (entradas.length === 0) throw erro(caminho, 'não pode ficar vazio');
  if (entradas.length > maximo) throw erro(caminho, `no máximo ${maximo} itens`);
  const resultado = {};
  for (const [chaveOriginal, valorChave] of entradas) {
    const chave = normalizarChave(chaveOriginal);
    if (!chaveValida(chave)) throw erro(caminho, mensagemChave(chaveOriginal));
    if (Object.hasOwn(resultado, chave)) throw erro(caminho, `"${chave}" repetido`);
    resultado[chave] = pontos(valorChave, `${caminho}.${chave}`);
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

function listaUnica(valor, caminho, { normalizar, valido, mensagem, maximo }) {
  if (!Array.isArray(valor) || valor.length > maximo) {
    throw erro(caminho, `deve ser uma lista com no máximo ${maximo} itens`);
  }
  const itens = valor.map((item) => (typeof item === 'string' ? normalizar(item) : null));
  itens.forEach((item, i) => {
    if (!valido(item)) throw erro(caminho, mensagem(valor[i]));
  });
  return [...new Set(itens)];
}

const validadores = {
  valor(valor, caminho) {
    objeto(valor, caminho);
    somenteChaves(valor, ['pesos', 'porte', 'capital_social_faixas', 'idade_faixas', 'cnaes_prioritarios'], caminho);
    const resultado = {};
    if ('pesos' in valor) {
      resultado.pesos = mapaDePontos(valor.pesos, `${caminho}.pesos`, ['porte', 'capital_social', 'idade', 'cnae']);
    }
    if ('porte' in valor) {
      resultado.porte = tabela(valor.porte, `${caminho}.porte`, {
        normalizarChave: (chave) => chave.trim().replace(/\s+/g, ' ').toUpperCase(),
        chaveValida: (chave) => chave.length > 0 && chave.length <= 60,
        mensagemChave: () => 'nomes de porte devem ter de 1 a 60 caracteres',
        maximo: 20,
      });
    }
    for (const chave of ['capital_social_faixas', 'idade_faixas']) {
      if (chave in valor) resultado[chave] = faixas(valor[chave], `${caminho}.${chave}`);
    }
    if ('cnaes_prioritarios' in valor) {
      // CNAE com 7 dígitos; aceita com máscara (ex.: 6201-5/01).
      resultado.cnaes_prioritarios = listaUnica(valor.cnaes_prioritarios, `${caminho}.cnaes_prioritarios`, {
        normalizar: (item) => item.replace(/[\s./-]/g, ''),
        valido: (item) => typeof item === 'string' && /^\d{7}$/.test(item),
        mensagem: (item) => `CNAE inválido: ${JSON.stringify(item)} (use 7 dígitos)`,
        maximo: 200,
      });
    }
    return resultado;
  },

  probabilidade(valor, caminho) {
    objeto(valor, caminho);
    somenteChaves(valor, ['pesos'], caminho);
    if (!('pesos' in valor)) return {};
    return { pesos: mapaDePontos(valor.pesos, `${caminho}.pesos`, ['icp', 'midias_sociais']) };
  },

  esforco(valor, caminho) {
    const penalidades = ['sem_numero_decisor', 'sem_nome_decisor', 'sem_redes_sociais', 'fora_ufs_atendidas'];
    objeto(valor, caminho);
    somenteChaves(valor, [...penalidades, 'ufs_atendidas'], caminho);
    const resultado = {};
    for (const chave of penalidades) {
      if (chave in valor) resultado[chave] = pontos(valor[chave], `${caminho}.${chave}`);
    }
    if ('ufs_atendidas' in valor) {
      resultado.ufs_atendidas = listaUnica(valor.ufs_atendidas, `${caminho}.ufs_atendidas`, {
        normalizar: (item) => item.trim().toUpperCase(),
        valido: (item) => UFS.includes(item),
        mensagem: (item) => `UF inválida: ${JSON.stringify(item)}`,
        maximo: UFS.length,
      });
    }
    return resultado;
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
 * pesos de cada pilar não podem somar zero e a faixa alta fica acima da média.
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
  if (completa.faixas.alta <= completa.faixas.media) {
    throw erro('faixas', '"alta" deve ser maior que "media"');
  }
  return resultado;
}
