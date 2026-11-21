// Leitura de planilhas .xlsx e .csv (primeira aba) com SheetJS.
// Devolve os cabeçalhos e as linhas com valores já simplificados:
// texto, número ou null. Nada é gravado aqui.

import * as XLSX from 'xlsx';
import { requisicaoInvalida } from './erros.js';

export const LIMITE_LINHAS = 20000;
export const LIMITE_COLUNAS = 200;

function decodificarTexto(buffer) {
  // CSV exportado pelo Excel em português costuma vir em Windows-1252, não UTF-8.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function dataIso(serial) {
  const data = XLSX.SSF.parse_date_code(serial);
  if (!data) return null;
  const doisDigitos = (n) => String(n).padStart(2, '0');
  return `${data.y}-${doisDigitos(data.m)}-${doisDigitos(data.d)}`;
}

/**
 * Converte uma célula do SheetJS em texto, número ou null.
 * Número com formato de porcentagem vira texto "75%" (a célula guarda 0,75),
 * para a conversão de notas tratar igual ao CSV. Datas viram "AAAA-MM-DD".
 */
export function valorDaCelula(celula) {
  if (!celula || celula.v === undefined || celula.v === null) return null;
  switch (celula.t) {
    case 's': {
      const texto = String(celula.v).trim();
      return texto === '' ? null : texto;
    }
    case 'n':
      if (celula.z && XLSX.SSF.is_date(celula.z)) return dataIso(celula.v);
      if (celula.z && String(celula.z).includes('%')) return `${Number((celula.v * 100).toFixed(6))}%`;
      return celula.v;
    case 'b':
      return celula.v ? 'VERDADEIRO' : 'FALSO';
    case 'd':
      return celula.v instanceof Date ? celula.v.toISOString().slice(0, 10) : String(celula.v);
    default:
      // 'e' (erro como #N/D) e 'z' (vazia)
      return null;
  }
}

function abrirPasta(buffer, nomeArquivo) {
  const nome = (nomeArquivo ?? '').toLowerCase();
  // Uma linha a mais que o limite, para detectar quando ele é ultrapassado.
  const opcoes = { dense: true, sheets: 0, sheetRows: LIMITE_LINHAS + 2 };

  if (nome.endsWith('.xlsx')) {
    // Todo .xlsx é um arquivo zip, que começa com "PK".
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw requisicaoInvalida('Arquivo .xlsx inválido');
    }
    // cellNF: guarda o formato de cada célula (porcentagem e data dependem dele).
    return XLSX.read(buffer, { ...opcoes, type: 'buffer', cellNF: true });
  }
  if (nome.endsWith('.csv')) {
    // raw: mantém tudo como texto (zeros à esquerda do CNPJ, "7,5", "75%").
    return XLSX.read(decodificarTexto(buffer), { ...opcoes, type: 'string', raw: true });
  }
  throw requisicaoInvalida('Formato não suportado. Envie um arquivo .xlsx ou .csv');
}

function nomesDasColunas(celulas, quantidade) {
  const usados = new Map();
  return Array.from({ length: quantidade }, (_, indice) => {
    const valor = valorDaCelula(celulas?.[indice]);
    const base = valor === null ? `Coluna ${XLSX.utils.encode_col(indice)}` : String(valor).replace(/\s+/g, ' ');
    const vezes = (usados.get(base.toLowerCase()) ?? 0) + 1;
    usados.set(base.toLowerCase(), vezes);
    return vezes === 1 ? base : `${base} (${vezes})`;
  });
}

/**
 * Lê a primeira aba. O cabeçalho é a primeira linha não vazia; linhas
 * totalmente vazias são ignoradas. `numero` é o número da linha no Excel.
 * → { colunas: ['CNPJ', ...], linhas: [{ numero: 2, valores: [...] }] }
 */
export function lerPlanilha(buffer, nomeArquivo) {
  let pasta;
  try {
    pasta = abrirPasta(buffer, nomeArquivo);
  } catch (erro) {
    if (erro.status) throw erro;
    throw requisicaoInvalida('Não foi possível ler a planilha. Confira se o arquivo não está corrompido');
  }

  const aba = pasta.Sheets[pasta.SheetNames[0]];
  if (!aba?.['!ref']) throw requisicaoInvalida('A planilha está vazia');

  const quantidadeColunas = XLSX.utils.decode_range(aba['!ref']).e.c + 1;
  if (quantidadeColunas > LIMITE_COLUNAS) {
    throw requisicaoInvalida(`A planilha tem mais de ${LIMITE_COLUNAS} colunas`);
  }

  const linhasBrutas = aba['!data'] ?? [];
  let colunas = null;
  const linhas = [];
  linhasBrutas.forEach((celulas, indice) => {
    const valores = Array.from({ length: quantidadeColunas }, (_, coluna) => valorDaCelula(celulas?.[coluna]));
    if (valores.every((valor) => valor === null)) return;
    if (!colunas) {
      colunas = nomesDasColunas(celulas, quantidadeColunas);
      return;
    }
    linhas.push({ numero: indice + 1, valores });
  });

  if (!colunas || linhas.length === 0) throw requisicaoInvalida('A planilha não tem linhas de dados');
  if (linhas.length > LIMITE_LINHAS) {
    throw requisicaoInvalida(`A planilha tem mais de ${LIMITE_LINHAS.toLocaleString('pt-BR')} linhas`);
  }
  return { colunas, linhas };
}
