// Tema claro/escuro. A escolha da pessoa fica no navegador; sem escolha,
// segue o sistema operacional.

export const CHAVE_TEMA = 'gl-tema';

/** 'claro' | 'escuro' a partir do que foi guardado e da preferência do sistema. */
export function resolverTema(guardado, sistemaEscuro) {
  if (guardado === 'claro' || guardado === 'escuro') return guardado;
  return sistemaEscuro ? 'escuro' : 'claro';
}

export function lerTemaGuardado() {
  try {
    return window.localStorage.getItem(CHAVE_TEMA);
  } catch {
    return null;
  }
}

export function guardarTema(tema) {
  try {
    window.localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    // Navegação privada ou armazenamento bloqueado: o tema vale só nesta visita.
  }
}
