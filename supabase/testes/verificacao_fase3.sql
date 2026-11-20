-- Verificação da fase 3: nome de responsável único sem diferenciar maiúsculas.
--
-- Rodar no SQL Editor do Supabase depois de aplicar as migrações.
-- Se algum teste falhar, aparece "FALHOU: ..." e nada fica gravado.

do $$
declare
  org_a uuid;
  org_b uuid;
begin
  insert into public.organizacoes (nome) values ('Org A fase 3') returning id into org_a;
  insert into public.organizacoes (nome) values ('Org B fase 3') returning id into org_b;

  insert into public.responsaveis (organizacao_id, nome) values (org_a, 'Ana Souza');

  -- 1. Mesmo nome com outra caixa na mesma organização é recusado -----------
  begin
    insert into public.responsaveis (organizacao_id, nome) values (org_a, 'ana souza');
    raise exception 'FALHOU: aceitou "ana souza" duplicado';
  exception when unique_violation then null;
  end;

  -- 2. O mesmo nome em outra organização é permitido -------------------------
  insert into public.responsaveis (organizacao_id, nome) values (org_b, 'ANA SOUZA');

  -- 3. Nome não normalizado é recusado ---------------------------------------
  begin
    insert into public.responsaveis (organizacao_id, nome) values (org_a, ' Bruno');
    raise exception 'FALHOU: aceitou nome com espaço na ponta';
  exception when check_violation then null;
  end;
  begin
    insert into public.responsaveis (organizacao_id, nome) values (org_a, 'Bruno  Lima');
    raise exception 'FALHOU: aceitou nome com espaços repetidos';
  exception when check_violation then null;
  end;

  -- Limpeza ------------------------------------------------------------------
  delete from public.organizacoes where id in (org_a, org_b);
end;
$$;

select 'Todos os testes da fase 3 passaram' as resultado;
