import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { guardarTema, lerTemaGuardado, resolverTema } from '../utils/tema.js';

const Contexto = createContext(null);

function temaInicial() {
  const sistemaEscuro = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  return resolverTema(lerTemaGuardado(), sistemaEscuro);
}

export function ProvedorTema({ children }) {
  const [tema, setTema] = useState(temaInicial);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'escuro');
  }, [tema]);

  const alternarTema = useCallback(() => {
    setTema((atual) => {
      const novo = atual === 'escuro' ? 'claro' : 'escuro';
      guardarTema(novo);
      return novo;
    });
  }, []);

  const valor = useMemo(() => ({ tema, escuro: tema === 'escuro', alternarTema }), [tema, alternarTema]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTema() {
  return useContext(Contexto);
}
