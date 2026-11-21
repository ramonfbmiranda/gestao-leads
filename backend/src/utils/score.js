// Score de compensação (especificação, seção 8). Funções puras: recebem o lead
// e a organização, não acessam o banco e não dependem do relógio (a data de
// referência é um parâmetro), então todo caso é testável.
//
// Regra central: dado que falta é N/A (null), nunca um número inventado.

import { mesclarConfigScore } from './configScore.js';
import { decisorProvavel } from './socios.js';

export const VERSAO_SCORE = 2;

const ROTULOS = {
  porte: 'Porte',
  capital_social: 'Capital social',
  idade: 'Idade da empresa',
  setor: 'Setor (CNAE principal)',
  icp: 'Encaixe no perfil ideal',
  qualificacao: 'Qualificação',
  midias_sociais: 'Mídias sociais',
  contato_decisor: 'Contato do decisor',
  sem_nome_decisor: 'Sem nome do decisor',
  sem_redes_sociais: 'Sem redes sociais nem site',
  fora_ufs_atendidas: 'UF fora das atendidas',
  tentativas_sem_resposta: 'Tentativas sem resposta',
};

const CANAIS = {
  telefone_decisor: 'telefone do decisor',
  email_decisor: 'e-mail do decisor',
  linkedin_decisor: 'LinkedIn do decisor',
  contato_empresa: 'contato da empresa pela Receita',
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

const porteDoLead = (lead) => (vazio(lead.porte) ? null : normalizarRotulo(lead.porte));
const anosDoLead = (lead, referencia) => (vazio(lead.data_abertura) ? null : idadeEmAnos(lead.data_abertura, referencia));

// Descritor de fator: disponível { pontos, valor_bruto, origem?, itens? },
// N/A { na: motivo }, desligado pela organização { desligado: motivo }.
// `motivos` em um fator disponível registra N/A internos (ex.: pergunta sem
// resposta) que tornam o score parcial sem derrubar o fator.

function fatoresDoValor(lead, config, referencia) {
  const { valor } = config;
  const porte = porteDoLead(lead);
  const tabelaPorte = Object.fromEntries(Object.entries(valor.porte).map(([chave, pontos]) => [normalizarRotulo(chave), pontos]));
  const anos = anosDoLead(lead, referencia);

  return {
    porte:
      porte === null
        ? { na: 'Porte desconhecido' }
        : Object.hasOwn(tabelaPorte, porte)
          ? { pontos: tabelaPorte[porte], valor_bruto: lead.porte, origem: 'sistema' }
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
            origem: 'sistema',
          },
    idade:
      anos === null
        ? { na: 'Data de abertura desconhecida' }
        : { pontos: pontosDaFaixa(anos, valor.idade_faixas), valor_bruto: arredondar(anos), origem: 'sistema' },
  };
}

/** Encaixe no perfil ideal (seção 8.7). `configurado` = algum critério ligado. */
export function calcularPerfilIdeal(lead, config, referencia) {
  const perfil = config.perfil_ideal;
  const porte = porteDoLead(lead);
  const anos = anosDoLead(lead, referencia);
  const cnae = vazio(lead.cnae_principal) ? null : String(lead.cnae_principal).replace(/\D/g, '');
  const portes = perfil.portes.map(normalizarRotulo);

  const criterios = {
    setor:
      perfil.setores.length === 0
        ? { desligado: 'Nenhum setor configurado no perfil ideal' }
        : cnae === null
          ? { na: 'CNAE principal desconhecido' }
          : { pontos: perfil.setores.includes(cnae) ? 100 : 0, valor_bruto: String(lead.cnae_principal) },
    porte:
      portes.length === 0
        ? { desligado: 'Nenhum porte configurado no perfil ideal' }
        : porte === null
          ? { na: 'Porte desconhecido' }
          : { pontos: portes.includes(porte) ? 100 : 0, valor_bruto: lead.porte },
    idade:
      perfil.idade_minima === null
        ? { desligado: 'Sem idade mínima no perfil ideal' }
        : anos === null
          ? { na: 'Data de abertura desconhecida' }
          : { pontos: arredondar(Math.min(100, (anos / perfil.idade_minima) * 100)), valor_bruto: arredondar(anos) },
  };
  const configurado = Object.entries(criterios).some(([nome, c]) => !c.desligado && (perfil.pesos[nome] ?? 0) > 0);
  return { configurado, ...calcularPilar(criterios, perfil.pesos) };
}

