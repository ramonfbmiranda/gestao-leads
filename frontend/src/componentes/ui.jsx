// Componentes básicos do protótipo aprovado: botões, campos, cartões e avisos.

const BOTOES = {
  padrao: 'border-borda-forte bg-superficie text-texto hover:bg-hover',
  primario: 'border-tinta bg-tinta text-sobre-tinta hover:bg-tinta-hover hover:border-tinta-hover',
  perigo: 'border-perigo-borda bg-superficie text-perigo hover:bg-perigo-suave',
  icone: 'border-transparent bg-transparent text-texto-2 hover:bg-hover min-w-10 px-0',
};

export function classesBotao({ variante = 'padrao', pequeno = false, largo = false } = {}) {
  return [
    'inline-flex items-center justify-center gap-2 rounded-lg border font-medium whitespace-nowrap no-underline',
    'cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
    pequeno ? 'min-h-8 px-3 text-[13px]' : 'min-h-10 px-4',
    largo ? 'w-full' : '',
    BOTOES[variante],
  ].join(' ');
}

export function Botao({ variante, pequeno, largo, className = '', type = 'button', ...resto }) {
  return <button type={type} className={`${classesBotao({ variante, pequeno, largo })} ${className}`} {...resto} />;
}

export function Campo({ id, rotulo, ajuda, erro, className = '', ...resto }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">{rotulo}</label>
      <input
        id={id}
        aria-invalid={erro ? 'true' : undefined}
        aria-describedby={ajuda || erro ? `${id}-ajuda` : undefined}
        className="min-h-10 w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-texto"
        {...resto}
      />
      {(ajuda || erro) && (
        <p id={`${id}-ajuda`} className={`mt-1 text-xs ${erro ? 'text-perigo' : 'text-texto-2'}`}>{erro || ajuda}</p>
      )}
    </div>
  );
}

export function Cartao({ as: Elemento = 'section', className = '', ...resto }) {
  return <Elemento className={`rounded-xl border border-borda bg-superficie ${className}`} {...resto} />;
}

const AVISOS = {
  ok: 'border-ok-borda bg-ok text-ok-texto',
  aviso: 'border-aviso-borda bg-aviso text-aviso-texto',
  erro: 'border-perigo-borda bg-perigo-suave text-perigo',
};

export function Aviso({ tipo = 'aviso', children, className = '' }) {
  return (
    <div role={tipo === 'erro' ? 'alert' : 'status'} className={`rounded-lg border px-3.5 py-2.5 text-[13px] ${AVISOS[tipo]} ${className}`}>
      {children}
    </div>
  );
}

// Medidor de três faixas com barras de sinal, nas cores da escala do Potencial
// (que se invertem no tema escuro). Mesmo desenho de public/favicon.svg.
export function Logo({ tamanho = 30 }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="4 4 40 40" className="shrink-0" aria-hidden="true">
      {/* Traço da mesma cor só para arredondar os cantos de cada faixa. */}
      <g strokeWidth="2" strokeLinejoin="round">
        <path className="fill-pot-baixa stroke-pot-baixa" d="M5.25 31A18.75 18.75 0 0 1 12.769 15.987L14.716 18.589A15.5 15.5 0 0 0 8.5 31Z" />
        <path className="fill-pot-media stroke-pot-media" d="M16.614 13.767A18.75 18.75 0 0 1 31.386 13.767L30.105 16.754A15.5 15.5 0 0 0 17.895 16.754Z" />
        <path className="fill-pot-alta stroke-pot-alta" d="M35.231 15.987A18.75 18.75 0 0 1 42.75 31L39.5 31A15.5 15.5 0 0 0 33.284 18.589Z" />
      </g>
      <rect className="fill-pot-baixa" x="15" y="30" width="4.8" height="6" rx="1.4" />
      <rect className="fill-pot-media" x="21.6" y="27" width="4.8" height="9" rx="1.4" />
      <rect className="fill-pot-alta" x="28.2" y="24" width="4.8" height="12" rx="1.4" />
    </svg>
  );
}

export function TelaCarregando({ texto = 'Carregando…' }) {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status">
      <span className="text-texto-2">{texto}</span>
    </div>
  );
}
