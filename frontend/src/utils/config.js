// Edição da configuração do score. A organização guarda só o que mudou
// (seção 8.6): ao salvar, mandamos as seções que diferem do padrão.

export function iguais(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const chavesA = Object.keys(a);
  const chavesB = Object.keys(b);
  if (chavesA.length !== chavesB.length) return false;
  return chavesA.every((chave) => Object.hasOwn(b, chave) && iguais(a[chave], b[chave]));
}

/** Seções de topo do config_score que diferem do padrão. */
export function diferencasDoPadrao(efetivo, padrao) {
  return Object.fromEntries(Object.entries(efetivo).filter(([chave, valor]) => !iguais(valor, padrao[chave])));
}

/** Atualiza um caminho (["esforco", "tentativas", "maximo"]) devolvendo um objeto novo. */
export function comValor(objeto, caminho, valor) {
  const [chave, ...resto] = caminho;
  const atual = Array.isArray(objeto) ? [...objeto] : { ...objeto };
  atual[chave] = resto.length === 0 ? valor : comValor(objeto[chave] ?? {}, resto, valor);
  return atual;
}

/** Id de pergunta ou opção a partir do texto, único na lista ("orcamento", "orcamento_2"). */
export function idDoTexto(texto, existentes) {
  const base = String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 34) || 'item';
  let id = base;
  for (let n = 2; existentes.includes(id); n += 1) id = `${base}_${n}`;
  return id;
}
