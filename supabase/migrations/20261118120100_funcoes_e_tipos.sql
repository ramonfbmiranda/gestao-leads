-- Tipos e funções compartilhados pelas tabelas.

-- Etapas do funil de vendas.
create type public.status_lead as enum (
  'novo',
  'em_contato',
  'qualificado',
  'descartado',
  'convertido'
);

-- Mantém updated_at sempre correto, sem depender do backend lembrar de preencher.
-- search_path vazio evita que alguém "sequestre" a função criando objetos com o
-- mesmo nome em outro schema; now() vem do pg_catalog, que é sempre consultado.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Só é usada por triggers; ninguém precisa chamá-la pela API.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
