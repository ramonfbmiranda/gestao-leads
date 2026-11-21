// Variáveis de ambiente do frontend (especificação, seção 13). Só as que
// começam com VITE_ chegam ao navegador; a chave secreta nunca entra aqui.

const OBRIGATORIAS = ['VITE_API_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'];

/** Lê e confere as variáveis. Devolve { ambiente } ou { faltando: [nomes] }. */
export function lerAmbiente(variaveis) {
  const faltando = OBRIGATORIAS.filter((nome) => !String(variaveis[nome] ?? '').trim());
  if (faltando.length > 0) return { faltando };
  return {
    ambiente: {
      apiUrl: variaveis.VITE_API_URL.trim().replace(/\/+$/, ''),
      supabaseUrl: variaveis.VITE_SUPABASE_URL.trim(),
      supabaseChavePublica: variaveis.VITE_SUPABASE_PUBLISHABLE_KEY.trim(),
    },
  };
}

export const { ambiente, faltando } = lerAmbiente(import.meta.env ?? {});
