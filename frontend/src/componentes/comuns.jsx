// Peças usadas por várias telas: janela de diálogo, chips, cabeçalho de página,
// seleção e o hook de carregamento.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Aviso } from './ui.jsx';

/** Janela de diálogo modal (fecha com Esc e pelo fundo). */
export function Modal({ titulo, aberto, aoFechar, children, largura = 'max-w-lg' }) {
  const caixa = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const fechar = (evento) => evento.key === 'Escape' && aoFechar();
    document.addEventListener('keydown', fechar);
    caixa.current?.querySelector('input, select, textarea, button')?.focus();
    return () => document.removeEventListener('keydown', fechar);
  }, [aberto, aoFechar]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-veu px-4 py-12" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div ref={caixa} role="dialog" aria-modal="true" aria-label={titulo} className={`flex w-full ${largura} flex-col gap-4 rounded-xl border border-borda bg-superficie p-6 shadow-xl`}>
        <h2 className="text-lg font-semibold">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

export function Chip({ ativo, children, ...resto }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium ${
        ativo ? 'border-tinta bg-tinta text-sobre-tinta' : 'border-borda-forte bg-superficie text-texto hover:bg-hover'
      }`}
      {...resto}
    >
      {children}
    </button>
  );
}

export function CabecalhoPagina({ titulo, descricao, acoes }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        {descricao && <p className="text-texto-2">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Selecao({ id, rotulo, children, className = '', ...resto }) {
  return (
    <div className={className}>
      {rotulo && <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">{rotulo}</label>}
      <select id={id} className="min-h-10 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-texto" {...resto}>{children}</select>
    </div>
  );
}

export function AreaTexto({ id, rotulo, className = '', ...resto }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">{rotulo}</label>
      <textarea id={id} className="w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-texto" {...resto} />
    </div>
  );
}

/**
 * Busca dados ao montar e quando `dependencias` mudam.
 * Devolve { dados, erro, carregando, recarregar, definir }.
 */
export function useCarregamento(buscar, dependencias) {
  const [estado, setEstado] = useState({ dados: null, erro: null, carregando: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const executar = useCallback(buscar, dependencias);
  const recarregar = useCallback(async () => {
    setEstado((atual) => ({ ...atual, carregando: true, erro: null }));
    try {
      const dados = await executar();
      setEstado({ dados, erro: null, carregando: false });
      return dados;
    } catch (erro) {
      setEstado((atual) => ({ ...atual, erro, carregando: false }));
      return null;
    }
  }, [executar]);
  useEffect(() => {
    recarregar();
  }, [recarregar]);
  const definir = useCallback((dados) => setEstado((atual) => ({ ...atual, dados })), []);
  return { ...estado, recarregar, definir };
}

export function ErroCarregamento({ erro, aoTentar }) {
  return (
    <Aviso tipo="erro" className="flex flex-wrap items-center justify-between gap-3">
      <span>{erro?.message ?? 'Não foi possível carregar.'}</span>
      {aoTentar && <button type="button" className="cursor-pointer font-semibold underline" onClick={aoTentar}>Tentar de novo</button>}
    </Aviso>
  );
}

/** Mensagem que some sozinha depois de alguns segundos. */
export function useMensagem() {
  const [mensagem, setMensagem] = useState(null);
  useEffect(() => {
    if (!mensagem) return undefined;
    const id = setTimeout(() => setMensagem(null), 6000);
    return () => clearTimeout(id);
  }, [mensagem]);
  return [mensagem, setMensagem];
}
