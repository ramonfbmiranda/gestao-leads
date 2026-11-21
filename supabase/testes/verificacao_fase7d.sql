-- Verificação da fase 7d: interações, desfechos e contatos do decisor na importação.
--
-- Rodar no SQL Editor do Supabase depois de aplicar as migrações.
-- Se algum teste falhar, aparece "FALHOU: ..." e nada fica gravado.

do $$
declare
  org_a     uuid := 'ffffffff-ffff-4fff-8fff-ffffffff7da1';
  org_b     uuid := 'ffffffff-ffff-4fff-8fff-ffffffff7db2';
  a1        uuid;
  a2        uuid;
  imp_a     uuid;
  lead      public.leads;
  contagem  jsonb;
  resultado jsonb;
  funcao    text;
begin
  -- 1. Nenhuma função executável pela API pública ---------------------------
  foreach funcao in array array[
    'public.atualizar_resumo_interacoes(uuid, uuid)',
    'public.contar_desfechos(uuid)',
    'public.importar_leads_lote(uuid, uuid, jsonb)'
  ] loop
    if has_function_privilege('anon', funcao, 'EXECUTE')
       or has_function_privilege('authenticated', funcao, 'EXECUTE') then
      raise exception 'FALHOU: % executável pela API pública', funcao;
    end if;
  end loop;

  insert into public.organizacoes (id, nome) values (org_a, 'Org A fase 7d'), (org_b, 'Org B fase 7d');
  insert into public.leads (organizacao_id, cnpj, nome_lead) values (org_a, '11222333000181', 'A1') returning id into a1;
  insert into public.leads (organizacao_id, cnpj, nome_lead) values (org_a, '01234567000195', 'A2') returning id into a2;
  insert into public.leads (organizacao_id, cnpj, nome_lead) values (org_b, '11222333000181', 'B1');

  -- 2. A interação não pode apontar para lead de outra organização -----------
  begin
    insert into public.interacoes (organizacao_id, lead_id, tipo, teve_resposta)
    values (org_b, a1, 'ligacao', false);
    raise exception 'FALHOU: interação ligada a lead de outra organização';
  exception when foreign_key_violation then null;
  end;

  -- 3. Resumo das interações -------------------------------------------------
  perform public.atualizar_resumo_interacoes(org_a, a1);
  select * into lead from public.leads where id = a1;
  if lead.ultima_interacao_em is not null or lead.tentativas_sem_resposta <> 0 then
    raise exception 'FALHOU: lead sem interações deveria ter 0 tentativas e data nula';
  end if;

  -- Sem resposta antiga, depois uma resposta, depois 3 sem resposta: contam só as 3.
  insert into public.interacoes (organizacao_id, lead_id, tipo, teve_resposta, ocorreu_em) values
    (org_a, a1, 'ligacao',  false, now() - interval '10 days'),
    (org_a, a1, 'reuniao',  true,  now() - interval '5 days'),
    (org_a, a1, 'whatsapp', false, now() - interval '3 days'),
    (org_a, a1, 'email',    false, now() - interval '2 days'),
    (org_a, a1, 'ligacao',  false, now() - interval '1 day');
  perform public.atualizar_resumo_interacoes(org_a, a1);
  select * into lead from public.leads where id = a1;
  if lead.tentativas_sem_resposta <> 3 then
    raise exception 'FALHOU: esperado 3 tentativas sem resposta, veio %', lead.tentativas_sem_resposta;
  end if;
  if lead.ultima_interacao_em is distinct from now() - interval '1 day' then
    raise exception 'FALHOU: ultima_interacao_em deveria ser a mais recente: %', lead.ultima_interacao_em;
  end if;

  -- Lead que nunca respondeu: todas contam.
  insert into public.interacoes (organizacao_id, lead_id, tipo, teve_resposta, ocorreu_em) values
    (org_a, a2, 'ligacao', false, now() - interval '2 days'),
    (org_a, a2, 'email',   false, now() - interval '1 day');
  perform public.atualizar_resumo_interacoes(org_a, a2);
  if (select tentativas_sem_resposta from public.leads where id = a2) <> 2 then
    raise exception 'FALHOU: lead sem nenhuma resposta deveria ter 2 tentativas';
  end if;

  -- Organização errada não altera o lead.
  update public.leads set tentativas_sem_resposta = 99 where id = a2;
  perform public.atualizar_resumo_interacoes(org_b, a2);
  if (select tentativas_sem_resposta from public.leads where id = a2) <> 99 then
    raise exception 'FALHOU: atualizar_resumo_interacoes alterou lead de outra organização';
  end if;

  -- Uma resposta nova zera as tentativas.
  insert into public.interacoes (organizacao_id, lead_id, tipo, teve_resposta, ocorreu_em)
  values (org_a, a1, 'ligacao', true, now() - interval '1 hour');
  perform public.atualizar_resumo_interacoes(org_a, a1);
  select * into lead from public.leads where id = a1;
  if lead.tentativas_sem_resposta <> 0 or lead.ultima_interacao_em is distinct from now() - interval '1 hour' then
    raise exception 'FALHOU: depois de uma resposta, esperado 0 tentativas e a última há 1 hora: % e %',
      lead.tentativas_sem_resposta, lead.ultima_interacao_em;
  end if;

  -- Tudo apagado: 0 e data nula.
  delete from public.interacoes where organizacao_id = org_a and lead_id = a1;
  perform public.atualizar_resumo_interacoes(org_a, a1);
  select * into lead from public.leads where id = a1;
  if lead.tentativas_sem_resposta <> 0 or lead.ultima_interacao_em is not null then
    raise exception 'FALHOU: sem interações, esperado 0 e data nula: % e %',
      lead.tentativas_sem_resposta, lead.ultima_interacao_em;
  end if;

  -- 4. Desfechos por faixa, sem misturar organizações --------------------------
  insert into public.leads (organizacao_id, cnpj, nome_lead, status, desfecho_em, desfecho_score, motivo_descarte) values
    (org_a, 'TESTE7D0000100', 'Convertido alta 1',   'convertido', now(), '{"score_detalhes": {"faixa": "alta"}}',  null),
    (org_a, 'TESTE7D0000200', 'Convertido alta 2',   'convertido', now(), '{"score_detalhes": {"faixa": "alta"}}',  null),
    (org_a, 'TESTE7D0000300', 'Descartado alta',     'descartado', now(), '{"score_detalhes": {"faixa": "alta"}}',  'Sem orçamento'),
    (org_a, 'TESTE7D0000400', 'Descartado média 1',  'descartado', now(), '{"score_detalhes": {"faixa": "media"}}', 'Sem orçamento'),
    (org_a, 'TESTE7D0000500', 'Descartado média 2',  'descartado', now(), '{"score_detalhes": {"faixa": "media"}}', 'Outro'),
    -- Sem cópia do score ou com faixa desconhecida: contam como N/A.
    (org_a, 'TESTE7D0000600', 'Convertido sem score', 'convertido', now(), null,                                     null),
    (org_a, 'TESTE7D0000700', 'Descartado faixa xyz', 'descartado', now(), '{"score_detalhes": {"faixa": "xyz"}}',  'Outro'),
    -- Não contam: sem desfecho_em, ou fora de convertido/descartado.
    (org_a, 'TESTE7D0000800', 'Convertido sem data',  'convertido', null,  '{"score_detalhes": {"faixa": "alta"}}',  null),
    (org_a, 'TESTE7D0000900', 'Voltou ao funil',      'em_contato', now(), '{"score_detalhes": {"faixa": "baixa"}}', null);
  insert into public.leads (organizacao_id, cnpj, nome_lead, status, desfecho_em, desfecho_score, motivo_descarte) values
    (org_b, 'TESTE7D0000100', 'B convertido alta',   'convertido', now(), '{"score_detalhes": {"faixa": "alta"}}',  null),
    (org_b, 'TESTE7D0000200', 'B descartado baixa',  'descartado', now(), '{"score_detalhes": {"faixa": "baixa"}}', 'Sem interesse');

  contagem := public.contar_desfechos(org_a);
  if contagem <> '{
    "faixas": {
      "alta":  {"convertidos": 2, "descartados": 1},
      "media": {"convertidos": 0, "descartados": 2},
      "baixa": {"convertidos": 0, "descartados": 0},
      "na":    {"convertidos": 1, "descartados": 1}
    },
    "motivos": {"Sem orçamento": 2, "Outro": 2}
  }'::jsonb then
    raise exception 'FALHOU: contar_desfechos da org A: %', contagem;
  end if;

  contagem := public.contar_desfechos(org_b);
  if contagem <> '{
    "faixas": {
      "alta":  {"convertidos": 1, "descartados": 0},
      "media": {"convertidos": 0, "descartados": 0},
      "baixa": {"convertidos": 0, "descartados": 1},
      "na":    {"convertidos": 0, "descartados": 0}
    },
    "motivos": {"Sem interesse": 1}
  }'::jsonb then
    raise exception 'FALHOU: contar_desfechos da org B: %', contagem;
  end if;

  -- Organização sem desfechos: as quatro faixas com zero e nenhum motivo.
  contagem := public.contar_desfechos(gen_random_uuid());
  if contagem <> '{
    "faixas": {
      "alta":  {"convertidos": 0, "descartados": 0},
      "media": {"convertidos": 0, "descartados": 0},
      "baixa": {"convertidos": 0, "descartados": 0},
      "na":    {"convertidos": 0, "descartados": 0}
    },
    "motivos": {}
  }'::jsonb then
    raise exception 'FALHOU: contar_desfechos sem desfechos: %', contagem;
  end if;

  -- 5. Importação grava e-mail e LinkedIn do decisor sem apagar com célula vazia
  insert into public.importacoes (organizacao_id) values (org_a) returning id into imp_a;
  resultado := public.importar_leads_lote(org_a, imp_a, '[
    {"cnpj": "TESTE7D0001000", "nome_lead": "Importado",
     "email_decisor": "ana@exemplo.com", "linkedin_decisor": "https://linkedin.com/in/ana"}
  ]'::jsonb);
  if resultado <> '{"inseridos": 1, "atualizados": 0}'::jsonb then
    raise exception 'FALHOU: importação devolveu %', resultado;
  end if;

  resultado := public.importar_leads_lote(org_a, imp_a, '[
    {"cnpj": "TESTE7D0001000", "nome_lead": "Importado de novo"},
    {"cnpj": "TESTE7D0000300", "nome_lead": "Descartado reimportado", "email_decisor": "carla@exemplo.com"}
  ]'::jsonb);
  if resultado <> '{"inseridos": 0, "atualizados": 2}'::jsonb then
    raise exception 'FALHOU: reimportação devolveu %', resultado;
  end if;

  select * into lead from public.leads where organizacao_id = org_a and cnpj = 'TESTE7D0001000';
  if lead.email_decisor is distinct from 'ana@exemplo.com'
     or lead.linkedin_decisor is distinct from 'https://linkedin.com/in/ana' then
    raise exception 'FALHOU: célula vazia apagou o contato do decisor: % / %', lead.email_decisor, lead.linkedin_decisor;
  end if;

  select * into lead from public.leads where organizacao_id = org_a and cnpj = 'TESTE7D0000300';
  if lead.email_decisor is distinct from 'carla@exemplo.com' then
    raise exception 'FALHOU: reimportação não gravou o e-mail do decisor';
  end if;
  if lead.status <> 'descartado' or lead.desfecho_em is null or lead.motivo_descarte is distinct from 'Sem orçamento'
     or lead.desfecho_score is distinct from '{"score_detalhes": {"faixa": "alta"}}'::jsonb then
    raise exception 'FALHOU: importação mexeu no status ou no desfecho';
  end if;

  -- Limpeza ------------------------------------------------------------------
  delete from public.organizacoes where id in (org_a, org_b);
end;
$$;

select 'Todos os testes da fase 7d passaram' as resultado;
