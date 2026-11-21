-- Verificação da fase 6: fila de enriquecimento.
--
-- Rodar no SQL Editor do Supabase depois de aplicar as migrações.
-- Se algum teste falhar, aparece "FALHOU: ..." e nada fica gravado.
-- As organizações de teste têm ids altos para ficarem por último no rodízio.

do $$
declare
  org_a    uuid := 'ffffffff-ffff-4fff-8fff-fffffffffff1';
  org_b    uuid := 'ffffffff-ffff-4fff-8fff-fffffffffff2';
  antes_a  uuid := 'ffffffff-ffff-4fff-8fff-fffffffffff0';
  a1 uuid; a2 uuid; a3 uuid; a4 uuid; b1 uuid;
  total    integer;
  reserva  jsonb;
  contagem jsonb;
  funcao   text;
begin
  -- 1. Nenhuma função executável pela API pública ---------------------------
  foreach funcao in array array[
    'public.enfileirar_enriquecimento(uuid, uuid[])',
    'public.pegar_proximo_enriquecimento(uuid, interval, integer)',
    'public.reservar_enriquecimento(uuid, uuid, interval)',
    'public.contar_enriquecimento(uuid)'
  ] loop
    if has_function_privilege('anon', funcao, 'EXECUTE')
       or has_function_privilege('authenticated', funcao, 'EXECUTE') then
      raise exception 'FALHOU: % executável pela API pública', funcao;
    end if;
  end loop;

  insert into public.organizacoes (id, nome) values (org_a, 'Org A fase 6'), (org_b, 'Org B fase 6');
  insert into public.leads (organizacao_id, cnpj, nome_lead) values (org_a, '11222333000181', 'A1') returning id into a1;
  insert into public.leads (organizacao_id, cnpj, nome_lead, enriquecimento_status) values (org_a, '01234567000195', 'A2', 'erro') returning id into a2;
  insert into public.leads (organizacao_id, cnpj, nome_lead, enriquecimento_status) values (org_a, '00000000000191', 'A3', 'concluido') returning id into a3;
  insert into public.leads (organizacao_id, cnpj, nome_lead, enriquecimento_status) values (org_a, '00123456000149', 'A4', 'nao_encontrado') returning id into a4;
  insert into public.leads (organizacao_id, cnpj, nome_lead) values (org_b, '11222333000181', 'B1') returning id into b1;

  -- 2. Enfileirar sem ids: só nunca solicitados e com erro, só da organização
  total := public.enfileirar_enriquecimento(org_a);
  if total <> 2 then
    raise exception 'FALHOU: esperado 2 enfileirados (nulo e erro), veio %', total;
  end if;
  if (select enriquecimento_status from public.leads where id = b1) is not null then
    raise exception 'FALHOU: enfileirou lead de outra organização';
  end if;
  if (select enriquecimento_status from public.leads where id = a3) <> 'concluido'
     or (select enriquecimento_status from public.leads where id = a4) <> 'nao_encontrado' then
    raise exception 'FALHOU: enfileirou sem ids um lead já processado';
  end if;

  -- 3. Com ids: entra mesmo concluído; já pendente e de outra org não contam
  total := public.enfileirar_enriquecimento(org_a, array[a1, a3, b1]);
  if total <> 1 or (select enriquecimento_status from public.leads where id = a3) <> 'pendente' then
    raise exception 'FALHOU: enfileirar com ids, esperado 1 (só o concluído), veio %', total;
  end if;
  perform public.enfileirar_enriquecimento(org_b);

  -- 4. Rodízio: A, depois B, depois A de novo ---------------------------------
  reserva := public.pegar_proximo_enriquecimento(antes_a);
  if (reserva ->> 'organizacao_id')::uuid <> org_a or (reserva ->> 'tentativas')::int <> 1 then
    raise exception 'FALHOU: primeira reserva deveria ser da org A com tentativa 1: %', reserva;
  end if;
  if (select enriquecimento_status from public.leads where id = (reserva ->> 'id')::uuid) <> 'processando' then
    raise exception 'FALHOU: reserva não marcou como processando';
  end if;
  reserva := public.pegar_proximo_enriquecimento(org_a);
  if (reserva ->> 'id')::uuid <> b1 then
    raise exception 'FALHOU: rodízio deveria passar para a org B: %', reserva;
  end if;
  -- Volta ao início só pode ser conferida se não houver outras organizações na fila.
  if not exists (
    select 1 from public.leads
    where enriquecimento_status = 'pendente' and organizacao_id not in (org_a, org_b)
  ) then
    reserva := public.pegar_proximo_enriquecimento(org_b);
    if (reserva ->> 'organizacao_id')::uuid <> org_a then
      raise exception 'FALHOU: rodízio deveria voltar para a org A: %', reserva;
    end if;
  end if;

  -- 5. Espera entre tentativas: lead agendado para o futuro não é reservado --
  update public.leads set enriquecimento_status = 'pendente', enriquecimento_proxima_em = now() + interval '1 hour'
  where organizacao_id in (org_a, org_b);
  reserva := public.pegar_proximo_enriquecimento(antes_a);
  if reserva is not null and (reserva ->> 'organizacao_id')::uuid in (org_a, org_b) then
    raise exception 'FALHOU: reservou lead agendado para o futuro';
  end if;

  -- 6. Reserva vencida volta para a fila; tentativas esgotadas viram erro ----
  update public.leads set enriquecimento_status = 'processando', enriquecimento_tentativas = 1,
    enriquecimento_proxima_em = now() - interval '1 minute'
  where id = a1;
  update public.leads set enriquecimento_status = 'processando', enriquecimento_tentativas = 3,
    enriquecimento_proxima_em = now() - interval '1 minute'
  where id = a2;
  perform public.pegar_proximo_enriquecimento(antes_a);
  if (select enriquecimento_status from public.leads where id = a2) <> 'erro' then
    raise exception 'FALHOU: lead preso com 3 tentativas deveria virar erro';
  end if;
  if (select enriquecimento_status from public.leads where id = a1) not in ('pendente', 'processando') then
    raise exception 'FALHOU: lead preso deveria voltar para a fila';
  end if;

  -- 7. Reserva individual -----------------------------------------------------
  update public.leads set enriquecimento_status = null, enriquecimento_proxima_em = null where id = a4;
  reserva := public.reservar_enriquecimento(org_a, a4);
  if (reserva ->> 'id')::uuid <> a4 or (reserva ->> 'tentativas')::int <> 1 then
    raise exception 'FALHOU: reserva individual: %', reserva;
  end if;
  if public.reservar_enriquecimento(org_a, a4) is not null then
    raise exception 'FALHOU: reservou duas vezes o mesmo lead';
  end if;
  begin
    perform public.reservar_enriquecimento(org_b, a4);
    raise exception 'FALHOU: reservou lead de outra organização';
  exception when no_data_found then null;
  end;

  -- 8. Contagem por situação, só da organização ------------------------------
  contagem := public.contar_enriquecimento(org_a);
  if (contagem ->> 'total')::int <> 4 or (contagem ->> 'erro')::int <> 1 or (contagem ->> 'processando')::int < 1 then
    raise exception 'FALHOU: contagem errada: %', contagem;
  end if;

  -- Limpeza ------------------------------------------------------------------
  delete from public.organizacoes where id in (org_a, org_b);
end;
$$;

select 'Todos os testes da fase 6 passaram' as resultado;
