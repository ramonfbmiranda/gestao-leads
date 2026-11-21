-- Fila de enriquecimento por CNPJ (especificação, seção 9).
--
-- O estado da fila fica no banco, para o processador do backend retomar o
-- trabalho se o servidor reiniciar ou "dormir" (plano gratuito do Render).
-- O backend consulta a BrasilAPI; estas funções só reservam, contam e
-- enfileiram, sempre filtrando pela organização quando ela é informada.

-- Quando o lead pode ser processado:
--   pendente    → a partir de quando pode ser tentado (espera entre tentativas);
--   processando → prazo da reserva; vencido, o lead volta para a fila.
alter table public.leads add column enriquecimento_proxima_em timestamptz;

comment on column public.leads.enriquecimento_proxima_em is
  'Pendente: início da próxima tentativa. Processando: prazo da reserva (vencido, volta para a fila).';

-- O índice antigo só tinha o status; a fila agora escolhe por organização e horário.
drop index public.leads_enriquecimento_pendente_idx;

create index leads_enriquecimento_pendente_idx
  on public.leads (organizacao_id, enriquecimento_proxima_em)
  where enriquecimento_status = 'pendente';

create index leads_enriquecimento_processando_idx
  on public.leads (enriquecimento_proxima_em)
  where enriquecimento_status = 'processando';


