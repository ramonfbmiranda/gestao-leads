-- Interações e desfechos (especificação, seções 4.3 e 8.10, revisão 7).
--
-- As colunas e a tabela interacoes vêm da migração 20261121120000. Aqui ficam
-- as funções que o backend chama:
--   - atualizar_resumo_interacoes: recalcula ultima_interacao_em e
--     tentativas_sem_resposta do lead depois de registrar ou excluir uma interação;
--   - contar_desfechos: convertidos e descartados por faixa (a registrada em
--     desfecho_score) e descartados por motivo. Usada pelo dashboard e pelo
--     score (chance de fechar pelo histórico).


-- Resumo das interações do lead:
--   ultima_interacao_em     = a maior ocorreu_em (nulo sem interações);
--   tentativas_sem_resposta = interações seguidas sem resposta, da mais recente
--                             para trás, até a última que teve resposta.
-- Lead inexistente ou de outra organização: não faz nada.
create function public.atualizar_resumo_interacoes(p_organizacao_id uuid, p_lead_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_ultima     timestamptz;
  v_tentativas integer;
begin
  -- Trava o lead: chamadas simultâneas para o mesmo lead rodam uma de cada vez,
  -- e cada uma conta com tudo o que já estava gravado quando conseguiu a trava.
  perform 1
  from public.leads l
  where l.id = p_lead_id
    and l.organizacao_id = p_organizacao_id
  for update;

  if not found then
    return;
  end if;

  select max(i.ocorreu_em) into v_ultima
  from public.interacoes i
  where i.organizacao_id = p_organizacao_id
    and i.lead_id = p_lead_id;

  -- Da mais recente para a mais antiga, "ja_respondeu" vira verdadeiro na
  -- primeira com resposta; contam só as anteriores a ela.
  select count(*) into v_tentativas
  from (
    select bool_or(i.teve_resposta) over (
             order by i.ocorreu_em desc, i.created_at desc, i.id desc
             rows between unbounded preceding and current row
           ) as ja_respondeu
    from public.interacoes i
    where i.organizacao_id = p_organizacao_id
      and i.lead_id = p_lead_id
  ) x
  where not x.ja_respondeu;

  update public.leads l set
    ultima_interacao_em     = v_ultima,
    tentativas_sem_resposta = v_tentativas
  where l.id = p_lead_id
    and l.organizacao_id = p_organizacao_id;
end;
$$;


-- Desfechos da organização. Formato (as quatro faixas sempre presentes):
--   { "faixas":  { "alta": { "convertidos": n, "descartados": n }, "media": {...},
--                  "baixa": {...}, "na": {...} },
--     "motivos": { "<motivo>": n } }
-- Contam só leads com desfecho_em e status convertido ou descartado. A faixa é
-- a de desfecho_score.score_detalhes.faixa; nula ou desconhecida conta como "na".
-- "motivos" conta os descartados por motivo_descarte.
create function public.contar_desfechos(p_organizacao_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with desfechos as (
    select
      l.status::text as status,
      case
        when l.desfecho_score -> 'score_detalhes' ->> 'faixa' in ('alta', 'media', 'baixa')
          then l.desfecho_score -> 'score_detalhes' ->> 'faixa'
        else 'na'
      end as faixa,
      l.motivo_descarte
    from public.leads l
    where l.organizacao_id = p_organizacao_id
      and l.desfecho_em is not null
      and l.status in ('convertido', 'descartado')
  )
  select jsonb_build_object(
    'faixas', (
      select jsonb_object_agg(
               c.faixa,
               jsonb_build_object('convertidos', c.convertidos, 'descartados', c.descartados)
             )
      from (
        select
          f.faixa,
          count(d.faixa) filter (where d.status = 'convertido') as convertidos,
          count(d.faixa) filter (where d.status = 'descartado') as descartados
        from unnest(array['alta', 'media', 'baixa', 'na']) as f (faixa)
        left join desfechos d on d.faixa = f.faixa
        group by f.faixa
      ) c
    ),
    'motivos', coalesce(
      (
        select jsonb_object_agg(m.motivo, m.total)
        from (
          select d.motivo_descarte as motivo, count(*) as total
          from desfechos d
          where d.status = 'descartado'
            and d.motivo_descarte is not null
          group by d.motivo_descarte
        ) m
      ),
      '{}'::jsonb
    )
  );
$$;


-- Nenhuma destas funções pode ser chamada pela API pública (seção 5, item 2).
revoke execute on function public.atualizar_resumo_interacoes(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.contar_desfechos(uuid) from public, anon, authenticated;

grant execute on function public.atualizar_resumo_interacoes(uuid, uuid) to service_role;
grant execute on function public.contar_desfechos(uuid) to service_role;
