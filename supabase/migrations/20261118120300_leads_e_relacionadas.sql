-- Leads e tabelas relacionadas: responsáveis, importações e redes sociais.

-- ---------------------------------------------------------------------------
-- responsaveis: a coluna "Quem mapeou?" da planilha
-- ---------------------------------------------------------------------------
create table public.responsaveis (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id) on delete cascade,
  nome           text not null check (length(trim(nome)) > 0),
  created_at     timestamptz not null default now(),
  unique (organizacao_id, nome),
  -- Alvo da chave estrangeira composta de leads (garante mesma organização).
  unique (organizacao_id, id)
);

alter table public.responsaveis enable row level security;

-- ---------------------------------------------------------------------------
-- importacoes: histórico de cada planilha importada
-- ---------------------------------------------------------------------------
create table public.importacoes (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id) on delete cascade,
  criado_por     uuid references public.perfis (id) on delete set null,
  nome_arquivo   text,
  mapeamento     jsonb not null default '{}'::jsonb
                 check (jsonb_typeof(mapeamento) = 'object'),
  total_linhas   integer not null default 0 check (total_linhas >= 0),
  inseridos      integer not null default 0 check (inseridos >= 0),
  atualizados    integer not null default 0 check (atualizados >= 0),
  ignorados      integer not null default 0 check (ignorados >= 0),
  erros          jsonb not null default '[]'::jsonb
                 check (jsonb_typeof(erros) = 'array'),
  status         text not null default 'processando'
                 check (status in ('processando', 'concluida', 'falhou')),
  created_at     timestamptz not null default now(),
  unique (organizacao_id, id)
);

create index importacoes_organizacao_data_idx
  on public.importacoes (organizacao_id, created_at desc);

alter table public.importacoes enable row level security;

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------
create table public.leads (
  -- Identificação
  id                          uuid primary key default gen_random_uuid(),
  organizacao_id              uuid not null references public.organizacoes (id) on delete cascade,
  responsavel_id              uuid,

  -- Originais da planilha
  -- CNPJ alfanumérico: 12 caracteres [0-9A-Z] + 2 dígitos verificadores numéricos.
  -- O numérico antigo é um caso particular. Os dígitos verificadores são
  -- conferidos no backend; aqui garantimos o formato.
  cnpj                        char(14) not null
                              check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$' and cnpj !~ '^(.)\1{13}$'),
  link_cnpj                   text,
  nome_lead                   text not null check (length(trim(nome_lead)) > 0),
  nome_decisor                text,
  numero_decisor              text,
  redes_sociais               text,
  calculadora_icp             numeric(10,2),
  calculadora_midias_sociais  numeric(10,2),
  nota_final                  numeric(10,2),

  -- Funil
  status                      public.status_lead not null default 'novo',

  -- Enriquecimento (BrasilAPI)
  razao_social                text,
  porte                       text,
  capital_social              numeric(16,2),
  cnae_principal              text,
  data_abertura               date,
  cidade                      text,
  uf                          char(2) check (uf ~ '^[A-Z]{2}$'),
  situacao_cadastral          text,
  enriquecido_em              timestamptz,

  -- Fila de enriquecimento (nulo = nunca solicitado)
  enriquecimento_status       text check (enriquecimento_status in (
                                'pendente', 'processando', 'concluido',
                                'nao_encontrado', 'nao_suportado', 'erro')),
  enriquecimento_tentativas   integer not null default 0 check (enriquecimento_tentativas >= 0),
  enriquecimento_erro         text,

  -- Score (0 a 100; nulo = N/A, informação insuficiente)
  score_valor                 numeric(5,2) check (score_valor between 0 and 100),
  score_probabilidade         numeric(5,2) check (score_probabilidade between 0 and 100),
  score_esforco               numeric(5,2) check (score_esforco between 0 and 100),
  score_compensacao           numeric(5,2) check (score_compensacao between 0 and 100),
  score_parcial               boolean not null default false,
  score_detalhes              jsonb,
  score_calculado_em          timestamptz,

  -- Flexibilidade
  dados_extras                jsonb not null default '{}'::jsonb
                              check (jsonb_typeof(dados_extras) = 'object'),
  ultima_importacao_id        uuid,

  -- Controle
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint leads_organizacao_cnpj_unico unique (organizacao_id, cnpj),

  -- Chaves compostas: o responsável e a importação precisam ser da mesma
  -- organização do lead. Ao excluir o responsável/importação, só a coluna de
  -- referência vira nula (o organizacao_id do lead é preservado).
  constraint leads_responsavel_fk
    foreign key (organizacao_id, responsavel_id)
    references public.responsaveis (organizacao_id, id)
    on delete set null (responsavel_id),
  constraint leads_ultima_importacao_fk
    foreign key (organizacao_id, ultima_importacao_id)
    references public.importacoes (organizacao_id, id)
    on delete set null (ultima_importacao_id)
);

comment on column public.leads.score_parcial is
  'Verdadeiro quando algum fator ou pilar do score ficou N/A por falta de dado do lead.';
comment on column public.leads.dados_extras is
  'Colunas da planilha não mapeadas e valores originais convertidos (ex.: notas em letra em originais.<campo>).';

-- Ranking padrão: maior compensação primeiro, N/A no fim.
create index leads_organizacao_compensacao_idx
  on public.leads (organizacao_id, score_compensacao desc nulls last);
create index leads_organizacao_status_idx
  on public.leads (organizacao_id, status);
create index leads_responsavel_idx
  on public.leads (responsavel_id);
create index leads_ultima_importacao_idx
  on public.leads (ultima_importacao_id);
-- Fila de enriquecimento: só os pendentes entram no índice, então ele fica pequeno.
create index leads_enriquecimento_pendente_idx
  on public.leads (enriquecimento_status)
  where enriquecimento_status = 'pendente';

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

alter table public.leads enable row level security;

-- ---------------------------------------------------------------------------
-- lead_redes_sociais: cada link da célula "Redes Sociais" separado
-- ---------------------------------------------------------------------------
create table public.lead_redes_sociais (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads (id) on delete cascade,
  plataforma text not null default 'outra'
             check (plataforma in ('instagram', 'linkedin', 'facebook', 'site', 'outra')),
  url        text not null check (length(trim(url)) > 0),
  created_at timestamptz not null default now(),
  unique (lead_id, url)
);

alter table public.lead_redes_sociais enable row level security;
