// Separa o texto da coluna "Redes Sociais" em links normalizados, cada um com a
// plataforma detectada pelo domínio. Só entra o que parece endereço web: textos
// soltos, telefones, e-mails e "@perfil" ficam apenas no texto original.

const DOMINIOS_POR_PLATAFORMA = [
  ['instagram', ['instagram.com', 'instagr.am']],
  ['linkedin', ['linkedin.com', 'lnkd.in']],
  ['facebook', ['facebook.com', 'fb.com', 'fb.me']],
  [
    'outra',
    [
      'tiktok.com', 'youtube.com', 'youtu.be', 'twitter.com', 'x.com', 'threads.net',
      'wa.me', 'whatsapp.com', 'linktr.ee', 'pinterest.com', 'kwai.com',
    ],
  ],
];

const REGEX_HOST = /^([a-z0-9-]+\.)+[a-z]{2,}$/;
const TAMANHO_MAXIMO_URL = 500;
export const MAXIMO_LINKS = 20;

export function detectarPlataforma(host) {
  for (const [plataforma, dominios] of DOMINIOS_POR_PLATAFORMA) {
    if (dominios.some((dominio) => host === dominio || host.endsWith(`.${dominio}`))) {
      return plataforma;
    }
  }
  return 'site';
}

/**
 * Normaliza um link para que variações do mesmo endereço virem uma única URL:
 * https, domínio em minúsculas e sem "www.", sem barra final e sem "#...".
 * Devolve null se o texto não for um endereço web.
 */
export function normalizarUrl(texto) {
  const limpo = texto.replace(/^[("'<[]+|[)"'>\],.;:!?]+$/g, '');
  if (!limpo.includes('.')) return null;

  const comProtocolo = /^https?:\/\//i.test(limpo) ? limpo : `https://${limpo}`;
  let url;
  try {
    url = new URL(comProtocolo);
  } catch {
    return null;
  }
  // "contato@empresa.com" vira usuário da URL: é e-mail, não site.
  if (url.username || url.password || !REGEX_HOST.test(url.hostname)) return null;

  const host = url.hostname.replace(/^www\./, '');
  const caminho = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  const normalizada = `https://${host}${caminho}${url.search}`;
  return normalizada.length <= TAMANHO_MAXIMO_URL ? normalizada : null;
}

/** "instagram.com/empresa, www.empresa.com.br" → [{ plataforma, url }, ...] */
export function extrairRedesSociais(texto) {
  if (typeof texto !== 'string') return [];
  const vistos = new Set();
  const redes = [];
  for (const parte of texto.split(/[\s,;|]+/)) {
    const url = parte ? normalizarUrl(parte) : null;
    if (!url || vistos.has(url)) continue;
    vistos.add(url);
    redes.push({ plataforma: detectarPlataforma(new URL(url).hostname), url });
    if (redes.length === MAXIMO_LINKS) break;
  }
  return redes;
}
