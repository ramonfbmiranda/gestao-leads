-- Privilégios padrão do schema public.
--
-- Por padrão o Supabase concede acesso às tabelas novas para os papéis da API
-- pública (anon = visitante, authenticated = usuário logado). Neste sistema só o
-- backend acessa os dados, com a chave secreta (papel service_role). Por isso,
-- tudo o que for criado daqui em diante nasce sem privilégios para anon e
-- authenticated, como segunda barreira além do RLS.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

-- Funções: isto remove o EXECUTE que o Supabase concede a anon e authenticated.
-- Atenção: o EXECUTE que o Postgres dá a PUBLIC (todos os papéis) é global e não
-- pode ser revogado por schema. Por isso, toda função criada no schema public
-- precisa de um "revoke execute ... from public, anon, authenticated" explícito
-- logo após o "create function".
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- O backend continua com acesso total.
alter default privileges for role postgres in schema public
  grant all on tables to service_role;

alter default privileges for role postgres in schema public
  grant all on sequences to service_role;

alter default privileges for role postgres in schema public
  grant execute on functions to service_role;
