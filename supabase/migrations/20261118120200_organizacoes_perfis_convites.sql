-- Organizações (empresas clientes), perfis de usuário e convites.

-- ---------------------------------------------------------------------------
-- organizacoes
-- ---------------------------------------------------------------------------
create table public.organizacoes (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null check (length(trim(nome)) > 0),
  escala_icp_max    numeric(10,2) not null default 100 check (escala_icp_max > 0),
  escala_midias_max numeric(10,2) not null default 100 check (escala_midias_max > 0),
  escala_nota_max   numeric(10,2) not null default 100 check (escala_nota_max > 0),
  config_score      jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(config_score) = 'object'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.organizacoes is
  'Empresas clientes. Todo dado de negócio pertence a uma organização.';
comment on column public.organizacoes.config_score is
  'Pesos e faixas do score. Chaves ausentes usam o padrão da especificação (seção 8.6).';

create trigger organizacoes_set_updated_at
  before update on public.organizacoes
  for each row execute function public.set_updated_at();

alter table public.organizacoes enable row level security;

-- ---------------------------------------------------------------------------
-- perfis: liga cada usuário do Supabase Auth à sua organização
-- ---------------------------------------------------------------------------
create table public.perfis (
  id             uuid primary key references auth.users (id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes (id) on delete cascade,
  nome           text,
  papel          text not null default 'membro' check (papel in ('admin', 'membro')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index perfis_organizacao_idx on public.perfis (organizacao_id);

create trigger perfis_set_updated_at
  before update on public.perfis
  for each row execute function public.set_updated_at();

alter table public.perfis enable row level security;

-- ---------------------------------------------------------------------------
-- convites: membros convidados por e-mail que ainda não entraram
-- ---------------------------------------------------------------------------
create table public.convites (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id) on delete cascade,
  email          text not null check (email = lower(email) and position('@' in email) > 1),
  papel          text not null default 'membro' check (papel in ('admin', 'membro')),
  convidado_por  uuid references public.perfis (id) on delete set null,
  status         text not null default 'pendente'
                 check (status in ('pendente', 'aceito', 'cancelado')),
  created_at     timestamptz not null default now(),
  aceito_em      timestamptz
);

-- Só um convite pendente por e-mail em cada organização (os antigos ficam no histórico).
create unique index convites_pendente_unico
  on public.convites (organizacao_id, email)
  where status = 'pendente';

-- Usado no primeiro login, para achar convites pelo e-mail do usuário.
create index convites_email_pendente_idx
  on public.convites (email)
  where status = 'pendente';

alter table public.convites enable row level security;
