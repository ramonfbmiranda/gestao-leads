-- Grava em lote o score calculado pelo backend (especificação, seção 8).
--
-- O cálculo é feito no backend (funções puras e testadas); esta função só
-- grava, numa transação, e apenas em leads da organização informada.
-- Formato de p_scores: [{ id, score_valor, score_probabilidade, score_esforco,
--   score_compensacao, score_parcial, score_detalhes }]
-- Devolve quantos leads foram atualizados.

create function public.gravar_scores(p_organizacao_id uuid, p_scores jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_total integer;
begin
  update public.leads l set
    score_valor         = s.score_valor,
    score_probabilidade = s.score_probabilidade,
    score_esforco       = s.score_esforco,
    score_compensacao   = s.score_compensacao,
    score_parcial       = coalesce(s.score_parcial, false),
    score_detalhes      = s.score_detalhes,
    score_calculado_em  = now()
  from jsonb_to_recordset(p_scores) as s (
    id                  uuid,
    score_valor         numeric,
    score_probabilidade numeric,
    score_esforco       numeric,
    score_compensacao   numeric,
    score_parcial       boolean,
    score_detalhes      jsonb
  )
  where l.id = s.id
    and l.organizacao_id = p_organizacao_id;

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke execute on function public.gravar_scores(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.gravar_scores(uuid, jsonb) to service_role;
