// Regras da importação (especificação, seção 7) em funções puras:
// sugestão de De-Para, conversão de notas e montagem dos leads de cada linha.

import { cnpjValido, normalizarCnpj } from './cnpj.js';
import { requisicaoInvalida } from './erros.js';
import { extrairRedesSociais } from './redesSociais.js';

// Campos do modelo padrão (seção 4.4), na ordem em que a tela mostra.
export const CAMPOS_IMPORTACAO = [
  { campo: 'cnpj', rotulo: 'CNPJ', obrigatorio: true },
  { campo: 'link_cnpj', rotulo: 'Link - Informações do CNPJ', obrigatorio: false },
  { campo: 'nome_lead', rotulo: 'Nome do Lead', obrigatorio: true },
  { campo: 'nome_decisor', rotulo: 'Nome do Decisor', obrigatorio: false },
  { campo: 'numero_decisor', rotulo: 'Número do Decisor', obrigatorio: false },
  { campo: 'redes_sociais', rotulo: 'Redes Sociais', obrigatorio: false },
  { campo: 'calculadora_icp', rotulo: 'Calculadora - ICP', obrigatorio: false },
  { campo: 'calculadora_midias_sociais', rotulo: 'Calculadora - Mídias Sociais', obrigatorio: false },
  { campo: 'nota_final', rotulo: 'Nota final', obrigatorio: false },
  { campo: 'responsavel_id', rotulo: 'Quem mapeou?', obrigatorio: false },
];

const ROTULO = Object.fromEntries(CAMPOS_IMPORTACAO.map(({ campo, rotulo }) => [campo, rotulo]));

// Cabeçalhos aceitos por campo, já normalizados (sem acento, minúsculos, sem pontuação).
// A ordem dos campos importa: um cabeçalho é sugerido para o primeiro campo que o aceitar.
const SINONIMOS = {
  cnpj: ['cnpj', 'cnpj da empresa', 'numero do cnpj', 'documento'],
  link_cnpj: ['link informacoes do cnpj', 'link do cnpj', 'link cnpj', 'informacoes do cnpj'],
  nome_lead: ['nome do lead', 'lead', 'nome da empresa', 'empresa', 'nome fantasia', 'cliente', 'nome'],
  nome_decisor: ['nome do decisor', 'decisor', 'nome do contato', 'contato'],
  numero_decisor: [
    'numero do decisor', 'telefone do decisor', 'celular do decisor', 'whatsapp do decisor',
    'telefone', 'celular', 'whatsapp', 'numero',
  ],
  redes_sociais: ['redes sociais', 'rede social', 'redes', 'links', 'site', 'instagram'],
  calculadora_icp: ['calculadora icp', 'nota icp', 'icp'],
  calculadora_midias_sociais: [
    'calculadora midias sociais', 'nota midias sociais', 'midias sociais', 'calculadora redes sociais',
  ],
  nota_final: ['nota final', 'nota', 'pontuacao', 'pontuacao final', 'score'],
  responsavel_id: ['quem mapeou', 'mapeado por', 'responsavel', 'vendedor', 'sdr'],
};

// Tamanhos máximos: os mesmos do cadastro manual.
const TAMANHO_MAXIMO = {
  nome_lead: 200, nome_decisor: 150, numero_decisor: 50, link_cnpj: 500, redes_sociais: 2000, responsavel_id: 150,
};
const NOTAS = { calculadora_icp: 'escala_icp_max', calculadora_midias_sociais: 'escala_midias_max', nota_final: 'escala_nota_max' };
const TAMANHO_MAXIMO_EXTRA = 1000;
const MAXIMO_ERROS_GUARDADOS = 1000;

