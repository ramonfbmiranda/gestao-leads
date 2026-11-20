-- Funções de conta: onboarding, aceite de convite e listagem de membros.
--
-- Cada função roda em uma única transação: ou tudo é gravado, ou nada é.
-- São chamadas apenas pelo backend (service_role); a API pública não as executa.

-- ---------------------------------------------------------------------------
-- Onboarding: cria a organização e o perfil admin do usuário juntos.
-- Se o usuário já tiver perfil, a chave primária de perfis gera unique_violation
-- e a organização recém-criada é desfeita junto (sem organizações órfãs).
-- ---------------------------------------------------------------------------
create or replace function public.criar_organizacao_com_admin(
  p_usuario_id       uuid,
  p_nome_organizacao text,
  p_nome             text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_organizacao_id uuid;
begin
  insert into public.organizacoes (nome)
  values (trim(p_nome_organizacao))
  returning id into v_organizacao_id;

  insert into public.perfis (id, organizacao_id, nome, papel)
  values (p_usuario_id, v_organizacao_id, nullif(trim(p_nome), ''), 'admin');

  return v_organizacao_id;
end;
$$;

revoke execute on function public.criar_organizacao_com_admin(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.criar_organizacao_com_admin(uuid, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Aceite de convite: cria o perfil na organização do convite e marca o convite
-- como aceito. O convite precisa estar pendente e ser do e-mail do usuário.
-- Convite inexistente/de outro e-mail: erro P0002 (no_data_found).
-- Usuário que já tem perfil: unique_violation.
-- ---------------------------------------------------------------------------
create or replace function public.aceitar_convite(
  p_convite_id uuid,
  p_usuario_id uuid,
  p_email      text,
  p_nome       text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_convite public.convites%rowtype;
begin
  -- "for update" trava o convite: dois aceites simultâneos não passam juntos.
  select * into v_convite
  from public.convites
  where id = p_convite_id
    and email = lower(trim(p_email))
    and status = 'pendente'
  for update;

  if not found then
    raise exception 'Convite não encontrado' using errcode = 'P0002';
  end if;

  insert into public.perfis (id, organizacao_id, nome, papel)
  values (p_usuario_id, v_convite.organizacao_id, nullif(trim(p_nome), ''), v_convite.papel);

  update public.convites
  set status = 'aceito', aceito_em = now()
  where id = v_convite.id;

  return v_convite.organizacao_id;
end;
$$;

revoke execute on function public.aceitar_convite(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.aceitar_convite(uuid, uuid, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Membros de uma organização, com o e-mail vindo de auth.users.
-- security definer: roda com os privilégios do dono (postgres), que pode ler
-- auth.users; o filtro por organização vem sempre do backend.
-- ---------------------------------------------------------------------------
create or replace function public.listar_membros(p_organizacao_id uuid)
returns table (
  id         uuid,
  nome       text,
  papel      text,
  email      text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nome, p.papel, u.email::text, p.created_at
  from public.perfis p
  join auth.users u on u.id = p.id
  where p.organizacao_id = p_organizacao_id
  order by p.created_at;
$$;

revoke execute on function public.listar_membros(uuid)
  from public, anon, authenticated;
grant execute on function public.listar_membros(uuid)
  to service_role;