function nota(valorBruto, escala, rotulo) {
  if (vazio(valorBruto)) return { na: `${rotulo} sem nota` };
  const numero = Number(valorBruto);
  // Acima da escala (a organização pode ter reduzido a escala depois): limita a 100.
  return { pontos: arredondar(limitar((numero / escala) * 100, 0, 100)), valor_bruto: numero, origem: 'planilha' };
}

/** Respostas de um bloco da avaliação: [{ id, rotulo, resposta, pontos, peso }]. */
function itensDoBloco(lead, perguntas, bloco) {
  const respostas = lead.avaliacao?.respostas ?? {};
  return perguntas
    .filter((pergunta) => pergunta.bloco === bloco)
    .map((pergunta) => {
      const idOpcao = respostas[pergunta.id];
      const opcao = idOpcao == null ? null : pergunta.opcoes.find((o) => o.id === idOpcao) ?? null;
      return {
        id: pergunta.id,
        rotulo: pergunta.texto,
        resposta: opcao?.rotulo ?? null,
        pontos: opcao ? opcao.pontos : null,
        peso: pergunta.peso,
      };
    });
}

/** Média ponderada das respostas de um bloco; null se nenhuma tiver pontos. */
function notaDoBloco(itens) {
  const validos = itens.filter((item) => item.pontos !== null && item.peso > 0);
  const somaPesos = validos.reduce((soma, item) => soma + item.peso, 0);
  if (somaPesos === 0) return null;
  return arredondar(validos.reduce((soma, item) => soma + item.pontos * (item.peso / somaPesos), 0));
}

function fatorDoBloco(itens, rotuloBloco) {
  const pontosBloco = notaDoBloco(itens);
  if (pontosBloco === null) return null;
  const semResposta = itens.filter((item) => item.pontos === null && item.peso > 0).length;
  return {
    pontos: pontosBloco,
    origem: 'avaliacao',
    itens,
    motivos: semResposta > 0 ? [`${rotuloBloco}: ${semResposta} pergunta(s) sem resposta`] : [],
  };
}