export function normalizarCabecalho(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** { campo: 'Cabeçalho da planilha' | null } para cada campo do modelo. */
export function sugerirMapeamento(colunas) {
  const normalizadas = colunas.map(normalizarCabecalho);
  const usadas = new Set();
  const sugestao = {};
  for (const { campo } of CAMPOS_IMPORTACAO) {
    const indice = normalizadas.findIndex((nome, i) => !usadas.has(i) && SINONIMOS[campo].includes(nome));
    sugestao[campo] = indice === -1 ? null : colunas[indice];
    if (indice !== -1) usadas.add(indice);
  }
  return sugestao;
}

/**
 * Confere o De-Para enviado pelo usuário: campos conhecidos, colunas que
 * existem no arquivo, sem repetir coluna e com cnpj e nome_lead preenchidos.
 * Devolve só os campos mapeados.
 */
export function validarMapeamento(mapeamento, colunas) {
  if (mapeamento === null || typeof mapeamento !== 'object' || Array.isArray(mapeamento)) {
    throw requisicaoInvalida('O mapeamento deve ser um objeto { campo: "coluna da planilha" }');
  }
  const resultado = {};
  const colunasUsadas = new Map();
  for (const [campo, coluna] of Object.entries(mapeamento)) {
    if (!Object.hasOwn(ROTULO, campo)) throw requisicaoInvalida(`Campo desconhecido no mapeamento: "${campo}"`);
    if (coluna === null || coluna === '') continue;
    if (typeof coluna !== 'string' || !colunas.includes(coluna)) {
      throw requisicaoInvalida(`A coluna "${coluna}" (campo ${campo}) não existe na planilha`);
    }
    if (colunasUsadas.has(coluna)) {
      throw requisicaoInvalida(`A coluna "${coluna}" foi usada em ${colunasUsadas.get(coluna)} e ${campo}`);
    }
    colunasUsadas.set(coluna, campo);
    resultado[campo] = coluna;
  }
  for (const { campo, rotulo, obrigatorio } of CAMPOS_IMPORTACAO) {
    if (obrigatorio && !resultado[campo]) throw requisicaoInvalida(`Mapeie a coluna do campo obrigatório "${rotulo}"`);
  }
  return resultado;
}

class ErroLinha extends Error {}

const arredondar = (numero) => Math.round(numero * 100) / 100;

/**
 * "7,5" → 7.5; "1.234,5" → 1234.5; "1,234.5" → 1234.5; "8" → 8.
 * Com ponto e vírgula juntos, o último é o separador decimal.
 */
export function lerNumero(texto) {
  const limpo = String(texto).replace(/\s/g, '');
  if (!/^[-+]?(\d|[.,]\d)[\d.,]*$/.test(limpo)) return NaN;
  const ultimoPonto = limpo.lastIndexOf('.');
  const ultimaVirgula = limpo.lastIndexOf(',');
  let normalizado;
  if (ultimoPonto !== -1 && ultimaVirgula !== -1) {
    const decimal = ultimoPonto > ultimaVirgula ? '.' : ',';
    const milhar = decimal === '.' ? ',' : '.';
    normalizado = limpo.split(milhar).join('').replace(decimal, '.');
  } else if (ultimaVirgula !== -1) {
    // Mais de uma vírgula só faz sentido como separador de milhar.
    normalizado = limpo.indexOf(',') === ultimaVirgula ? limpo.replace(',', '.') : limpo.split(',').join('');
  } else if (ultimoPonto !== -1 && limpo.indexOf('.') !== ultimoPonto) {
    normalizado = limpo.split('.').join('');
  } else {
    normalizado = limpo;
  }
  return Number(normalizado);
}

/**
 * Converte a célula de uma nota para a escala da organização.
 * - número ou texto numérico: usado como está ("7,5" → 7.5);
 * - porcentagem: fração da escala ("75%" com escala 10 → 7.5);
 * - letra: percentual da equivalência configurada ("B" = 75% → 7.5 na escala 10).
 * Letra e porcentagem guardam o texto original. Fora de 0 até a escala: erro.
 */
export function converterNota(valor, escala, letras) {
  let numero;
  let original = null;
  if (typeof valor === 'number') {
    numero = valor;
  } else {
    const texto = String(valor).trim();
    const letra = texto.toUpperCase();
    if (/^[A-Z]$/.test(letra)) {
      if (!Object.hasOwn(letras, letra)) throw new ErroLinha(`letra "${texto}" sem equivalência configurada`);
      numero = arredondar((letras[letra] / 100) * escala);
      original = texto;
    } else if (texto.endsWith('%')) {
      numero = arredondar((lerNumero(texto.slice(0, -1)) / 100) * escala);
      original = texto;
    } else {
      numero = lerNumero(texto);
    }
    if (Number.isNaN(numero)) throw new ErroLinha(`valor "${texto}" não é um número`);
  }
  if (!Number.isFinite(numero) || numero < 0 || numero > escala) {
    throw new ErroLinha(`valor ${String(valor)} fora da escala (0 a ${escala})`);
  }
  return { numero: arredondar(numero), original };
}

function texto(valor, campo) {
  const resultado = String(valor).trim();
  if (resultado.length > TAMANHO_MAXIMO[campo]) {
    throw new ErroLinha(`${ROTULO[campo]} com mais de ${TAMANHO_MAXIMO[campo]} caracteres`);
  }
  return resultado;
}

function chaveExtra(coluna) {
  // "originais" é reservado para o texto original das notas convertidas.
  return coluna.toLowerCase() === 'originais' ? `${coluna} (planilha)` : coluna;
}

/** Monta o lead de uma linha ou lança ErroLinha com o motivo. */
function montarLead(valores, indicePorCampo, extras, opcoes) {
  const valorDo = (campo) => (indicePorCampo[campo] === undefined ? null : valores[indicePorCampo[campo]]);
  const lead = { dados_extras: {}, originais: {}, redes: [] };

  const cnpjBruto = valorDo('cnpj');
  if (cnpjBruto === null) throw new ErroLinha('CNPJ vazio');
  lead.cnpj = normalizarCnpj(cnpjBruto);
  if (!cnpjValido(lead.cnpj)) throw new ErroLinha(`CNPJ inválido: ${cnpjBruto}`);

  if (valorDo('nome_lead') === null) throw new ErroLinha('Nome do Lead vazio');
  lead.nome_lead = texto(valorDo('nome_lead'), 'nome_lead');

  for (const campo of ['link_cnpj', 'nome_decisor', 'numero_decisor', 'redes_sociais']) {
    if (valorDo(campo) !== null) lead[campo] = texto(valorDo(campo), campo);
  }
  if (lead.redes_sociais) lead.redes = extrairRedesSociais(lead.redes_sociais);

  for (const [campo, chaveEscala] of Object.entries(NOTAS)) {
    if (valorDo(campo) === null) continue;
    try {
      const { numero, original } = converterNota(valorDo(campo), opcoes.escalas[chaveEscala], opcoes.letras);
      lead[campo] = numero;
      lead.originais[campo] = original;
    } catch (erro) {
      throw new ErroLinha(`${ROTULO[campo]}: ${erro.message}`);
    }
  }

  if (valorDo('responsavel_id') !== null) {
    lead.responsavel_nome = texto(valorDo('responsavel_id'), 'responsavel_id').replace(/\s+/g, ' ');
  }

  for (const [indice, coluna] of extras) {
    const valor = valores[indice];
    if (valor === null) continue;
    lead.dados_extras[chaveExtra(coluna)] =
      typeof valor === 'string' && valor.length > TAMANHO_MAXIMO_EXTRA ? valor.slice(0, TAMANHO_MAXIMO_EXTRA) : valor;
  }
  return lead;
}

/**
 * Transforma as linhas da planilha em leads prontos para gravar.
 * - linha inválida vira erro { linha, motivo } e não derruba as outras;
 * - CNPJ repetido: a última ocorrência prevalece, as anteriores viram erro;
 * - célula vazia simplesmente não entra no lead (não apaga valor existente).
 * opcoes: { escalas: { escala_icp_max, ... }, letras: { A: 100, ... } }
 */
export function montarLeads({ colunas, linhas }, mapeamento, opcoes) {
  const indicePorCampo = Object.fromEntries(
    Object.entries(mapeamento).map(([campo, coluna]) => [campo, colunas.indexOf(coluna)]),
  );
  const mapeadas = new Set(Object.values(indicePorCampo));
  const extras = colunas.map((coluna, indice) => [indice, coluna]).filter(([indice]) => !mapeadas.has(indice));

  const erros = [];
  const validos = [];
  for (const { numero, valores } of linhas) {
    try {
      validos.push({ numero, lead: montarLead(valores, indicePorCampo, extras, opcoes) });
    } catch (erro) {
      if (!(erro instanceof ErroLinha)) throw erro;
      erros.push({ linha: numero, motivo: erro.message });
    }
  }

  const ultimaLinhaDoCnpj = new Map(validos.map(({ numero, lead }) => [lead.cnpj, numero]));
  const leads = [];
  for (const { numero, lead } of validos) {
    const ultima = ultimaLinhaDoCnpj.get(lead.cnpj);
    if (numero === ultima) leads.push(lead);
    else erros.push({ linha: numero, motivo: `CNPJ duplicado na planilha (prevalece a linha ${ultima})` });
  }

  erros.sort((a, b) => a.linha - b.linha);
  return { leads, erros, ignorados: erros.length };
}

/** Limita a lista guardada no histórico; o total continua em "ignorados". */
export function resumirErros(erros) {
  if (erros.length <= MAXIMO_ERROS_GUARDADOS) return erros;
  return [
    ...erros.slice(0, MAXIMO_ERROS_GUARDADOS),
    { linha: null, motivo: `Mais ${erros.length - MAXIMO_ERROS_GUARDADOS} linhas com erro não listadas` },
  ];
}
