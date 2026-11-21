// Medidores do potencial (seção 11.1): azul de um tom só, faixa sempre também
// em texto e em barras do ícone de sinal, role="meter" com valor por extenso.

import { ROTULOS_STATUS, faixaDoPotencial, formatarNumero } from '../utils/formatos.js';
import { pontoDoArco } from '../utils/potencial.js';

const PREENCHIMENTO = { alta: 'fill-pot-alta', media: 'fill-pot-media', baixa: 'fill-pot-baixa', na: 'fill-transparent' };
const TRACO = { alta: 'stroke-pot-alta', media: 'stroke-pot-media', baixa: 'stroke-pot-baixa', na: 'stroke-transparent' };

export function textoDoPotencial(valor, parcial, faixas) {
  const { rotulo } = faixaDoPotencial(valor, faixas);
  if (valor === null || valor === undefined) return 'Sem dados suficientes para calcular';
  return `${formatarNumero(valor)} de 100, potencial ${rotulo.toLowerCase()}${parcial ? ', parcial' : ''}`;
}

export function Sinal({ barras, tamanho = 12 }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 14 14" aria-hidden="true" className="fill-current">
      <rect x="1" y="8" width="3" height="5" rx="1" opacity={barras >= 1 ? 1 : 0.28} />
      <rect x="5.5" y="5" width="3" height="8" rx="1" opacity={barras >= 2 ? 1 : 0.28} />
      <rect x="10" y="2" width="3" height="11" rx="1" opacity={barras >= 3 ? 1 : 0.28} />
    </svg>
  );
}

export function SeloParcial({ pequeno = false }) {
  return (
    <span
      title="Parcial: faltou informação para algum fator"
      className={`inline-flex items-center rounded-full border border-dashed border-parcial-borda bg-parcial font-semibold text-parcial-texto ${pequeno ? 'px-1.5 text-[11px]' : 'px-2.5 py-0.5 text-xs'}`}
    >
      Parcial
    </span>
  );
}

export function SeloFaixa({ valor, faixas, prefixo = 'Potencial ' }) {
  const { rotulo, barras, faixa } = faixaDoPotencial(valor, faixas);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[13px] font-semibold ${faixa === 'na' ? 'bg-hover text-texto-2' : 'bg-pot-suave text-pot-texto'}`}>
      <Sinal barras={barras} tamanho={14} />{faixa === 'na' ? 'Sem dados suficientes' : `${prefixo}${rotulo.toLowerCase()}`}
    </span>
  );
}

/** Barra com as divisões das faixas, para tabelas e listas (sem animação). */
export function MedidorBarra({ valor, parcial, faixas, larguraNumero = 36 }) {
  const { faixa, rotulo, barras } = faixaDoPotencial(valor, faixas);
  const limites = faixas ?? { alta: 70, media: 40 };
  return (
    <span role="meter" aria-label="Potencial" aria-valuemin={0} aria-valuemax={100} aria-valuenow={valor ?? undefined} aria-valuetext={textoDoPotencial(valor, parcial, faixas)} className="flex items-center gap-2.5">
      <span className="text-[15px] font-bold" style={{ minWidth: larguraNumero }}>{formatarNumero(valor)}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" className="block h-2 w-full">
          <rect width="100" height="8" rx="3" className="fill-pot-trilho" />
          <rect width={valor ?? 0} height="8" rx="3" className={PREENCHIMENTO[faixa]} />
          <rect x={limites.media - 0.6} width="1.2" height="8" className="fill-superficie" />
          <rect x={limites.alta - 0.6} width="1.2" height="8" className="fill-superficie" />
        </svg>
        <span className={`flex items-center gap-1.5 text-xs font-semibold ${faixa === 'na' ? 'text-texto-2' : 'text-pot-texto'}`}>
          <Sinal barras={barras} />{faixa === 'na' ? 'N/A · sem dados' : rotulo}
          {parcial && <SeloParcial pequeno />}
        </span>
      </span>
    </span>
  );
}

/** Arco semicircular do destaque (detalhe e avaliação). */
export function MedidorArco({ valor, parcial, faixas, rotulo = 'Potencial do lead', legenda }) {
  const { faixa } = faixaDoPotencial(valor, faixas);
  const limites = faixas ?? { alta: 70, media: 40 };
  const marcador = valor === null || valor === undefined ? null : pontoDoArco(valor);
  const divisao = (limite) => {
    const dentro = pontoDoArco(limite, 85);
    const fora = pontoDoArco(limite, 107);
    return <line x1={dentro.x} y1={dentro.y} x2={fora.x} y2={fora.y} strokeWidth="3" className="stroke-superficie" />;
  };
  return (
    <div role="meter" aria-label={rotulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={valor ?? undefined} aria-valuetext={textoDoPotencial(valor, parcial, faixas)} aria-live="polite" className="relative w-full max-w-[290px]">
      <svg viewBox="0 -14 240 156" width="100%" aria-hidden="true" className="block overflow-visible">
        <path d="M 24 120 A 96 96 0 0 1 216 120" fill="none" strokeWidth="18" className="stroke-pot-trilho" />
        {marcador && (
          <path
            d="M 24 120 A 96 96 0 0 1 216 120"
            fill="none"
            strokeWidth="18"
            className={`${TRACO[faixa]} transition-[stroke-dashoffset] duration-500`}
            pathLength="100"
            strokeDasharray="100 100"
            strokeDashoffset={100 - valor}
          />
        )}
        {divisao(limites.media)}
        {divisao(limites.alta)}
        {marcador && <circle cx={marcador.x} cy={marcador.y} r="8" strokeWidth="3" className={`fill-superficie ${TRACO[faixa]}`} />}
        <text x="24" y="138" textAnchor="middle" fontSize="11" className="fill-texto-2">0</text>
        <text x="216" y="138" textAnchor="middle" fontSize="11" className="fill-texto-2">100</text>
      </svg>
      <div className="absolute inset-x-0 bottom-[14%] flex flex-col items-center leading-none">
        <span className="text-5xl font-bold tracking-tight">{formatarNumero(valor)}</span>
        <span className="mt-1 text-xs text-texto-2">{legenda ?? 'de 100'}</span>
      </div>
    </div>
  );
}

const CORES_STATUS = {
  novo: 'bg-hover text-texto',
  em_contato: 'bg-pot-suave text-pot-texto',
  qualificado: 'bg-[#f0ebfe] text-[#5b21b6] dark:bg-[#231b3d] dark:text-[#c4b5fd]',
  convertido: 'bg-ok text-ok-texto',
  descartado: 'bg-hover text-texto-2',
};

export function SeloStatus({ status }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${CORES_STATUS[status]}`}>{ROTULOS_STATUS[status]}</span>;
}

/** Nota final da planilha: verde, amarelo ou vermelho pela escala da organização, sempre com o número. */
export function NotaFinal({ nota, escala }) {
  if (nota === null || nota === undefined) return <span className="text-texto-2">—</span>;
  const fracao = Number(nota) / Number(escala || 10);
  const cor = fracao >= 0.7 ? 'text-[#166534] dark:text-[#4ade80]' : fracao >= 0.4 ? 'text-[#8a5a00] dark:text-[#facc15]' : 'text-perigo';
  return <span className={`font-semibold ${cor}`}>{formatarNumero(nota)}</span>;
}
