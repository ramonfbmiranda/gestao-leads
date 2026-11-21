-- Verificação da fase 7b: colunas da revisão 7, interações e gravação da confiança.
--
-- Rodar no SQL Editor do Supabase depois de aplicar as migrações.
-- Se algum teste falhar, aparece "FALHOU: ..." e nada fica gravado.

do $$
declare
  org       uuid;
  outra_org uuid;
  lead_a    uuid;
  lead_b    uuid;
  total     integer;
  lead      public.leads;
begin
  -- 1. gravar_scores continua fora da API pública ----------------------------
  if has_function_privilege('anon', 'public.gravar_scores(uuid, jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.gravar_scores(uuid, jsonb)', 'EXECUTE') then
    raise exception 'FALHOU: gravar_scores executável pela API pública';
  end if;

  -- 2. Tabela interacoes com RLS e sem acesso pela API pública ---------------
  if not (select relrowsecurity from pg_class where oid = 'public.interacoes'::regclass) then
    raise exception 'FALHOU: RLS desligado em interacoes';
  end if;
  if has_table_privilege('anon', 'public.interacoes', 'SELECT')
     or has_table_privilege('authenticated', 'public.interacoes', 'SELECT') then
    raise exception 'FALHOU: interacoes acessível pela API pública';
  end if;

  -- 3. Configurações antigas foram convertidas -------------------------------
  if exists (
    select 1 from public.organizacoes
    where config_score #> '{valor,cnaes_prioritarios}' is not null
       or config_score #> '{valor,pesos,cnae}' is not null
       or config_score #> '{esforco,sem_numero_decisor}' is not null
  ) then
    raise exception 'FALHOU: ainda há config_score com chaves anteriores à revisão 7';
  end if;

  insert into public.organizacoes (nome) values ('Org fase 7b') returning id into org;
  insert into public.organizacoes (nome) values ('Outra org fase 7b') returning id into outra_org;
  insert into public.leads (organizacao_id, cnpj, nome_lead) values (org, '11222333000181', 'A') returning id into lead_a;
  insert into public.leads (organizacao_id, cnpj, nome_lead) values (outra_org, '11222333000181', 'B') returning id into lead_b;

  -- 4. Colunas novas aceitam os formatos do contrato -------------------------
  update public.leads set
    email_decisor = 'ana@empresa.com.br',
    linkedin_decisor = 'https://linkedin.com/in/ana',
    telefone_receita = '1133334444',
    email_receita = 'contato@empresa.com.br',
    socios = '[{"nome": "ANA LIMA", "qualificacao": "Sócio-Administrador"}]'::jsonb,
    avaliacao = '{"respostas": {"orcamento": "confirmado"}}'::jsonb,
    ticket_estimado = 15000,
    avaliado_em = now()
  where id = lead_a;
  select * into lead from public.leads where id = lead_a;
  if lead.tentativas_sem_resposta <> 0 or lead.avaliacao #>> '{respostas,orcamento}' <> 'confirmado' then
    raise exception 'FALHOU: colunas novas gravadas errado';
  end if;

  -- 5. Limites das colunas novas ----------------------------------------------
  begin
    update public.leads set telefone_receita = '11 3333-4444' where id = lead_a;
    raise exception 'FALHOU: aceitou telefone da Receita com máscara';
  exception when check_violation then null;
  end;
  begin
    update public.leads set ticket_estimado = -1 where id = lead_a;
    raise exception 'FALHOU: aceitou ticket negativo';
  exception when check_violation then null;
  end;
  begin
    update public.leads set socios = '{"nome": "x"}'::jsonb where id = lead_a;
    raise exception 'FALHOU: aceitou sócios fora de uma lista';
  exception when check_violation then null;
  end;
  begin
    update public.leads set tentativas_sem_resposta = -1 where id = lead_a;
    raise exception 'FALHOU: aceitou tentativas negativas';
  exception when check_violation then null;
  end;

  -- 6. gravar_scores grava a confiança, só na organização --------------------
  total := public.gravar_scores(org, jsonb_build_array(
    jsonb_build_object('id', lead_a, 'score_compensacao', 50, 'score_confianca', 76.92,
      'score_parcial', true, 'score_detalhes', '{"versao": 2}'::jsonb),
    jsonb_build_object('id', lead_b, 'score_confianca', 99)
  ));
  if total <> 1 then
    raise exception 'FALHOU: esperado 1 lead atualizado, veio %', total;
  end if;
  if (select score_confianca from public.leads where id = lead_a) <> 76.92 then
    raise exception 'FALHOU: confiança não gravada';
  end if;
  if (select score_confianca from public.leads where id = lead_b) is not null then
    raise exception 'FALHOU: gravou confiança em lead de outra organização';
  end if;
  begin
    perform public.gravar_scores(org, jsonb_build_array(jsonb_build_object('id', lead_a, 'score_confianca', 101)));
    raise exception 'FALHOU: aceitou confiança acima de 100';
  exception when check_violation then null;
  end;

  -- 7. Interação só liga a lead da mesma organização -------------------------
  insert into public.interacoes (organizacao_id, lead_id, tipo, teve_resposta) values (org, lead_a, 'ligacao', false);
  begin
    insert into public.interacoes (organizacao_id, lead_id, tipo, teve_resposta) values (org, lead_b, 'ligacao', false);
    raise exception 'FALHOU: interação ligada a lead de outra organização';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.interacoes (organizacao_id, lead_id, tipo, teve_resposta) values (org, lead_a, 'telegrama', true);
    raise exception 'FALHOU: aceitou tipo de interação inválido';
  exception when check_violation then null;
  end;

  -- 8. Excluir o lead apaga as interações dele -------------------------------
  delete from public.leads where id = lead_a;
  if exists (select 1 from public.interacoes where lead_id = lead_a) then
    raise exception 'FALHOU: interações sobraram depois de excluir o lead';
  end if;

  -- Limpeza ------------------------------------------------------------------
  delete from public.organizacoes where id in (org, outra_org);
end;
$$;

select 'Todos os testes da fase 7b passaram' as resultado;