function fatoresDaProbabilidade(lead, organizacao, config, referencia) {
  const perguntas = config.avaliacao.perguntas;

  // ICP: o perfil ideal (sistema) prevalece; sem ele, a nota da planilha.
  const perfil = calcularPerfilIdeal(lead, config, referencia);
  let icp;
  if (perfil.configurado && perfil.valor !== null) {
    icp = {
      pontos: perfil.valor,
      origem: 'sistema',
      itens: perfil.fatores.map((f) => ({ id: f.fator, rotulo: f.rotulo, pontos: f.pontos, peso: f.peso, situacao: f.situacao, valor_bruto: f.valor_bruto ?? null })),
      motivos: perfil.fatores.filter((f) => f.situacao === 'na').map((f) => `Perfil ideal: ${f.motivo}`),
    };
  } else {
    icp = nota(lead.calculadora_icp, Number(organizacao.escala_icp_max), 'Calculadora ICP');
    if (icp.na && perfil.configurado) icp = { na: 'Sem dados da Receita para o perfil ideal e sem nota de ICP' };
  }

  const itensQualificacao = itensDoBloco(lead, perguntas, 'qualificacao');
  const qualificacao =
    itensQualificacao.length === 0
      ? { desligado: 'Nenhuma pergunta de qualificação configurada' }
      : fatorDoBloco(itensQualificacao, 'Qualificação') ?? { na: 'Lead ainda não avaliado (qualificação)' };

  // Mídias: o checklist da avaliação prevalece; sem resposta, a nota da planilha.
  const midias =
    fatorDoBloco(itensDoBloco(lead, perguntas, 'midias'), 'Mídias') ??
    nota(lead.calculadora_midias_sociais, Number(organizacao.escala_midias_max), 'Mídias sociais');

  return { icp, qualificacao, midias_sociais: midias };
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
      ...(fator.origem ? { origem: fator.origem } : {}),
      valor_bruto: fator.valor_bruto ?? null,
      pontos: fator.pontos,
      peso_efetivo: arredondar(pesoEfetivo * 100),
      contribuicao: arredondar(fator.pontos * pesoEfetivo),
      ...(fator.itens ? { itens: fator.itens } : {}),
    };
  });

  const motivosInternos = disponiveis.flatMap(([, fator]) => fator.motivos ?? []);
  const valor =
    disponiveis.length === 0
      ? null
      : arredondar(disponiveis.reduce((soma, [nome, fator]) => soma + fator.pontos * (pesos[nome] / somaPesos), 0));
  return {
    valor,
    parcial: disponiveis.length < contaveis.length || motivosInternos.length > 0,
    fatores: detalhes,
    motivos_internos: motivosInternos,
  };
}

/** Lead com presença digital: algum link separado ou um "@perfil" no texto original. */
function temRedesSociais(lead) {
  if ((lead.quantidade_redes ?? 0) > 0) return true;
  return /@[a-z0-9._]{2,}/i.test(lead.redes_sociais ?? '');
}

function penalidade(nome, rotulo, maximo, pontos, extras = {}) {
  const situacao = extras.situacao ?? (maximo === 0 ? 'desligado' : pontos > 0 ? 'aplicada' : 'ok');
  return {
    penalidade: nome,
    rotulo,
    pontos: situacao === 'aplicada' ? arredondar(pontos) : 0,
    maximo,
    situacao,
    aplicada: situacao === 'aplicada',
    ...(extras.motivo ? { motivo: extras.motivo } : {}),
    ...(extras.detalhe ? { detalhe: extras.detalhe } : {}),
  };
}

