-- Verificação do banco (fase 1).
--
-- Rodar no SQL Editor do Supabase depois de aplicar as migrações.
-- Tudo acontece dentro de um único bloco: se algum teste falhar, aparece um erro
-- "FALHOU: ..." e nada fica gravado. Se tudo passar, os dados de teste são
-- apagados no final e o resultado mostra "Todos os testes da fase 1 passaram".

do $$
declare
  org_a      uuid;
  org_b      uuid;
  resp_a     uuid;
  resp_b     uuid;
  lead_a     uuid;
  tabela     text;
  quantidade integer;
  data_lida  timestamptz;
begin
  -- 1. RLS ligado em todas as tabelas do schema public -----------------------
  for tabela in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    raise exception 'FALHOU: RLS desligado na tabela %', tabela;
  end loop;

  -- 2. anon e authenticated sem nenhum privilégio nas tabelas ----------------
  for tabela in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
        or has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE'))
  loop
    raise exception 'FALHOU: anon/authenticated têm privilégio na tabela %', tabela;
  end loop;

  -- 3. service_role (backend) com acesso -------------------------------------
  if not has_table_privilege('service_role', 'public.leads', 'SELECT')
     or not has_table_privilege('service_role', 'public.leads', 'DELETE') then
    raise exception 'FALHOU: service_role sem acesso à tabela leads';
  end if;

  -- 4. Funções do schema public não executáveis pela API pública -------------
  for tabela in
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  loop
    raise exception 'FALHOU: função % executável por anon/authenticated', tabela;
  end loop;

  -- Dados de teste ------------------------------------------------------------
  -- Nome de organização pode repetir.
  insert into public.organizacoes (nome) values ('Teste Fase 1') returning id into org_a;
  insert into public.organizacoes (nome) values ('Teste Fase 1') returning id into org_b;

  insert into public.responsaveis (organizacao_id, nome) values (org_a, 'Ana') returning id into resp_a;
  insert into public.responsaveis (organizacao_id, nome) values (org_b, 'Bruno') returning id into resp_b;

  -- 5. CNPJ alfanumérico (exemplo oficial da Receita) e numérico antigo -------
  insert into public.leads (organizacao_id, cnpj, nome_lead, responsavel_id)
  values (org_a, '12ABC34501DE35', 'Lead Alfanumérico', resp_a)
  returning id into lead_a;

  insert into public.leads (organizacao_id, cnpj, nome_lead)
  values (org_a, '11222333000181', 'Lead Numérico');

  -- 6. Mesmo CNPJ em outra organização é permitido ---------------------------
  insert into public.leads (organizacao_id, cnpj, nome_lead)
  values (org_b, '12ABC34501DE35', 'Mesmo CNPJ, outra empresa');

  -- 7. Formatos de CNPJ inválidos são recusados ------------------------------
  begin
    insert into public.leads (organizacao_id, cnpj, nome_lead) values (org_a, '12abc34501de35', 'x');
    raise exception 'FALHOU: aceitou CNPJ em minúsculas';
  exception when check_violation then null;
  end;

  begin
    insert into public.leads (organizacao_id, cnpj, nome_lead) values (org_a, '12ABC34501DEAB', 'x');
    raise exception 'FALHOU: aceitou dígitos verificadores com letra';
  exception when check_violation then null;
  end;

  begin
    insert into public.leads (organizacao_id, cnpj, nome_lead) values (org_a, '12.ABC.345/01D', 'x');
    raise exception 'FALHOU: aceitou CNPJ com pontuação';
  exception when check_violation then null;
  end;

  begin
    insert into public.leads (organizacao_id, cnpj, nome_lead) values (org_a, '12ABC345', 'x');
    raise exception 'FALHOU: aceitou CNPJ curto';
  exception when check_violation then null;
  end;

  begin
    insert into public.leads (organizacao_id, cnpj, nome_lead) values (org_a, '12ABC34501DE3500', 'x');
    raise exception 'FALHOU: aceitou CNPJ longo';
  exception when string_data_right_truncation then null;
  end;

  begin
    insert into public.leads (organizacao_id, cnpj, nome_lead) values (org_a, '00000000000000', 'x');
    raise exception 'FALHOU: aceitou CNPJ com caractere repetido';
  exception when check_violation then null;
  end;

  -- 8. CNPJ duplicado na mesma organização é recusado ------------------------
  begin
    insert into public.leads (organizacao_id, cnpj, nome_lead) values (org_a, '12ABC34501DE35', 'x');
    raise exception 'FALHOU: aceitou CNPJ duplicado na mesma organização';
  exception when unique_violation then null;
  end;

  -- 9. Lead não pode apontar para responsável de outra organização -----------
  begin
    update public.leads set responsavel_id = resp_b where id = lead_a;
    raise exception 'FALHOU: aceitou responsável de outra organização';
  exception when foreign_key_violation then null;
  end;

  -- 10. Score fora de 0-100, UF inválida e status fora do ENUM ---------------
  begin
    update public.leads set score_compensacao = 150 where id = lead_a;
    raise exception 'FALHOU: aceitou score acima de 100';
  exception when check_violation then null;
  end;

  begin
    update public.leads set uf = 'sp' where id = lead_a;
    raise exception 'FALHOU: aceitou UF em minúsculas';
  exception when check_violation then null;
  end;

  begin
    update public.leads set status = 'perdido' where id = lead_a;
    raise exception 'FALHOU: aceitou status fora do ENUM';
  exception when invalid_text_representation then null;
  end;

  -- 11. Trigger de updated_at ------------------------------------------------
  alter table public.leads disable trigger leads_set_updated_at;
  update public.leads set updated_at = '2000-01-01' where id = lead_a;
  alter table public.leads enable trigger leads_set_updated_at;

  update public.leads set status = 'em_contato' where id = lead_a;
  select updated_at into data_lida from public.leads where id = lead_a;
  if data_lida <> now() then
    raise exception 'FALHOU: trigger não atualizou updated_at (valor: %)', data_lida;
  end if;

  -- 12. Excluir responsável zera só responsavel_id ---------------------------
  delete from public.responsaveis where id = resp_a;
  select count(*) into quantidade
  from public.leads
  where id = lead_a and responsavel_id is null and organizacao_id = org_a;
  if quantidade <> 1 then
    raise exception 'FALHOU: exclusão do responsável não preservou o lead corretamente';
  end if;

  -- 13. Um convite pendente por e-mail e organização -------------------------
  insert into public.convites (organizacao_id, email) values (org_a, 'pessoa@exemplo.com');
  begin
    insert into public.convites (organizacao_id, email) values (org_a, 'pessoa@exemplo.com');
    raise exception 'FALHOU: aceitou dois convites pendentes para o mesmo e-mail';
  exception when unique_violation then null;
  end;
  update public.convites set status = 'cancelado' where organizacao_id = org_a;
  insert into public.convites (organizacao_id, email) values (org_a, 'pessoa@exemplo.com');

  begin
    insert into public.convites (organizacao_id, email) values (org_a, 'Pessoa@Exemplo.com');
    raise exception 'FALHOU: aceitou e-mail com maiúsculas';
  exception when check_violation then null;
  end;

  -- 14. Excluir a organização apaga tudo dela (cascata) ----------------------
  delete from public.organizacoes where id in (org_a, org_b);
  select count(*) into quantidade from public.leads where organizacao_id in (org_a, org_b);
  if quantidade <> 0 then
    raise exception 'FALHOU: exclusão da organização não apagou os leads';
  end if;
end;
$$;

select 'Todos os testes da fase 1 passaram' as resultado;
