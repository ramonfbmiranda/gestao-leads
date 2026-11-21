// Organização com a configuração efetiva do score (GET /organizacao): faixas,
// motivos de descarte, escalas e o resto que as telas usam para exibir.

import { createContext, useContext } from 'react';
import { useCarregamento } from '../componentes/comuns.jsx';
import { api } from '../servicos/api.js';

const Contexto = createContext(null);

export function ProvedorOrganizacao({ children }) {
  const { dados, erro, carregando, recarregar } = useCarregamento(() => api.obterOrganizacao(), []);
  const config = dados?.config_efetivo ?? null;
  return (
    <Contexto.Provider value={{ organizacao: dados, config, faixas: config?.faixas ?? { alta: 70, media: 40 }, erro, carregando, recarregar }}>
      {children}
    </Contexto.Provider>
  );
}

export function useOrganizacao() {
  return useContext(Contexto);
}
