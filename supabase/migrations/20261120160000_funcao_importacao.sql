-- Importação de planilhas: grava um lote de leads numa única transação.
--
-- O backend valida e normaliza cada linha antes (CNPJ, notas, textos) e chama
-- esta função em lotes de cerca de 500 leads. Regras (especificação, seção 7):
--   - upsert por (organizacao_id, cnpj);
--   - campo ausente no JSON (célula vazia) não apaga o valor existente;
--   - dados de enriquecimento, score e status nunca são tocados;
--   - responsáveis são criados pelo nome se ainda não existirem;
--   - links de redes sociais são acrescentados (os existentes ficam);
--   - dados_extras é mesclado: colunas novas entram, as antigas ficam.
--
-- Formato de cada item de p_leads:
--   { cnpj, nome_lead, link_cnpj?, nome_decisor?, numero_decisor?, redes_sociais?,
--     calculadora_icp?, calculadora_midias_sociais?, nota_final?, responsavel_nome?,
--     dados_extras: {...}, originais: { campo: "texto original" | null },
--     redes: [{ plataforma, url }] }
-- Em "originais", null remove a chave (a nota deixou de vir convertida).

create function public.importar_leads_lote(
  p_organizacao_id uuid,
  p_importacao_id  uuid,
  p_leads          jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_lead        jsonb;
  v_id          uuid;
  v_responsavel uuid;
  v_extras      jsonb;
  v_originais   jsonb;
  v_inseridos   integer := 0;
  v_atualizados integer := 0;
begin
  for v_lead in select value from jsonb_array_elements(p_leads) loop
    v_responsavel := null;
    if v_lead ->> 'responsavel_nome' is not null then
      insert into public.responsaveis (organizacao_id, nome)
      values (p_organizacao_id, v_lead ->> 'responsavel_nome')
      on conflict (organizacao_id, (lower(nome))) do nothing;

      select id into v_responsavel
      from public.responsaveis
      where organizacao_id = p_organizacao_id
        and lower(nome) = lower(v_lead ->> 'responsavel_nome');
    end if;

    v_extras    := coalesce(v_lead -> 'dados_extras', '{}'::jsonb);
    v_originais := coalesce(v_lead -> 'originais', '{}'::jsonb);

    insert into public.leads (
      organizacao_id, cnpj, nome_lead, link_cnpj, nome_decisor, numero_decisor,
      redes_sociais, calculadora_icp, calculadora_midias_sociais, nota_final,
      responsavel_id, dados_extras, ultima_importacao_id
    )
    values (
      p_organizacao_id,
      v_lead ->> 'cnpj',
      v_lead ->> 'nome_lead',
      v_lead ->> 'link_cnpj',
      v_lead ->> 'nome_decisor',
      v_lead ->> 'numero_decisor',
      v_lead ->> 'redes_sociais',
      (v_lead ->> 'calculadora_icp')::numeric,
      (v_lead ->> 'calculadora_midias_sociais')::numeric,
      (v_lead ->> 'nota_final')::numeric,
      v_responsavel,
      v_extras || coalesce(
        nullif(jsonb_build_object('originais', jsonb_strip_nulls(v_originais)), '{"originais": {}}'::jsonb),
        '{}'::jsonb
      ),
      p_importacao_id
    )
    on conflict (organizacao_id, cnpj) do nothing
    returning id into v_id;

    if v_id is not null then
      v_inseridos := v_inseridos + 1;
    else
      update public.leads l set
        nome_lead                  = coalesce(v_lead ->> 'nome_lead', l.nome_lead),
        link_cnpj                  = coalesce(v_lead ->> 'link_cnpj', l.link_cnpj),
        nome_decisor               = coalesce(v_lead ->> 'nome_decisor', l.nome_decisor),
        numero_decisor             = coalesce(v_lead ->> 'numero_decisor', l.numero_decisor),
        redes_sociais              = coalesce(v_lead ->> 'redes_sociais', l.redes_sociais),
        calculadora_icp            = coalesce((v_lead ->> 'calculadora_icp')::numeric, l.calculadora_icp),
        calculadora_midias_sociais = coalesce((v_lead ->> 'calculadora_midias_sociais')::numeric, l.calculadora_midias_sociais),
        nota_final                 = coalesce((v_lead ->> 'nota_final')::numeric, l.nota_final),
        responsavel_id             = coalesce(v_responsavel, l.responsavel_id),
        dados_extras               = (l.dados_extras - 'originais') || v_extras || coalesce(
          nullif(
            jsonb_build_object(
              'originais',
              jsonb_strip_nulls(coalesce(l.dados_extras -> 'originais', '{}'::jsonb) || v_originais)
            ),
            '{"originais": {}}'::jsonb
          ),
          '{}'::jsonb
        ),
        ultima_importacao_id       = p_importacao_id
      where l.organizacao_id = p_organizacao_id
        and l.cnpj = v_lead ->> 'cnpj'
      returning l.id into v_id;
      v_atualizados := v_atualizados + 1;
    end if;

    insert into public.lead_redes_sociais (lead_id, plataforma, url)
    select v_id, rede ->> 'plataforma', rede ->> 'url'
    from jsonb_array_elements(coalesce(v_lead -> 'redes', '[]'::jsonb)) rede
    on conflict (lead_id, url) do nothing;
  end loop;

  return jsonb_build_object('inseridos', v_inseridos, 'atualizados', v_atualizados);
end;
$$;

revoke execute on function public.importar_leads_lote(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.importar_leads_lote(uuid, uuid, jsonb) to service_role;
