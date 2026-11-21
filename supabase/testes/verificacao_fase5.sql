-- Verificação da fase 5: gravação do score em lote.
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
  -- 1. Não executável pela API pública --------------------------------------
  if has_function_privilege('anon', 'public.gravar_scores(uuid, jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.gravar_scores(uuid, jsonb)', 'EXECUTE') then
    raise exception 'FALHOU: gravar_scores executável pela API pública';
  end if;

  insert into public.organizacoes (nome) values ('Org fase 5') returning id into org;
  insert into public.organizacoes (nome) values ('Outra org fase 5') returning id into outra_org;
  insert into public.leads (organizacao_id, cnpj, nome_lead) values (org, '11222333000181', 'A') returning id into lead_a;
  insert into public.leads (organizacao_id, cnpj, nome_lead) values (outra_org, '11222333000181', 'B') returning id into lead_b;

  -- 2. Grava só nos leads da organização informada --------------------------
  total := public.gravar_scores(org, jsonb_build_array(
    jsonb_build_object('id', lead_a, 'score_valor', null, 'score_probabilidade', 70,
      'score_esforco', 40, 'score_compensacao', 50, 'score_parcial', true,
      'score_detalhes', '{"formula": "pilar_unico"}'::jsonb),
    jsonb_build_object('id', lead_b, 'score_compensacao', 99)
  ));
  if total <> 1 then
    raise exception 'FALHOU: esperado 1 lead atualizado, veio %', total;
  end if;

  select * into lead from public.leads where id = lead_a;
  if lead.score_valor is not null or lead.score_compensacao <> 50 or not lead.score_parcial
     or lead.score_calculado_em is null or lead.score_detalhes ->> 'formula' <> 'pilar_unico' then
    raise exception 'FALHOU: score gravado errado';
  end if;
  if (select score_compensacao from public.leads where id = lead_b) is not null then
    raise exception 'FALHOU: gravou score em lead de outra organização';
  end if;

  -- 3. Valor fora de 0 a 100 é recusado pelo banco --------------------------
  begin
    perform public.gravar_scores(org, jsonb_build_array(jsonb_build_object('id', lead_a, 'score_compensacao', 101)));
    raise exception 'FALHOU: aceitou score acima de 100';
  exception when check_violation then null;
  end;

  -- Limpeza ------------------------------------------------------------------
  delete from public.organizacoes where id in (org, outra_org);
end;
$$;

select 'Todos os testes da fase 5 passaram' as resultado;
