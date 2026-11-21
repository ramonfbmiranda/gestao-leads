-- Verificação da fase 4: função de importação em lote.
--
-- Rodar no SQL Editor do Supabase depois de aplicar as migrações.
-- Se algum teste falhar, aparece "FALHOU: ..." e nada fica gravado.

do $$
declare
  org         uuid;
  outra_org   uuid;
  imp1        uuid;
  imp2        uuid;
  resultado   jsonb;
  lead        public.leads;
  quantidade  integer;
begin
  -- 1. Não executável pela API pública --------------------------------------
  if has_function_privilege('anon', 'public.importar_leads_lote(uuid, uuid, jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.importar_leads_lote(uuid, uuid, jsonb)', 'EXECUTE') then
    raise exception 'FALHOU: importar_leads_lote executável pela API pública';
  end if;

  insert into public.organizacoes (nome) values ('Org fase 4') returning id into org;
  insert into public.organizacoes (nome) values ('Outra org fase 4') returning id into outra_org;
  insert into public.importacoes (organizacao_id) values (org) returning id into imp1;
  insert into public.importacoes (organizacao_id) values (org) returning id into imp2;

  -- 2. Primeira importação: insere e cria responsável -----------------------
  resultado := public.importar_leads_lote(org, imp1, '[
    {"cnpj": "12ABC34501DE35", "nome_lead": "Padaria", "nota_final": 7.5,
     "nome_decisor": "Carlos", "responsavel_nome": "Ana Souza",
     "dados_extras": {"Cidade": "Campinas"}, "originais": {"nota_final": "B"},
     "redes": [{"plataforma": "instagram", "url": "https://instagram.com/padaria"}]},
    {"cnpj": "11222333000181", "nome_lead": "Mercado", "responsavel_nome": "ana souza",
     "dados_extras": {}, "originais": {}, "redes": []}
  ]'::jsonb);
  if resultado <> '{"inseridos": 2, "atualizados": 0}'::jsonb then
    raise exception 'FALHOU: primeira importação devolveu %', resultado;
  end if;
  select count(*) into quantidade from public.responsaveis where organizacao_id = org;
  if quantidade <> 1 then
    raise exception 'FALHOU: "Ana Souza" e "ana souza" viraram % responsáveis', quantidade;
  end if;

  -- Simula enriquecimento e mudança de status feitos depois da importação.
  update public.leads set status = 'qualificado', razao_social = 'PADARIA LTDA', score_compensacao = 80
  where organizacao_id = org and cnpj = '12ABC34501DE35';

  -- 3. Reimportação: atualiza sem apagar ------------------------------------
  resultado := public.importar_leads_lote(org, imp2, '[
    {"cnpj": "12ABC34501DE35", "nome_lead": "Padaria Nova", "nota_final": 8,
     "dados_extras": {"Segmento": "Alimentos"}, "originais": {"nota_final": null},
     "redes": [{"plataforma": "instagram", "url": "https://instagram.com/padaria"},
               {"plataforma": "site", "url": "https://padaria.com.br"}]}
  ]'::jsonb);
  if resultado <> '{"inseridos": 0, "atualizados": 1}'::jsonb then
    raise exception 'FALHOU: reimportação devolveu %', resultado;
  end if;

  select * into lead from public.leads where organizacao_id = org and cnpj = '12ABC34501DE35';
  if lead.nome_lead <> 'Padaria Nova' or lead.nota_final <> 8 then
    raise exception 'FALHOU: reimportação não atualizou os campos enviados';
  end if;
  if lead.nome_decisor is distinct from 'Carlos' or lead.responsavel_id is null then
    raise exception 'FALHOU: célula vazia apagou valor existente';
  end if;
  if lead.status <> 'qualificado' or lead.razao_social <> 'PADARIA LTDA' or lead.score_compensacao <> 80 then
    raise exception 'FALHOU: importação mexeu em status, enriquecimento ou score';
  end if;
  if lead.dados_extras <> '{"Cidade": "Campinas", "Segmento": "Alimentos"}'::jsonb then
    raise exception 'FALHOU: dados_extras mesclado errado: %', lead.dados_extras;
  end if;
  if lead.ultima_importacao_id <> imp2 then
    raise exception 'FALHOU: ultima_importacao_id não atualizado';
  end if;
  select count(*) into quantidade from public.lead_redes_sociais where lead_id = lead.id;
  if quantidade <> 2 then
    raise exception 'FALHOU: esperado 2 links acrescentados, veio %', quantidade;
  end if;

  -- 4. Importação de outra organização não toca nesta -----------------------
  begin
    perform public.importar_leads_lote(outra_org, imp1, '[{"cnpj": "11222333000181", "nome_lead": "X"}]'::jsonb);
    raise exception 'FALHOU: aceitou importação de outra organização';
  exception when foreign_key_violation then null;
  end;

  -- 5. Lote com linha inválida é desfeito por inteiro -----------------------
  begin
    perform public.importar_leads_lote(org, imp2, '[
      {"cnpj": "00191000000191", "nome_lead": "Novo"},
      {"cnpj": "invalido", "nome_lead": "Quebrado"}
    ]'::jsonb);
    raise exception 'FALHOU: aceitou CNPJ inválido';
  exception when check_violation or string_data_right_truncation then null;
  end;
  if exists (select 1 from public.leads where organizacao_id = org and cnpj = '00191000000191') then
    raise exception 'FALHOU: lote com erro gravou parte dos leads';
  end if;

  -- Limpeza ------------------------------------------------------------------
  delete from public.organizacoes where id in (org, outra_org);
end;
$$;

select 'Todos os testes da fase 4 passaram' as resultado;