/** Soma das penalidades, limitada a 100 (seção 8.3). */
export function calcularEsforco(lead, config) {
  const { esforco } = config;
  const penalidades = [];

  // Contato do decisor: o melhor canal disponível reduz a penalidade.
  const canais = [
    !vazio(lead.numero_decisor) && 'telefone_decisor',
    !vazio(lead.email_decisor) && 'email_decisor',
    !vazio(lead.linkedin_decisor) && 'linkedin_decisor',
    (!vazio(lead.telefone_receita) || !vazio(lead.email_receita)) && 'contato_empresa',
  ].filter(Boolean);
  const melhor = canais.reduce(
    (atual, canal) => (atual === null || esforco.reducao_canais[canal] > esforco.reducao_canais[atual] ? canal : atual),
    null,
  );
  const reducaoContato = melhor ? esforco.reducao_canais[melhor] : 0;
  penalidades.push(
    penalidade('contato_decisor', ROTULOS.contato_decisor, esforco.contato_decisor, esforco.contato_decisor * (1 - reducaoContato / 100), {
      detalhe: melhor ? `Melhor canal: ${CANAIS[melhor]} (−${reducaoContato}%)` : 'Nenhum canal de contato',
    }),
  );

  // Nome do decisor: o decisor provável da Receita reduz a penalidade.
  if (vazio(lead.nome_decisor)) {
    const provavel = decisorProvavel(lead.socios);
    const reducao = provavel ? esforco.reducao_decisor_provavel : 0;
    penalidades.push(
      penalidade('sem_nome_decisor', ROTULOS.sem_nome_decisor, esforco.sem_nome_decisor, esforco.sem_nome_decisor * (1 - reducao / 100), {
        detalhe: provavel ? `Decisor provável pela Receita: ${provavel.nome} (−${reducao}%)` : null,
      }),
    );
  } else {
    penalidades.push(penalidade('sem_nome_decisor', ROTULOS.sem_nome_decisor, esforco.sem_nome_decisor, 0));
  }

  penalidades.push(
    penalidade('sem_redes_sociais', ROTULOS.sem_redes_sociais, esforco.sem_redes_sociais, temRedesSociais(lead) ? 0 : esforco.sem_redes_sociais),
  );

  const ufs = esforco.ufs_atendidas;
  const uf = vazio(lead.uf) ? null : String(lead.uf).toUpperCase();
  if (ufs.length === 0) {
    penalidades.push(penalidade('fora_ufs_atendidas', ROTULOS.fora_ufs_atendidas, esforco.fora_ufs_atendidas, 0, { situacao: 'desligado', motivo: 'Nenhuma UF atendida configurada' }));
  } else if (uf === null) {
    penalidades.push(penalidade('fora_ufs_atendidas', ROTULOS.fora_ufs_atendidas, esforco.fora_ufs_atendidas, 0, { situacao: 'na', motivo: 'UF desconhecida' }));
  } else {
    penalidades.push(penalidade('fora_ufs_atendidas', ROTULOS.fora_ufs_atendidas, esforco.fora_ufs_atendidas, ufs.includes(uf) ? 0 : esforco.fora_ufs_atendidas));
  }

  // Bloco "relacionamento" da avaliação: cada resposta soma os seus pontos.
  for (const item of itensDoBloco(lead, config.avaliacao.perguntas, 'relacionamento')) {
    const pergunta = config.avaliacao.perguntas.find((p) => p.id === item.id);
    const maximo = Math.max(0, ...pergunta.opcoes.map((o) => o.pontos ?? 0));
    penalidades.push(
      item.pontos === null
        ? penalidade(`relacionamento:${item.id}`, item.rotulo, maximo, 0, { situacao: maximo === 0 ? 'desligado' : 'na', motivo: `Relacionamento: "${item.rotulo}" sem resposta` })
        : penalidade(`relacionamento:${item.id}`, item.rotulo, maximo, item.pontos, { detalhe: item.resposta }),
    );
  }

  const { toleradas, pontos_por_tentativa: porTentativa, maximo } = esforco.tentativas;
  const tentativas = Number(lead.tentativas_sem_resposta ?? 0);
  penalidades.push(
    penalidade('tentativas_sem_resposta', ROTULOS.tentativas_sem_resposta, porTentativa === 0 ? 0 : maximo,
      Math.min(maximo, Math.max(0, tentativas - toleradas) * porTentativa), {
        detalhe: tentativas > 0 ? `${tentativas} tentativa(s) seguida(s) sem resposta` : null,
      }),
  );

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

/** Pilares, fórmula e limite da situação cadastral, sem as saídas complementares. */
function calcularNucleo(lead, organizacao, config, referencia) {
  const valor = calcularPilar(fatoresDoValor(lead, config, referencia), config.valor.pesos);
  const probabilidade = calcularPilar(fatoresDaProbabilidade(lead, organizacao, config, referencia), config.probabilidade.pesos);
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
  return { valor, probabilidade, esforco, formula, compensacao, compensacaoSemLimite, limiteSituacao, situacaoConhecida: situacao !== null };
}

/** Quantos itens do cálculo tinham dado (seção 8.9). Desligados não contam. */
function calcularConfianca(nucleo) {
  const itens = [
    ...nucleo.valor.fatores.map((f) => f.situacao),
    ...nucleo.probabilidade.fatores.map((f) => f.situacao),
    ...nucleo.esforco.penalidades.map((p) => p.situacao),
  ].filter((situacao) => situacao !== 'desligado');
  const total = itens.length + 1; // + situação cadastral
  const comDado = itens.filter((situacao) => situacao !== 'na').length + (nucleo.situacaoConhecida ? 1 : 0);
  return { valor: arredondar((comDado / total) * 100), com_dado: comDado, total };
}

const MAXIMO_SUGESTOES = 5;

/** O que fazer para aumentar a compensação (seção 8.9). */
function calcularSugestoes(lead, organizacao, config, referencia, nucleo) {
  const penalidadeAplicada = (nome) => nucleo.esforco.penalidades.find((p) => p.penalidade === nome && p.aplicada);
  const simulaveis = [];
  const simular = (acao, rotulo, mudanca) => {
    if (nucleo.compensacao === null) return;
    const simulado = calcularNucleo({ ...lead, ...mudanca }, organizacao, config, referencia);
    if (simulado.compensacao === null) return;
    const ganho = arredondar(simulado.compensacao - nucleo.compensacao);
    if (ganho <= 0) return;
    simulaveis.push({
      acao,
      rotulo,
      compensacao_simulada: simulado.compensacao,
      faixa_simulada: faixaDoScore(simulado.compensacao, config.faixas),
      ganho,
    });
  };

  if (penalidadeAplicada('contato_decisor')) simular('telefone_decisor', 'Conseguir o telefone do decisor', { numero_decisor: '0' });
  if (penalidadeAplicada('sem_nome_decisor')) {
    const provavel = decisorProvavel(lead.socios);
    if (provavel) simular('usar_decisor_provavel', `Confirmar ${provavel.nome} como decisor`, { nome_decisor: provavel.nome });
    else simular('nome_decisor', 'Descobrir o nome do decisor', { nome_decisor: '-' });
  }
  if (penalidadeAplicada('sem_redes_sociais')) simular('redes_sociais', 'Cadastrar redes sociais ou site', { quantidade_redes: 1 });
  simulaveis.sort((a, b) => b.ganho - a.ganho);

  const fatorNa = (pilar, nome) => nucleo[pilar].fatores.some((f) => f.fator === nome && f.situacao === 'na');
  const semGanho = (acao, rotulo) => ({ acao, rotulo, compensacao_simulada: null, faixa_simulada: null, ganho: null });
  const completar = [];
  if (fatorNa('probabilidade', 'qualificacao')) completar.push(semGanho('avaliar_qualificacao', 'Responder a qualificação do lead'));
  if (fatorNa('probabilidade', 'midias_sociais') && config.avaliacao.perguntas.some((p) => p.bloco === 'midias')) {
    completar.push(semGanho('avaliar_midias', 'Responder o checklist de mídias'));
  }
  if (nucleo.esforco.penalidades.some((p) => p.penalidade.startsWith('relacionamento:') && p.situacao === 'na')) {
    completar.push(semGanho('avaliar_relacionamento', 'Informar como o lead chegou até vocês'));
  }
  if (vazio(lead.enriquecido_em)) completar.push(semGanho('enriquecer', 'Buscar os dados da Receita'));

  return [...simulaveis, ...completar].slice(0, MAXIMO_SUGESTOES);
}

/**
 * Estimativa em reais (seção 8.9). `taxasConversao`: { <faixa>: { convertidos,
 * descartados } } da organização; com 20 ou mais desfechos na faixa do lead, a
 * taxa observada substitui o índice de probabilidade.
 */
function calcularFinanceiro(lead, config, nucleo, faixa, taxasConversao) {
  const vazioFinanceiro = { ticket: null, origem_ticket: null, chance: null, origem_chance: null, valor_esperado: null, horas: null, valor_por_hora: null };
  const porte = porteDoLead(lead);
  const ticketPorPorte = Object.fromEntries(Object.entries(config.financeiro.ticket_por_porte).map(([chave, valor]) => [normalizarRotulo(chave), valor]));

  let ticket = null;
  let origemTicket = null;
  if (!vazio(lead.ticket_estimado)) {
    ticket = Number(lead.ticket_estimado);
    origemTicket = 'lead';
  } else if (porte !== null && Object.hasOwn(ticketPorPorte, porte)) {
    ticket = ticketPorPorte[porte];
    origemTicket = 'porte';
  }
  if (ticket === null) {
    return { ...vazioFinanceiro, motivo: 'Sem ticket: informe na avaliação ou configure o ticket por porte' };
  }

  const historico = taxasConversao?.[faixa];
  const desfechos = historico ? historico.convertidos + historico.descartados : 0;
  let chance = null;
  let origemChance = null;
  if (desfechos >= 20) {
    chance = historico.convertidos / desfechos;
    origemChance = 'historico';
  } else if (nucleo.probabilidade.valor !== null) {
    chance = nucleo.probabilidade.valor / 100;
    origemChance = 'indice';
  }
  if (chance === null) {
    return { ...vazioFinanceiro, ticket, origem_ticket: origemTicket, motivo: 'Sem chance de fechar calculável (probabilidade N/A)' };
  }

  const valorEsperado = arredondar(ticket * chance);
  const { horas_esforco_zero: horasZero, horas_esforco_maximo: horasMaximo } = config.financeiro;
  const horas = horasZero !== null && horasMaximo !== null
    ? arredondar(horasZero + (horasMaximo - horasZero) * (nucleo.esforco.valor / 100))
    : null;
  return {
    ticket,
    origem_ticket: origemTicket,
    chance: Math.round(chance * 10000) / 10000,
    origem_chance: origemChance,
    valor_esperado: valorEsperado,
    horas,
    valor_por_hora: horas ? arredondar(valorEsperado / horas) : null,
  };
}

/**
 * Calcula o score completo de um lead.
 * lead: colunas do lead + quantidade_redes (links em lead_redes_sociais).
 * organizacao: escalas, config_score e updated_at.
 * opções: referencia (data do cálculo) e taxasConversao (seção 8.9).
 * Devolve as colunas de score prontas para gravar.
 */
export function calcularScore(lead, organizacao, { referencia = new Date(), taxasConversao = null } = {}) {
  const config = mesclarConfigScore(organizacao.config_score ?? {});
  const nucleo = calcularNucleo(lead, organizacao, config, referencia);
  const { valor, probabilidade, esforco, compensacao } = nucleo;
  const faixa = faixaDoScore(compensacao, config.faixas);
  const confianca = calcularConfianca(nucleo);

  const motivosParcial = [
    ...valor.fatores.filter((f) => f.situacao === 'na').map((f) => f.motivo),
    ...valor.motivos_internos,
    ...probabilidade.fatores.filter((f) => f.situacao === 'na').map((f) => f.motivo),
    ...probabilidade.motivos_internos,
    ...esforco.penalidades.filter((p) => p.situacao === 'na').map((p) => p.motivo),
    ...(nucleo.situacaoConhecida ? [] : ['Situação cadastral desconhecida']),
  ];

  const semInternos = ({ motivos_internos: _ignorado, ...pilar }) => pilar;
  return {
    score_valor: valor.valor,
    score_probabilidade: probabilidade.valor,
    score_esforco: esforco.valor,
    score_compensacao: compensacao,
    score_confianca: confianca.valor,
    score_parcial: motivosParcial.length > 0,
    score_detalhes: {
      versao: VERSAO_SCORE,
      config_em: organizacao.updated_at ?? null,
      formula: nucleo.formula,
      faixa,
      compensacao_sem_limite: nucleo.compensacaoSemLimite,
      limite_situacao: nucleo.limiteSituacao,
      motivos_parcial: motivosParcial,
      confianca,
      valor: semInternos(valor),
      probabilidade: semInternos(probabilidade),
      esforco,
      sugestoes: calcularSugestoes(lead, organizacao, config, referencia, nucleo),
      financeiro: calcularFinanceiro(lead, config, nucleo, faixa, taxasConversao),
    },
  };
}
