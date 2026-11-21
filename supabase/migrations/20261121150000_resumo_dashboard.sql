-- Resumo do dashboard (especificação, seções 9.1, 10 e 11.3, fase 11).
--
-- Tudo é contado no banco, numa chamada só: a API do Supabase devolve no
-- máximo 1.000 linhas por consulta, e uma organização pode ter dezenas de
-- milhares de leads.
--
-- "Em aberto" = status novo, em_contato ou qualificado. O potencial médio, as
-- faixas, a distribuição, os parciais e o ranking contam só esses: lead
-- convertido ou descartado já teve desfecho e não é mais "quem trabalhar".
-- Total, status e enriquecimento contam todos.
--
-- As faixas usam os limites atuais da organização (p_alta, p_media), os mesmos
-- do filtro "faixa" de GET /leads.
--
-- Formato:
--   { "total": n, "em_aberto": n,
--     "por_status": { "novo": n, "em_contato": n, "qualificado": n, "convertido": n, "descartado": n },
--     "media_potencial": numero | null, "com_potencial": n, "parciais": n,
--     "por_faixa": { "alta": n, "media": n, "baixa": n, "na": n },
--     "distribuicao": [ { "de": 0, "total": n, "parciais": n }, ... { "de": 90, ... } ],
--     "enriquecimento": { "concluido": n, "na_fila": n, "sem_resultado": n, "nunca": n },
--     "top": [ { id, nome_lead, cnpj, score_compensacao, score_parcial, status, responsavel } ],
--     "mudancas_receita": [ { id, nome_lead, em, mudancas: [{ campo, de, para }] } ] }
-- A distribuição tem 10 blocos de 10 pontos; o último (90) inclui o 100.
create function public.resumo_dashboard(p_organizacao_id uuid, p_alta numeric, p_media numeric)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with base as (
    select
      l.id,
      l.nome_lead,
      l.cnpj,
      l.status::text as status,
      l.score_compensacao as score,
      l.score_parcial,
      l.enriquecimento_status,
      l.responsavel_id,
      l.ultima_mudanca_receita,
      l.status in ('novo', 'em_contato', 'qualificado') as em_aberto
    from public.leads l
    where l.organizacao_id = p_organizacao_id
  ),
  abertos as (
    select * from base where em_aberto
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'em_aberto', (select count(*) from abertos),
    'por_status', (
      select jsonb_object_agg(s.status, (select count(*) from base b where b.status = s.status))
      from unnest(array['novo', 'em_contato', 'qualificado', 'convertido', 'descartado']) as s (status)
    ),
    'media_potencial', (select round(avg(a.score), 1) from abertos a),
    'com_potencial', (select count(a.score) from abertos a),
    'parciais', (select count(*) from abertos a where a.score is not null and a.score_parcial),
    'por_faixa', (
      select jsonb_build_object(
        'alta',  count(*) filter (where a.score >= p_alta),
        'media', count(*) filter (where a.score >= p_media and a.score < p_alta),
        'baixa', count(*) filter (where a.score < p_media),
        'na',    count(*) filter (where a.score is null)
      )
      from abertos a
    ),
    'distribuicao', (
      select jsonb_agg(jsonb_build_object('de', d.de, 'total', d.total, 'parciais', d.parciais) order by d.de)
      from (
        select
          f.de,
          count(a.id) as total,
          count(a.id) filter (where a.score_parcial) as parciais
        from generate_series(0, 90, 10) as f (de)
        left join abertos a
          on a.score is not null
         and least(floor(a.score / 10) * 10, 90) = f.de
        group by f.de
      ) d
    ),
    'enriquecimento', (
      select jsonb_build_object(
        'concluido',     count(*) filter (where b.enriquecimento_status = 'concluido'),
        'na_fila',       count(*) filter (where b.enriquecimento_status in ('pendente', 'processando')),
        'sem_resultado', count(*) filter (where b.enriquecimento_status in ('nao_encontrado', 'nao_suportado', 'erro')),
        'nunca',         count(*) filter (where b.enriquecimento_status is null)
      )
      from base b
    ),
    'top', coalesce(
      (
        select jsonb_agg(to_jsonb(t) order by t.score_compensacao desc, t.nome_lead)
        from (
          select
            a.id,
            a.nome_lead,
            a.cnpj,
            a.score as score_compensacao,
            a.score_parcial,
            a.status,
            case when r.id is null then null else jsonb_build_object('id', r.id, 'nome', r.nome) end as responsavel
          from abertos a
          left join public.responsaveis r
            on r.id = a.responsavel_id
           and r.organizacao_id = p_organizacao_id
          where a.score is not null
          order by a.score desc, a.nome_lead
          limit 10
        ) t
      ),
      '[]'::jsonb
    ),
    'mudancas_receita', coalesce(
      (
        select jsonb_agg(to_jsonb(m) order by m.em desc)
        from (
          select
            b.id,
            b.nome_lead,
            b.ultima_mudanca_receita ->> 'em' as em,
            b.ultima_mudanca_receita -> 'mudancas' as mudancas
          from base b
          where b.ultima_mudanca_receita ? 'em'
          order by b.ultima_mudanca_receita ->> 'em' desc
          limit 5
        ) m
      ),
      '[]'::jsonb
    )
  );
$$;

-- Não pode ser chamada pela API pública (seção 5, item 2).
revoke execute on function public.resumo_dashboard(uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function public.resumo_dashboard(uuid, numeric, numeric) to service_role;
