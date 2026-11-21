-- Verificação da fase 7c: reconsulta periódica dos dados da Receita.
--
-- Rodar no SQL Editor do Supabase depois de aplicar as migrações.
-- Se algum teste falhar, aparece "FALHOU: ..." e nada fica gravado.

do $$
declare
  org           uuid;
  outra_org     uuid;
  l_antigo      uuid;
  l_recente     uuid;
  l_nunca       uuid;
  l_desfecho    uuid;
  l_pendente    uuid;
  l_processando uuid;
  l_erro        uuid;
  l_outra       uuid;
  total         integer;
  lead          public.leads;
begin
  -- 1. Não executável pela API pública ---------------------------------------
  if has_function_privilege('anon', 'public.enfileirar_reconsulta(uuid, integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.enfileirar_reconsulta(uuid, integer)', 'EXECUTE') then
    raise exception 'FALHOU: enfileirar_reconsulta executável pela API pública';
  end if;
  if not has_function_privilege('service_role', 'public.enfileirar_reconsulta(uuid, integer)', 'EXECUTE') then
    raise exception 'FALHOU: enfileirar_reconsulta não executável pelo backend (service_role)';
  end if;

  insert into public.organizacoes (nome) values ('Org fase 7c') returning id into org;
  insert into public.organizacoes (nome) values ('Outra org fase 7c') returning id into outra_org;

  -- Enriquecido há 100 dias: entra.
  insert into public.leads (organizacao_id, cnpj, nome_lead, enriquecido_em, enriquecimento_status)
  values (org, '11222333000181', 'Antigo', now() - interval '100 days', 'concluido')
  returning id into l_antigo;
  -- Enriquecido há 10 dias: só entra com p_dias abaixo de 10.
  insert into public.leads (organizacao_id, cnpj, nome_lead, enriquecido_em, enriquecimento_status)
  values (org, '01234567000195', 'Recente', now() - interval '10 days', 'concluido')
  returning id into l_recente;
  -- Nunca enriquecido: não é reconsulta.
  insert into public.leads (organizacao_id, cnpj, nome_lead)
  values (org, '00000000000191', 'Nunca')
  returning id into l_nunca;
  -- Antigo, mas já convertido: fica de fora.
  insert into public.leads (organizacao_id, cnpj, nome_lead, status, desfecho_em, enriquecido_em, enriquecimento_status)
  values (org, '00123456000149', 'Desfecho', 'convertido', now() - interval '1 day', now() - interval '100 days', 'concluido')
  returning id into l_desfecho;
  -- Antigo, mas já na fila (esperando a próxima tentativa) ou em processamento.
  insert into public.leads (organizacao_id, cnpj, nome_lead, enriquecido_em, enriquecimento_status,
                            enriquecimento_tentativas, enriquecimento_erro, enriquecimento_proxima_em)
  values (org, '12345678000195', 'Pendente', now() - interval '100 days', 'pendente',
          2, 'BrasilAPI indisponível (HTTP 503)', now() + interval '1 hour')
  returning id into l_pendente;
  insert into public.leads (organizacao_id, cnpj, nome_lead, enriquecido_em, enriquecimento_status,
                            enriquecimento_tentativas, enriquecimento_proxima_em)
  values (org, '11444777000161', 'Processando', now() - interval '100 days', 'processando',
          1, now() + interval '5 minutes')
  returning id into l_processando;
  -- Antigo que terminou em erro na última tentativa: fica de fora (só "concluido" é reconsultado).
  insert into public.leads (organizacao_id, cnpj, nome_lead, enriquecido_em, enriquecimento_status,
                            enriquecimento_tentativas, enriquecimento_erro)
  values (org, '33000167000101', 'Erro', now() - interval '100 days', 'erro',
          3, 'BrasilAPI indisponível (HTTP 503); desistiu após 3 tentativas')
  returning id into l_erro;
  -- Antigo de outra organização.
  insert into public.leads (organizacao_id, cnpj, nome_lead, enriquecido_em, enriquecimento_status)
  values (outra_org, '11222333000181', 'Outra', now() - interval '100 days', 'concluido')
  returning id into l_outra;

  -- 2. Enfileira só os antigos e enriquecidos da organização ------------------
  total := public.enfileirar_reconsulta(org, 90);
  if total is distinct from 1 then
    raise exception 'FALHOU: esperado 1 enfileirado (só o antigo concluído), veio %', total;
  end if;

  select * into lead from public.leads where id = l_antigo;
  if lead.enriquecimento_status is distinct from 'pendente' or lead.enriquecimento_tentativas <> 0
     or lead.enriquecimento_erro is not null or lead.enriquecimento_proxima_em is distinct from now() then
    raise exception 'FALHOU: lead antigo não entrou na fila como pendente pronto';
  end if;
  -- Os dados da Receita não são apagados: só a consulta nova os substitui.
  if lead.enriquecido_em is null then
    raise exception 'FALHOU: enfileirar apagou enriquecido_em';
  end if;
  select * into lead from public.leads where id = l_erro;
  if lead.enriquecimento_status is distinct from 'erro' or lead.enriquecimento_tentativas <> 3 then
    raise exception 'FALHOU: lead com erro não deveria entrar na reconsulta (voltaria todo dia)';
  end if;

  if (select enriquecimento_status from public.leads where id = l_recente) is distinct from 'concluido' then
    raise exception 'FALHOU: enfileirou lead enriquecido há menos de 90 dias';
  end if;
  if (select enriquecimento_status from public.leads where id = l_nunca) is not null then
    raise exception 'FALHOU: enfileirou lead nunca enriquecido';
  end if;
  if (select enriquecimento_status from public.leads where id = l_outra) is distinct from 'concluido' then
    raise exception 'FALHOU: enfileirou lead de outra organização';
  end if;

  -- 3. Ignora quem tem desfecho -----------------------------------------------
  if (select enriquecimento_status from public.leads where id = l_desfecho) is distinct from 'concluido' then
    raise exception 'FALHOU: enfileirou lead com desfecho';
  end if;

  -- 4. Ignora pendente e processando (nem as tentativas mudam) ----------------
  select * into lead from public.leads where id = l_pendente;
  if lead.enriquecimento_status is distinct from 'pendente' or lead.enriquecimento_tentativas <> 2
     or lead.enriquecimento_proxima_em <= now() or lead.enriquecimento_erro is null then
    raise exception 'FALHOU: mexeu em lead já pendente';
  end if;
  select * into lead from public.leads where id = l_processando;
  if lead.enriquecimento_status is distinct from 'processando' or lead.enriquecimento_tentativas <> 1
     or lead.enriquecimento_proxima_em <= now() then
    raise exception 'FALHOU: mexeu em lead em processamento';
  end if;

  -- Chamar de novo não enfileira ninguém (os antigos já estão pendentes).
  total := public.enfileirar_reconsulta(org, 90);
  if total is distinct from 0 then
    raise exception 'FALHOU: segunda chamada deveria enfileirar 0, veio %', total;
  end if;

  -- 5. p_dias 0 (ou negativo) desliga e devolve 0 -----------------------------
  update public.leads set enriquecimento_status = 'concluido', enriquecimento_proxima_em = null
  where id = l_antigo;
  total := public.enfileirar_reconsulta(org, 0);
  if total is distinct from 0 then
    raise exception 'FALHOU: p_dias 0 deveria devolver 0, veio %', total;
  end if;
  total := public.enfileirar_reconsulta(org, -1);
  if total is distinct from 0 then
    raise exception 'FALHOU: p_dias negativo deveria devolver 0, veio %', total;
  end if;
  if (select enriquecimento_status from public.leads where id = l_antigo) <> 'concluido' then
    raise exception 'FALHOU: p_dias 0 enfileirou leads';
  end if;

  -- 6. O prazo segue p_dias: com 5 dias, o recente também entra ---------------
  total := public.enfileirar_reconsulta(org, 5);
  if total is distinct from 2 then
    raise exception 'FALHOU: com 5 dias, esperado 2 enfileirados (antigo e recente), veio %', total;
  end if;

  -- 7. A outra organização tem a sua própria reconsulta -----------------------
  total := public.enfileirar_reconsulta(outra_org, 90);
  if total is distinct from 1 then
    raise exception 'FALHOU: outra organização, esperado 1 enfileirado, veio %', total;
  end if;

  -- Limpeza ------------------------------------------------------------------
  delete from public.organizacoes where id in (org, outra_org);
end;
$$;

select 'Todos os testes da fase 7c passaram' as resultado;