-- Coloca leads da organização na fila e devolve quantos entraram.
-- Sem p_ids: os nunca solicitados e os que terminaram em erro.
-- Com p_ids: esses leads, mesmo já enriquecidos (para atualizar os dados).
-- Leads já pendentes ou em processamento ficam como estão.
create function public.enfileirar_enriquecimento(p_organizacao_id uuid, p_ids uuid[] default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_total integer;
begin
  update public.leads l set
    enriquecimento_status     = 'pendente',
    enriquecimento_tentativas = 0,
    enriquecimento_erro       = null,
    enriquecimento_proxima_em = now()
  where l.organizacao_id = p_organizacao_id
    and (l.enriquecimento_status is null or l.enriquecimento_status not in ('pendente', 'processando'))
    and case
          when p_ids is null then l.enriquecimento_status is null or l.enriquecimento_status = 'erro'
          else l.id = any (p_ids)
        end;

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;


-- Reserva o próximo lead da fila e devolve { id, organizacao_id, cnpj, tentativas }
-- (ou null se não houver nenhum pronto).
--
-- Rodízio entre organizações: a próxima organização é a primeira com lead
-- pronto depois de p_depois_de (a última atendida), voltando ao início quando
-- acabar. Assim uma importação grande não trava a fila das outras.
-- Antes de reservar, devolve à fila os leads presos em "processando" com a
-- reserva vencida (servidor caiu no meio); quem já esgotou as tentativas vira erro.
create function public.pegar_proximo_enriquecimento(
  p_depois_de      uuid     default null,
  p_prazo          interval default interval '5 minutes',
  p_max_tentativas integer  default 3
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_organizacao uuid;
  v_reserva     jsonb;
begin
  update public.leads l set
    enriquecimento_status = case when l.enriquecimento_tentativas >= p_max_tentativas then 'erro' else 'pendente' end,
    enriquecimento_erro   = 'Processamento interrompido antes de terminar',
    enriquecimento_proxima_em = now()
  where l.enriquecimento_status = 'processando'
    and l.enriquecimento_proxima_em < now();

  select l.organizacao_id into v_organizacao
  from public.leads l
  where l.enriquecimento_status = 'pendente'
    and coalesce(l.enriquecimento_proxima_em, '-infinity') <= now()
    and (p_depois_de is null or l.organizacao_id > p_depois_de)
  order by l.organizacao_id
  limit 1;

  if v_organizacao is null and p_depois_de is not null then
    select l.organizacao_id into v_organizacao
    from public.leads l
    where l.enriquecimento_status = 'pendente'
      and coalesce(l.enriquecimento_proxima_em, '-infinity') <= now()
    order by l.organizacao_id
    limit 1;
  end if;

  if v_organizacao is null then
    return null;
  end if;

  -- skip locked: se outro processo reservou o mesmo lead, pula sem esperar.
  update public.leads l set
    enriquecimento_status     = 'processando',
    enriquecimento_tentativas = l.enriquecimento_tentativas + 1,
    enriquecimento_proxima_em = now() + p_prazo
  where l.id = (
    select x.id
    from public.leads x
    where x.organizacao_id = v_organizacao
      and x.enriquecimento_status = 'pendente'
      and coalesce(x.enriquecimento_proxima_em, '-infinity') <= now()
    order by x.enriquecimento_proxima_em nulls first, x.id
    limit 1
    for update skip locked
  )
  returning jsonb_build_object(
    'id', l.id,
    'organizacao_id', l.organizacao_id,
    'cnpj', l.cnpj,
    'tentativas', l.enriquecimento_tentativas
  ) into v_reserva;

  return v_reserva;
end;
$$;


-- Reserva um lead específico para o enriquecimento individual (na hora).
-- Devolve a reserva, ou null se o lead já estiver sendo processado.
-- Lead inexistente ou de outra organização: no_data_found (404 na API).
create function public.reservar_enriquecimento(
  p_organizacao_id uuid,
  p_lead_id        uuid,
  p_prazo          interval default interval '5 minutes'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_reserva jsonb;
begin
  if not exists (
    select 1 from public.leads l where l.id = p_lead_id and l.organizacao_id = p_organizacao_id
  ) then
    raise exception 'Lead não encontrado' using errcode = 'no_data_found';
  end if;

  -- Pedido explícito do usuário: as tentativas recomeçam do 1.
  update public.leads l set
    enriquecimento_status     = 'processando',
    enriquecimento_tentativas = 1,
    enriquecimento_proxima_em = now() + p_prazo
  where l.id = p_lead_id
    and l.organizacao_id = p_organizacao_id
    and (l.enriquecimento_status is distinct from 'processando'
         or coalesce(l.enriquecimento_proxima_em < now(), true))
  returning jsonb_build_object(
    'id', l.id,
    'organizacao_id', l.organizacao_id,
    'cnpj', l.cnpj,
    'tentativas', l.enriquecimento_tentativas
  ) into v_reserva;

  return v_reserva;
end;
$$;


-- Progresso da fila: quantidade de leads da organização por situação.
create function public.contar_enriquecimento(p_organizacao_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'nao_solicitado', count(*) filter (where l.enriquecimento_status is null),
    'pendente',       count(*) filter (where l.enriquecimento_status = 'pendente'),
    'processando',    count(*) filter (where l.enriquecimento_status = 'processando'),
    'concluido',      count(*) filter (where l.enriquecimento_status = 'concluido'),
    'nao_encontrado', count(*) filter (where l.enriquecimento_status = 'nao_encontrado'),
    'nao_suportado',  count(*) filter (where l.enriquecimento_status = 'nao_suportado'),
    'erro',           count(*) filter (where l.enriquecimento_status = 'erro'),
    'total',          count(*)
  )
  from public.leads l
  where l.organizacao_id = p_organizacao_id;
$$;


-- Nenhuma destas funções pode ser chamada pela API pública (seção 5, item 2).
revoke execute on function public.enfileirar_enriquecimento(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.pegar_proximo_enriquecimento(uuid, interval, integer) from public, anon, authenticated;
revoke execute on function public.reservar_enriquecimento(uuid, uuid, interval) from public, anon, authenticated;
revoke execute on function public.contar_enriquecimento(uuid) from public, anon, authenticated;

grant execute on function public.enfileirar_enriquecimento(uuid, uuid[]) to service_role;
grant execute on function public.pegar_proximo_enriquecimento(uuid, interval, integer) to service_role;
grant execute on function public.reservar_enriquecimento(uuid, uuid, interval) to service_role;
grant execute on function public.contar_enriquecimento(uuid) to service_role;
