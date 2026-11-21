-- Verificação da fase 11: resumo do dashboard (resumo_dashboard).
--
-- Rodar no SQL Editor do Supabase depois de aplicar as migrações.
-- Se algum teste falhar, aparece "FALHOU: ..." e nada fica gravado.

do $$
declare
  org_a  uuid := 'ffffffff-ffff-4fff-8fff-ffffffff11a1';
  org_b  uuid := 'ffffffff-ffff-4fff-8fff-ffffffff11b2';
  resp   uuid;
  resumo jsonb;
begin
  -- 1. Não executável pela API pública --------------------------------------
  if has_function_privilege('anon', 'public.resumo_dashboard(uuid, numeric, numeric)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.resumo_dashboard(uuid, numeric, numeric)', 'EXECUTE') then
    raise exception 'FALHOU: resumo_dashboard executável pela API pública';
  end if;

  insert into public.organizacoes (id, nome) values (org_a, 'Org A fase 11'), (org_b, 'Org B fase 11');
  insert into public.responsaveis (organizacao_id, nome) values (org_a, 'Bruno') returning id into resp;

  insert into public.leads
    (organizacao_id, cnpj, nome_lead, status, score_compensacao, score_parcial, enriquecimento_status,
     responsavel_id, ultima_mudanca_receita, desfecho_em, motivo_descarte)
  values
    (org_a, 'TESTE110000100', 'L1 alto',        'novo',        85,    false, 'concluido',      resp,
     '{"em": "2026-11-20T10:00:00.000Z", "mudancas": [{"campo": "porte", "de": "MICRO EMPRESA", "para": "DEMAIS"}]}', null, null),
    (org_a, 'TESTE110000200', 'L2 alto parcial', 'em_contato', 72.5,  true,  'pendente',       null, null, null, null),
    (org_a, 'TESTE110000300', 'L3 medio',        'qualificado', 55,   false, 'processando',    null, null, null, null),
    (org_a, 'TESTE110000400', 'L4 baixo',        'novo',        39.99, false, 'erro',          null, null, null, null),
    (org_a, 'TESTE110000500', 'L5 sem score',    'novo',        null,  false, null,            null, null, null, null),
    -- Com desfecho: entram no total, no status e no enriquecimento, mas não no potencial.
    (org_a, 'TESTE110000600', 'L6 convertido',   'convertido',  95,    false, 'concluido',     null, null, now(), null),
    (org_a, 'TESTE110000700', 'L7 descartado',   'descartado',  10,    false, 'nao_encontrado', null,
     '{"em": "2026-11-21T09:00:00.000Z", "mudancas": [{"campo": "situacao_cadastral", "de": "ATIVA", "para": "BAIXADA"}]}', now(), 'Outro'),
    (org_a, 'TESTE110000800', 'L8 cem',          'novo',        100,   false, null,            null, null, null, null),
    (org_a, 'TESTE110000900', 'L9 zero',         'novo',        0,     false, null,            null, null, null, null);

  -- Outra organização: não pode aparecer em nada.
  insert into public.leads (organizacao_id, cnpj, nome_lead, status, score_compensacao, enriquecimento_status)
  values (org_b, 'TESTE110000100', 'B1', 'novo', 99, 'concluido');

  resumo := public.resumo_dashboard(org_a, 70, 40);

  -- 2. Totais e status --------------------------------------------------------
  if (resumo ->> 'total')::int <> 9 or (resumo ->> 'em_aberto')::int <> 7 then
    raise exception 'FALHOU: total/em_aberto: % / %', resumo ->> 'total', resumo ->> 'em_aberto';
  end if;
  if resumo -> 'por_status' <> '{"novo": 5, "em_contato": 1, "qualificado": 1, "convertido": 1, "descartado": 1}'::jsonb then
    raise exception 'FALHOU: por_status: %', resumo -> 'por_status';
  end if;

  -- 3. Potencial dos leads em aberto -----------------------------------------
  -- (85 + 72,5 + 55 + 39,99 + 100 + 0) / 6 = 58,748 → 58,7
  if (resumo ->> 'media_potencial')::numeric <> 58.7 or (resumo ->> 'com_potencial')::int <> 6
     or (resumo ->> 'parciais')::int <> 1 then
    raise exception 'FALHOU: média/com_potencial/parciais: % / % / %',
      resumo ->> 'media_potencial', resumo ->> 'com_potencial', resumo ->> 'parciais';
  end if;
  if resumo -> 'por_faixa' <> '{"alta": 3, "media": 1, "baixa": 2, "na": 1}'::jsonb then
    raise exception 'FALHOU: por_faixa: %', resumo -> 'por_faixa';
  end if;

  -- Os limites vêm do parâmetro: com alta em 90, só o 100 é alto.
  if public.resumo_dashboard(org_a, 90, 40) -> 'por_faixa' <> '{"alta": 1, "media": 3, "baixa": 2, "na": 1}'::jsonb then
    raise exception 'FALHOU: faixas não seguem os limites recebidos';
  end if;

  -- 4. Distribuição em blocos de 10 (o 100 cai no bloco 90) -------------------
  if resumo -> 'distribuicao' <> '[
    {"de": 0,  "total": 1, "parciais": 0}, {"de": 10, "total": 0, "parciais": 0},
    {"de": 20, "total": 0, "parciais": 0}, {"de": 30, "total": 1, "parciais": 0},
    {"de": 40, "total": 0, "parciais": 0}, {"de": 50, "total": 1, "parciais": 0},
    {"de": 60, "total": 0, "parciais": 0}, {"de": 70, "total": 1, "parciais": 1},
    {"de": 80, "total": 1, "parciais": 0}, {"de": 90, "total": 1, "parciais": 0}
  ]'::jsonb then
    raise exception 'FALHOU: distribuicao: %', resumo -> 'distribuicao';
  end if;

  -- 5. Enriquecimento (todos os leads) ----------------------------------------
  if resumo -> 'enriquecimento' <> '{"concluido": 2, "na_fila": 2, "sem_resultado": 2, "nunca": 3}'::jsonb then
    raise exception 'FALHOU: enriquecimento: %', resumo -> 'enriquecimento';
  end if;

  -- 6. Ranking: só em aberto com potencial, do maior para o menor --------------
  if jsonb_array_length(resumo -> 'top') <> 6
     or resumo -> 'top' -> 0 ->> 'nome_lead' <> 'L8 cem'
     or resumo -> 'top' -> 1 ->> 'nome_lead' <> 'L1 alto'
     or resumo -> 'top' -> 5 ->> 'nome_lead' <> 'L9 zero' then
    raise exception 'FALHOU: top: %', resumo -> 'top';
  end if;
  if resumo -> 'top' -> 1 -> 'responsavel' <> jsonb_build_object('id', resp, 'nome', 'Bruno')
     or jsonb_typeof(resumo -> 'top' -> 0 -> 'responsavel') <> 'null' then
    raise exception 'FALHOU: responsável no top: %', resumo -> 'top';
  end if;

  -- 7. Mudanças na Receita: a mais recente primeiro (inclui leads com desfecho)
  if jsonb_array_length(resumo -> 'mudancas_receita') <> 2
     or resumo -> 'mudancas_receita' -> 0 ->> 'nome_lead' <> 'L7 descartado'
     or resumo -> 'mudancas_receita' -> 1 -> 'mudancas' -> 0 ->> 'campo' <> 'porte' then
    raise exception 'FALHOU: mudancas_receita: %', resumo -> 'mudancas_receita';
  end if;

  -- 8. Organização sem leads ---------------------------------------------------
  resumo := public.resumo_dashboard(gen_random_uuid(), 70, 40);
  if (resumo ->> 'total')::int <> 0 or resumo -> 'media_potencial' <> 'null'::jsonb
     or resumo -> 'top' <> '[]'::jsonb or resumo -> 'mudancas_receita' <> '[]'::jsonb
     or jsonb_array_length(resumo -> 'distribuicao') <> 10 then
    raise exception 'FALHOU: organização vazia: %', resumo;
  end if;

  -- Limpeza ------------------------------------------------------------------
  delete from public.organizacoes where id in (org_a, org_b);
end;
$$;

select 'Todos os testes da fase 11 passaram' as resultado;
