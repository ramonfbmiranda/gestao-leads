-- Verificação das funções de conta (fase 2).
--
-- Rodar no SQL Editor do Supabase depois de aplicar as migrações.
-- Cria usuários fictícios em auth.users, testa as funções e apaga tudo no final.
-- Se algum teste falhar, aparece "FALHOU: ..." e nada fica gravado.

do $$
declare
  usuario_admin   uuid := gen_random_uuid();
  usuario_membro  uuid := gen_random_uuid();
  usuario_intruso uuid := gen_random_uuid();
  org             uuid;
  org_retorno     uuid;
  convite         uuid;
  quantidade      integer;
  nome_funcao     text;
begin
  insert into auth.users (id, email) values
    (usuario_admin,   'admin.teste.fase2@exemplo.com'),
    (usuario_membro,  'membro.teste.fase2@exemplo.com'),
    (usuario_intruso, 'intruso.teste.fase2@exemplo.com');

  -- 1. Funções não executáveis pela API pública ------------------------------
  foreach nome_funcao in array array[
    'public.criar_organizacao_com_admin(uuid, text, text)',
    'public.aceitar_convite(uuid, uuid, text, text)',
    'public.listar_membros(uuid)'
  ] loop
    if has_function_privilege('anon', nome_funcao, 'EXECUTE')
       or has_function_privilege('authenticated', nome_funcao, 'EXECUTE') then
      raise exception 'FALHOU: % executável pela API pública', nome_funcao;
    end if;
    if not has_function_privilege('service_role', nome_funcao, 'EXECUTE') then
      raise exception 'FALHOU: service_role não executa %', nome_funcao;
    end if;
  end loop;

  -- 2. Onboarding cria organização e perfil admin ----------------------------
  org := public.criar_organizacao_com_admin(usuario_admin, '  Empresa Teste  ', 'Admin');
  select count(*) into quantidade
  from public.perfis p
  join public.organizacoes o on o.id = p.organizacao_id
  where p.id = usuario_admin and p.papel = 'admin' and o.nome = 'Empresa Teste';
  if quantidade <> 1 then
    raise exception 'FALHOU: onboarding não criou organização e perfil admin';
  end if;

  -- 3. Segundo onboarding do mesmo usuário falha sem deixar organização órfã -
  select count(*) into quantidade from public.organizacoes;
  begin
    perform public.criar_organizacao_com_admin(usuario_admin, 'Outra Empresa', 'Admin');
    raise exception 'FALHOU: permitiu segundo onboarding';
  exception when unique_violation then null;
  end;
  if (select count(*) from public.organizacoes) <> quantidade then
    raise exception 'FALHOU: segundo onboarding deixou organização órfã';
  end if;

  -- 4. Convite só é aceito pelo e-mail convidado -----------------------------
  insert into public.convites (organizacao_id, email, papel, convidado_por)
  values (org, 'membro.teste.fase2@exemplo.com', 'membro', usuario_admin)
  returning id into convite;

  begin
    perform public.aceitar_convite(convite, usuario_intruso, 'intruso.teste.fase2@exemplo.com', null);
    raise exception 'FALHOU: convite aceito por outro e-mail';
  exception when no_data_found then null;
  end;

  -- 5. Aceite correto (e-mail com maiúsculas é normalizado) ------------------
  org_retorno := public.aceitar_convite(convite, usuario_membro, ' Membro.Teste.Fase2@Exemplo.com ', 'Membro');
  if org_retorno <> org then
    raise exception 'FALHOU: aceite devolveu organização errada';
  end if;
  if not exists (
    select 1 from public.convites where id = convite and status = 'aceito' and aceito_em is not null
  ) then
    raise exception 'FALHOU: convite não foi marcado como aceito';
  end if;

  -- 6. Convite já aceito não pode ser reutilizado ----------------------------
  begin
    perform public.aceitar_convite(convite, usuario_membro, 'membro.teste.fase2@exemplo.com', null);
    raise exception 'FALHOU: convite aceito duas vezes';
  exception when no_data_found then null;
  end;

  -- 7. Quem já tem perfil não aceita convite de outra organização ------------
  insert into public.convites (organizacao_id, email)
  values (org, 'admin.teste.fase2@exemplo.com')
  returning id into convite;
  begin
    perform public.aceitar_convite(convite, usuario_admin, 'admin.teste.fase2@exemplo.com', null);
    raise exception 'FALHOU: usuário com perfil aceitou outro convite';
  exception when unique_violation then null;
  end;
  if not exists (select 1 from public.convites where id = convite and status = 'pendente') then
    raise exception 'FALHOU: convite mudou de status apesar do erro';
  end if;

  -- 8. Listagem de membros com e-mail ----------------------------------------
  select count(*) into quantidade
  from public.listar_membros(org)
  where email in ('admin.teste.fase2@exemplo.com', 'membro.teste.fase2@exemplo.com');
  if quantidade <> 2 then
    raise exception 'FALHOU: listar_membros devolveu % membros (esperado 2)', quantidade;
  end if;

  -- Limpeza ------------------------------------------------------------------
  delete from public.organizacoes where id = org;
  delete from auth.users where id in (usuario_admin, usuario_membro, usuario_intruso);
end;
$$;

select 'Todos os testes da fase 2 passaram' as resultado;
