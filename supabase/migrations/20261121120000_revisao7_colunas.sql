-- Revisão 7 do motor de compensação (especificação, seções 4.3, 8.6 a 8.10 e 9.1).
--
-- Colunas novas de leads, a tabela de interações, a confiança na gravação do
-- score e a migração das configurações gravadas antes da revisão 7. As funções
-- SQL de cada etapa (Receita, interações) ficam em migrações próprias.

-- ---------------------------------------------------------------------------
-- leads: colunas novas
-- ---------------------------------------------------------------------------
alter table public.leads
  -- Contato do decisor (editáveis)
  add column email_decisor           text check (email_decisor is null or length(email_decisor) <= 200),
  add column linkedin_decisor        text check (linkedin_decisor is null or length(linkedin_decisor) <= 500),

  -- Contatos e sócios da Receita (preenchidos pelo enriquecimento)
  add column telefone_receita        text check (telefone_receita is null or telefone_receita ~ '^[0-9]{8,15}$'),
  add column email_receita           text check (email_receita is null or length(email_receita) <= 200),
  add column socios                  jsonb check (socios is null or jsonb_typeof(socios) = 'array'),
  add column ultima_mudanca_receita  jsonb check (ultima_mudanca_receita is null or jsonb_typeof(ultima_mudanca_receita) = 'object'),

  -- Avaliação do lead (questionário respondido no sistema)
  add column avaliacao               jsonb check (avaliacao is null or jsonb_typeof(avaliacao) = 'object'),
  add column ticket_estimado         numeric(14,2) check (ticket_estimado is null or ticket_estimado >= 0),
  add column avaliado_em             timestamptz,
  add column avaliado_por            uuid references public.perfis (id) on delete set null,

  -- Resumo das interações (mantido pelo backend)
  add column ultima_interacao_em     timestamptz,
  add column tentativas_sem_resposta integer not null default 0 check (tentativas_sem_resposta >= 0),

  -- Desfecho (convertido ou descartado)
  add column motivo_descarte         text check (motivo_descarte is null or length(motivo_descarte) <= 60),
  add column desfecho_em             timestamptz,
  add column desfecho_score          jsonb check (desfecho_score is null or jsonb_typeof(desfecho_score) = 'object'),

  -- Score: quantos itens do cálculo tinham dado (0 a 100)
  add column score_confianca         numeric(5,2) check (score_confianca between 0 and 100);

comment on column public.leads.avaliacao is
  'Respostas do questionário de avaliação: { respostas: { <pergunta>: <opção> } }.';
comment on column public.leads.socios is
  'Sócios da Receita, só nome e qualificação: [{ nome, qualificacao }]. Sem CPF (LGPD).';
comment on column public.leads.desfecho_score is
  'Cópia das colunas de score e de score_detalhes no momento em que o lead foi convertido ou descartado.';

-- Alvo da chave estrangeira composta de interacoes (garante mesma organização).
alter table public.leads add constraint leads_organizacao_id_unico unique (organizacao_id, id);

-- Fila de prioridade e reconsulta periódica.
create index leads_organizacao_interacao_idx on public.leads (organizacao_id, ultima_interacao_em);
create index leads_enriquecido_em_idx on public.leads (enriquecido_em);

-- ---------------------------------------------------------------------------
-- interacoes: tentativas de contato, conversas e reuniões com o lead
-- ---------------------------------------------------------------------------
create table public.interacoes (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id) on delete cascade,
  lead_id        uuid not null,
  perfil_id      uuid references public.perfis (id) on delete set null,
  tipo           text not null check (tipo in ('ligacao', 'whatsapp', 'email', 'reuniao', 'visita', 'outro')),
  teve_resposta  boolean not null,
  observacao     text check (observacao is null or length(observacao) <= 2000),
  ocorreu_em     timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  -- O lead precisa ser da mesma organização da interação.
  constraint interacoes_lead_fk
    foreign key (organizacao_id, lead_id)
    references public.leads (organizacao_id, id)
    on delete cascade
);

create index interacoes_lead_data_idx on public.interacoes (lead_id, ocorreu_em desc);

alter table public.interacoes enable row level security;

-- ---------------------------------------------------------------------------
-- gravar_scores: passa a gravar a confiança
-- ---------------------------------------------------------------------------
create or replace function public.gravar_scores(p_organizacao_id uuid, p_scores jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_total integer;
begin
  update public.leads l set
    score_valor         = s.score_valor,
    score_probabilidade = s.score_probabilidade,
    score_esforco       = s.score_esforco,
    score_compensacao   = s.score_compensacao,
    score_confianca     = s.score_confianca,
    score_parcial       = coalesce(s.score_parcial, false),
    score_detalhes      = s.score_detalhes,
    score_calculado_em  = now()
  from jsonb_to_recordset(p_scores) as s (
    id                  uuid,
    score_valor         numeric,
    score_probabilidade numeric,
    score_esforco       numeric,
    score_compensacao   numeric,
    score_confianca     numeric,
    score_parcial       boolean,
    score_detalhes      jsonb
  )
  where l.id = s.id
    and l.organizacao_id = p_organizacao_id;

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke execute on function public.gravar_scores(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.gravar_scores(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- config_score gravado antes da revisão 7 (seção 8.6)
-- ---------------------------------------------------------------------------
-- O CNAE prioritário vira o critério "setor" do perfil ideal.
update public.organizacoes
set config_score = jsonb_set(
      config_score #- '{valor,cnaes_prioritarios}',
      '{perfil_ideal}',
      coalesce(config_score -> 'perfil_ideal', '{}'::jsonb)
        || jsonb_build_object('setores', config_score #> '{valor,cnaes_prioritarios}')
    )
where config_score #> '{valor,cnaes_prioritarios}' is not null;

-- O peso do CNAE saiu do pilar valor.
update public.organizacoes
set config_score = config_score #- '{valor,pesos,cnae}'
where config_score #> '{valor,pesos,cnae}' is not null;

-- "Sem número do decisor" virou "contato do decisor" (agora com canais graduais).
update public.organizacoes
set config_score = jsonb_set(
      config_score #- '{esforco,sem_numero_decisor}',
      '{esforco,contato_decisor}',
      config_score #> '{esforco,sem_numero_decisor}'
    )
where config_score #> '{esforco,sem_numero_decisor}' is not null;
