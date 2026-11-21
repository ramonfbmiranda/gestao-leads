// Formatação para a interface, em português do Brasil. Funções puras.

/** CNPJ (numérico ou alfanumérico, 14 caracteres) com máscara: 12.ABC.345/01DE-35. */
export function formatarCnpj(cnpj) {
  const limpo = String(cnpj ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (limpo.length !== 14) return String(cnpj ?? '');
  return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8, 12)}-${limpo.slice(12)}`;
}

/** Número com vírgula; nulo vira "N/A". */
export function formatarNumero(valor, casas = 1) {
  if (valor === null || valor === undefined || valor === '') return 'N/A';
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function formatarMoeda(valor) {
  if (valor === null || valor === undefined) return 'N/A';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

const FAIXAS = {
  alta: { rotulo: 'Alto', barras: 3 },
  media: { rotulo: 'Médio', barras: 2 },
  baixa: { rotulo: 'Baixo', barras: 1 },
  na: { rotulo: 'N/A', barras: 0 },
};

/**
 * Faixa do potencial pelos limites da organização (padrão: alta ≥ 70,
 * média ≥ 40). Devolve { faixa, rotulo, barras }.
 */
export function faixaDoPotencial(valor, limites = { alta: 70, media: 40 }) {
  let faixa = 'na';
  if (valor !== null && valor !== undefined) {
    faixa = valor >= limites.alta ? 'alta' : valor >= limites.media ? 'media' : 'baixa';
  }
  return { faixa, ...FAIXAS[faixa] };
}

export const ROTULOS_STATUS = {
  novo: 'Novo',
  em_contato: 'Em contato',
  qualificado: 'Qualificado',
  convertido: 'Convertido',
  descartado: 'Descartado',
};
