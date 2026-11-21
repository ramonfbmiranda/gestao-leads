// Ícones de traço do protótipo (decorativos: aria-hidden).

function Icone({ tamanho = 18, children }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconePotencial = (p) => <Icone {...p}><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 18l4-6" /></Icone>;
export const IconeLeads = (p) => (
  <Icone {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Icone>
);
export const IconePrioridade = (p) => <Icone {...p}><path d="M5 21V4" /><path d="M5 4h12l-2.5 4L17 12H5" /></Icone>;
export const IconeImportacao = (p) => (
  <Icone {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></Icone>
);
export const IconeConfiguracoes = (p) => <Icone {...p}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></Icone>;
export const IconeOrganizacao = (p) => (
  <Icone {...p}><path d="M3 21h18" /><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></Icone>
);
export const IconeLua = (p) => <Icone {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Icone>;
export const IconeSol = (p) => (
  <Icone {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icone>
);
export const IconeSair = (p) => <Icone {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></Icone>;
export const IconeEnvelope = (p) => <Icone {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></Icone>;
export const IconeExterno = (p) => (
  <Icone tamanho={13} {...p}><path d="M15 3h6v6" /><path d="M10 14L21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></Icone>
);
