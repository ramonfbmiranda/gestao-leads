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

export function Logo({ tamanho = 30 }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-lg bg-tinta text-sobre-tinta"
      style={{ width: tamanho, height: tamanho }}
    >
      <svg width={tamanho * 0.6} height={tamanho * 0.6} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 18a8 8 0 1 1 16 0" />
        <path d="M12 18l4-6" />
      </svg>
    </span>
  );
}

export function TelaCarregando({ texto = 'Carregando…' }) {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status">
      <span className="text-texto-2">{texto}</span>
    </div>
  );
}
