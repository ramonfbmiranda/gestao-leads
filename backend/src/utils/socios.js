// Sócios da Receita e decisor provável (especificação, seção 9.1).
// Só nome e qualificação são guardados: CPF e faixa etária ficam de fora (LGPD).

const QUALIFICACOES_DE_DECISAO = ['ADMINISTRADOR', 'PRESIDENTE', 'DIRETOR', 'GERENTE'];

const semAcento = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();

/**
 * O sócio que provavelmente decide: o primeiro com qualificação de
 * administrador, presidente, diretor ou gerente; sem nenhum assim, o único
 * sócio quando houver só um. Devolve { nome, qualificacao } ou null.
 */
export function decisorProvavel(socios) {
  if (!Array.isArray(socios) || socios.length === 0) return null;
  const validos = socios.filter((socio) => socio && typeof socio.nome === 'string' && socio.nome.trim() !== '');
  const decide = validos.find((socio) =>
    QUALIFICACOES_DE_DECISAO.some((palavra) => semAcento(socio.qualificacao).includes(palavra)),
  );
  if (decide) return { nome: decide.nome, qualificacao: decide.qualificacao ?? null };
  return validos.length === 1 ? { nome: validos[0].nome, qualificacao: validos[0].qualificacao ?? null } : null;
}
