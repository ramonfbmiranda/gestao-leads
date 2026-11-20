-- Nome de responsável único por organização sem diferenciar maiúsculas e
-- minúsculas: "Ana Souza" e "ana souza" são a mesma pessoa. O nome também
-- precisa chegar normalizado (sem espaços nas pontas nem espaços repetidos),
-- para " Ana  Souza" não virar um terceiro responsável.

alter table public.responsaveis
  drop constraint responsaveis_organizacao_id_nome_key;

alter table public.responsaveis
  add constraint responsaveis_nome_normalizado
  check (nome = regexp_replace(btrim(nome), '\s+', ' ', 'g'));

create unique index responsaveis_organizacao_nome_unico
  on public.responsaveis (organizacao_id, lower(nome));
