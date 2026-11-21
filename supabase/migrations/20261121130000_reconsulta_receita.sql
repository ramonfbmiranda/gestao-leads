-- Reconsulta periódica dos dados da Receita (especificação, seção 9.1).
--
-- Uma vez por dia, o processador do backend chama esta função para cada
-- organização com o reconsulta_dias da configuração dela. A reconsulta usa a
-- mesma fila, as mesmas regras de tentativa e o mesmo rodízio do enriquecimento.

-- Coloca de novo na fila os leads da organização com enriquecimento concluído
-- há mais de p_dias dias e devolve quantos entraram. Ficam de fora os leads com
-- desfecho (convertidos ou descartados) e os que não terminaram em "concluido"
-- (pendentes, em processamento, não encontrados, não suportados ou com erro):
-- esses mantêm o enriquecido_em antigo e voltariam à fila todo dia.
-- p_dias <= 0 desliga a reconsulta (devolve 0).
create function public.enfileirar_reconsulta(p_organizacao_id uuid, p_dias integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_total integer;
begin
  if p_dias is null or p_dias <= 0 then
    return 0;
  end if;

  update public.leads l set
    enriquecimento_status     = 'pendente',
    enriquecimento_tentativas = 0,
    enriquecimento_erro       = null,
    enriquecimento_proxima_em = now()
  where l.organizacao_id = p_organizacao_id
    and l.enriquecido_em < now() - p_dias * interval '1 day'
    and l.desfecho_em is null
    and l.enriquecimento_status = 'concluido';

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- Sem acesso pela API pública (seção 5, item 2).
revoke execute on function public.enfileirar_reconsulta(uuid, integer) from public, anon, authenticated;
grant execute on function public.enfileirar_reconsulta(uuid, integer) to service_role;
