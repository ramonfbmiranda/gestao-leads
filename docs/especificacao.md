# Sistema de Gestão de Leads: especificação

Documento vivo com o contexto e os requisitos do sistema. É a fonte da verdade do projeto: qualquer mudança de contrato (tabelas, colunas, rotas, parâmetros) é avisada antes e registrada aqui.

Última revisão: 2026-11-21 (revisão 7: motor de compensação no centro, com avaliação do lead feita no sistema, perfil ideal, esforço por canais e interações, confiança, sugestões, estimativa em reais e aprendizado com os desfechos).

## 1. Visão geral

Plataforma web multiempresa (SaaS): cada empresa cliente cria uma conta, importa suas planilhas de prospecção ("Projeto de Leads"), gerencia os leads em um funil de vendas e vê um ranking dos leads que mais compensam ser trabalhados. Cada empresa enxerga somente os próprios dados.

**O foco principal do sistema** é medir o nível de compensação de conquistar cada lead. Compensação é retorno esperado versus esforço, calculada a partir das informações da planilha e de dados públicos obtidos pelo CNPJ. A nota que vem da planilha mede apenas fit com o perfil ideal e presença digital; o sistema deve ir além e responder "vale a pena correr atrás deste lead?".

A gestão do funil (status, responsáveis, importação, interações) é um complemento: ela organiza o trabalho e alimenta o aprendizado do motor, mas não é o objetivo principal. A base do cálculo é uma avaliação que a equipe responde no próprio sistema, somada aos dados públicos obtidos pelo CNPJ.

## 2. Decisões de arquitetura

- **Multiempresa com login por empresa (SaaS).** Toda tabela de negócio pertence a uma organização (`organizacao_id`). Cada usuário pertence a uma única organização (MVP) e só acessa os dados dela.
- **Planilhas variam entre empresas.** Os cabeçalhos não são padronizados, então a importação tem uma etapa de mapeamento de colunas (De-Para). O modelo padrão de 10 colunas (seção 4) é o formato interno do sistema, não uma exigência da planilha.
- **Colunas desconhecidas não se perdem.** O que não for mapeado vai para um campo `jsonb` (`dados_extras`).
- **Dados originais preservados.** As notas que vêm da planilha (ICP, mídias sociais, nota final) ficam como vieram. O score do sistema vai em colunas separadas, para a empresa comparar os dois.
- **Escalas diferentes por empresa.** Cada organização informa a escala máxima de suas calculadoras (0-10, 0-100 etc.), e o sistema normaliza para 0-100 ao calcular o score.
- **CNPJ alfanumérico é o formato principal.** Armazenado com 14 caracteres, sem máscara, em maiúsculas: 12 caracteres alfanuméricos (`0-9`, `A-Z`) seguidos de 2 dígitos verificadores numéricos. O CNPJ numérico antigo é um caso particular do mesmo formato e é aceito sem tratamento especial. Validado pelos dígitos verificadores (seção 4.1) e único por organização (não no sistema inteiro).
- **Importar significa upsert** por (`organizacao_id`, `cnpj`): atualiza quem já existe, insere quem é novo, nunca apaga dados de enriquecimento ou de score, e **célula vazia na planilha não apaga valor existente**. Cada importação é registrada em histórico.
- **Dado insuficiente é "N/A", nunca um número inventado.** Quando falta informação para um fator ou pilar do score, ele fica nulo (exibido como "N/A") e o score é marcado como parcial (seção 8).
- **A avaliação feita no sistema prevalece sobre a planilha.** A equipe responde no sistema um questionário sobre o lead (modelo padrão de perguntas, editável por organização), e o encaixe no perfil ideal é calculado com os dados da Receita. As notas da planilha continuam aceitas e só valem quando o sistema não tem como calcular aquele fator (seção 8.3).
- **O frontend nunca acessa as tabelas diretamente.** Toda leitura e escrita de dados passa pela API Express. O frontend usa o Supabase apenas para autenticação.
- **Isolamento entre empresas é garantido no backend:** o `organizacao_id` é sempre obtido do usuário autenticado e nunca de parâmetros enviados pelo cliente.
- **Tudo em plano gratuito.** Nenhum serviço pago na stack ou no deploy (seção 12).

## 3. Stack tecnológica

| Camada | Tecnologia |
| --- | --- |
| Banco de dados | PostgreSQL no Supabase (SQL puro versionado em `supabase/migrations`, aplicado com a Supabase CLI) |
| Autenticação | Supabase Auth (e-mail e senha, com confirmação de e-mail) |
| Backend | Node.js com Express, módulos ES (`import`/`export`), `@supabase/supabase-js` com a chave secreta do projeto |
| Upload e planilhas | `multer` (em memória) e `xlsx` (SheetJS) para `.xlsx` e `.csv`. O SheetJS é instalado pelo CDN oficial (`cdn.sheetjs.com`): a versão do registro npm está parada e tem falhas de segurança conhecidas |
| Frontend | React com Vite, Tailwind CSS, React Router, axios (versões e requisitos na seção 11.1) |
| Autenticação no frontend | `@supabase/supabase-js` com a chave pública, só para login, cadastro e sessão |
| Dados públicos | BrasilAPI (consulta de CNPJ) |
| Testes | `vitest` para as funções puras (validação de CNPJ, score, normalização) |

**Chaves do Supabase:** projetos novos usam chaves `publishable` (pública) e `secret` (servidor) no lugar das antigas `anon` e `service_role`. Confirmar na documentação atual qual o projeto usa antes da fase 2. Neste documento, "chave pública" e "chave secreta" se referem a elas.

Antes de instalar ou configurar qualquer biblioteca (principalmente Tailwind, Supabase e BrasilAPI), conferir a documentação oficial atual, porque versões e formatos mudam.

### Estrutura do repositório

```
/
├── docs/especificacao.md     este documento
├── supabase/migrations/      SQL versionado
├── supabase/testes/          scripts de verificação do banco
├── backend/                  API Express
└── frontend/                 React + Vite
```

## 4. Modelo de dados

Nomes em português, `snake_case`, sem acento. Estes nomes são o contrato do sistema: banco, backend e frontend devem usá-los exatamente.

### 4.1 CNPJ alfanumérico

- Formato: `^[0-9A-Z]{12}[0-9]{2}$` após remover máscara (`.`, `/`, `-`, espaços) e converter para maiúsculas.
- Dígitos verificadores: cada caractere vale `código ASCII − 48` (`0`-`9` valem 0-9, `A` vale 17, `B` 18 … `Z` 42). O cálculo é o mesmo módulo 11 do CNPJ numérico: pesos 5,4,3,2,9,8,7,6,5,4,3,2 para o 1º DV e 6,5,4,3,2,9,8,7,6,5,4,3,2 para o 2º; resto < 2 vira 0, senão `11 − resto`.
- Rejeitar sequências de um único caractere repetido (ex.: `00000000000000`).
- Planilhas perdem os zeros iniciais de CNPJs numéricos: valores só com dígitos e de 11 a 13 posições recebem zeros à esquerda antes da validação. Valores mais curtos são recusados.
- O CNPJ de um lead não é editável: ele é a chave da importação. Para corrigir, exclui-se o lead e cadastra-se de novo.
- A BrasilAPI já consulta CNPJ alfanumérico (conferido em 2026-11-20: valida os dígitos e responde 404 para um alfanumérico inexistente). Se um dia ela recusar o formato (400 para um CNPJ que o backend já validou), o lead fica como `nao_suportado` (seção 9), sem ser tratado como erro.

### 4.2 Tipo e função auxiliares

- ENUM `status_lead`: `novo`, `em_contato`, `qualificado`, `descartado`, `convertido`.
- Função `set_updated_at()` (PL/pgSQL, `search_path` vazio) que define `NEW.updated_at = now()`, reutilizada por triggers `BEFORE UPDATE ... FOR EACH ROW` em todas as tabelas que têm `updated_at`.

### 4.3 Tabelas

**`organizacoes`:** `id` (uuid PK, `gen_random_uuid()`), `nome` (text, obrigatório, **não** único), `escala_icp_max`, `escala_midias_max`, `escala_nota_max` (numeric(10,2), default 100, CHECK > 0), `config_score` (jsonb, default `{}`; valores ausentes usam o padrão da seção 8.6), `created_at`, `updated_at`.

**`perfis`:** `id` (uuid PK, FK para `auth.users(id)` ON DELETE CASCADE), `organizacao_id` (FK, obrigatório, CASCADE), `nome` (text), `papel` (text, CHECK em `admin` ou `membro`), `created_at`, `updated_at`. Liga cada usuário do Supabase Auth à sua organização.

**`convites`:** `id`, `organizacao_id` (FK, CASCADE), `email` (text, obrigatório, minúsculo), `papel` (CHECK em `admin` ou `membro`, default `membro`), `convidado_por` (FK para `perfis`, SET NULL), `status` (CHECK em `pendente`, `aceito`, `cancelado`), `created_at`, `aceito_em` (timestamptz). Índice único parcial em (`organizacao_id`, `email`) onde `status = 'pendente'`.

**`responsaveis`:** `id`, `organizacao_id` (FK, CASCADE), `nome` (obrigatório, normalizado: sem espaços nas pontas nem repetidos), `created_at`, índice único em (`organizacao_id`, `lower(nome)`), ou seja, "Ana Souza" e "ana souza" são o mesmo responsável. Representa a coluna "Quem mapeou?" da planilha (é um nome, não necessariamente um usuário do sistema).

**`leads`:**

| Grupo | Colunas |
| --- | --- |
| Identificação | `id` (uuid PK), `organizacao_id` (FK, obrigatório, CASCADE), `responsavel_id` (FK para `responsaveis`, ON DELETE SET NULL) |
| Originais da planilha | `cnpj` (char(14), obrigatório, CHECK `^[0-9A-Z]{12}[0-9]{2}$`), `link_cnpj` (text), `nome_lead` (text, obrigatório), `nome_decisor` (text), `numero_decisor` (text), `redes_sociais` (text, valor original), `calculadora_icp`, `calculadora_midias_sociais`, `nota_final` (numeric(10,2)) |
| Funil | `status` (`status_lead`, NOT NULL, default `novo`) |
| Enriquecimento (opcionais) | `razao_social`, `porte`, `capital_social` (numeric(16,2)), `cnae_principal`, `data_abertura` (date), `cidade`, `uf` (char(2)), `situacao_cadastral`, `enriquecido_em` (timestamptz) |
| Fila de enriquecimento | `enriquecimento_status` (text, CHECK em `pendente`, `processando`, `concluido`, `nao_encontrado`, `nao_suportado`, `erro`; nulo = nunca solicitado), `enriquecimento_tentativas` (int, default 0), `enriquecimento_erro` (text), `enriquecimento_proxima_em` (timestamptz: para `pendente`, quando pode ser tentado; para `processando`, o prazo da reserva) |
| Score (0 a 100, CHECK, nulo = N/A) | `score_valor`, `score_probabilidade`, `score_esforco`, `score_compensacao`, `score_confianca` (numeric(5,2); a confiança entra na revisão 7, seção 8.9), `score_parcial` (boolean, NOT NULL, default false), `score_detalhes` (jsonb), `score_calculado_em` (timestamptz) |
| Contato do decisor (opcionais, revisão 7) | `email_decisor` (text), `linkedin_decisor` (text) |
| Contatos e sócios da Receita (revisão 7) | `telefone_receita` (text, só dígitos), `email_receita` (text), `socios` (jsonb, `[{ nome, qualificacao }]`, até 20, seção 9.1), `ultima_mudanca_receita` (jsonb ou nulo: `{ em, mudancas: [{ campo, de, para }] }`) |
| Avaliação (revisão 7, seção 8.8) | `avaliacao` (jsonb ou nulo: `{ respostas: { <pergunta>: <opção> } }`), `ticket_estimado` (numeric(14,2), CHECK ≥ 0), `avaliado_em` (timestamptz), `avaliado_por` (FK para `perfis`, SET NULL) |
| Resumo das interações (revisão 7) | `ultima_interacao_em` (timestamptz), `tentativas_sem_resposta` (int, NOT NULL, default 0), mantidos pelo backend a cada interação registrada ou excluída |
| Desfecho (revisão 7, seção 8.10) | `motivo_descarte` (text), `desfecho_em` (timestamptz), `desfecho_score` (jsonb: cópia das colunas de score e de `score_detalhes` no momento do desfecho) |
| Flexibilidade | `dados_extras` (jsonb, NOT NULL, default `{}`), `ultima_importacao_id` (FK para `importacoes`, ON DELETE SET NULL) |
| Controle | `created_at`, `updated_at` |

Restrição UNIQUE (`organizacao_id`, `cnpj`). Índices em (`organizacao_id`, `score_compensacao` DESC NULLS LAST), (`organizacao_id`, `status`), (`responsavel_id`) e índices parciais da fila: (`organizacao_id`, `enriquecimento_proxima_em`) onde `pendente` e (`enriquecimento_proxima_em`) onde `processando`. Na revisão 7: (`organizacao_id`, `ultima_interacao_em`) para a fila de prioridade e (`enriquecido_em`) para a reconsulta periódica.

Quando uma nota chega em letra (A/B/C…), o número convertido vai na coluna numérica e o texto original fica em `dados_extras.originais.<campo>`.

**`lead_redes_sociais`:** `id`, `lead_id` (FK, CASCADE), `plataforma` (text: `instagram`, `linkedin`, `facebook`, `site`, `outra`), `url` (obrigatório, normalizada), `created_at`, UNIQUE (`lead_id`, `url`). Cada link da célula "Redes Sociais" vira uma linha aqui; o texto original continua em `leads.redes_sociais`. Reimportações e edições manuais **acrescentam** links novos e não removem os existentes.

Regras de separação dos links: o texto é dividido por espaço, quebra de linha, vírgula, ponto e vírgula e `|`. Só entra o que parece endereço web: e-mails, telefones e `@perfil` ficam apenas no texto original. A URL é normalizada para evitar duplicatas (https, domínio em minúsculas e sem `www.`, sem barra final e sem `#`), com no máximo 20 links por gravação. A plataforma vem do domínio: Instagram, LinkedIn e Facebook pelos seus domínios; outras redes conhecidas (YouTube, TikTok, X, WhatsApp etc.) como `outra`; o resto como `site`.

**`interacoes`** (revisão 7): `id`, `organizacao_id` (FK, CASCADE), `lead_id` (FK composta com `organizacao_id` para `leads`, CASCADE), `perfil_id` (FK para `perfis`, SET NULL: quem registrou), `tipo` (CHECK em `ligacao`, `whatsapp`, `email`, `reuniao`, `visita`, `outro`), `teve_resposta` (boolean, NOT NULL), `observacao` (text, até 2.000 caracteres), `ocorreu_em` (timestamptz, NOT NULL, default `now()`, não pode estar no futuro), `created_at`. Índice em (`lead_id`, `ocorreu_em` DESC). `leads.tentativas_sem_resposta` conta as interações seguidas sem resposta, da mais recente para trás, até a última que teve resposta.

**`importacoes`:** `id`, `organizacao_id` (FK), `criado_por` (FK para `perfis`, SET NULL), `nome_arquivo`, `mapeamento` (jsonb, o De-Para usado), `total_linhas`, `inseridos`, `atualizados`, `ignorados` (inteiros, default 0), `erros` (jsonb, default `[]`, com linha e motivo), `status` (CHECK em `processando`, `concluida`, `falhou`), `created_at`.

### 4.4 Modelo padrão de colunas da planilha (De-Para)

| Coluna original | Campo interno |
| --- | --- |
| CNPJ | `cnpj` |
| Link - Informações do CNPJ | `link_cnpj` |
| Nome do Lead | `nome_lead` |
| Nome do Decisor | `nome_decisor` |
| Número do Decisor | `numero_decisor` |
| Redes Sociais | `redes_sociais` |
| Calculadora - ICP | `calculadora_icp` |
| Calculadora - Mídias Sociais | `calculadora_midias_sociais` |
| Nota final | `nota_final` |
| Quem mapeou? | `responsavel_id` (via `responsaveis.nome`) |
| E-mail do Decisor (opcional, revisão 7) | `email_decisor` |
| LinkedIn do Decisor (opcional, revisão 7) | `linkedin_decisor` |

Obrigatórios no mapeamento: `cnpj` e `nome_lead`. A avaliação do lead (seção 8.8) não vem da planilha: é respondida no sistema, e uma reimportação nunca a apaga.

## 5. Segurança e multiempresa

1. **RLS ligado em todas as tabelas do schema `public`**, sem políticas no MVP. A API pública do Supabase (chave pública) não enxerga nada; apenas o backend, com a chave secreta, acessa os dados.
2. **Privilégios revogados dos papéis públicos.** Além do RLS, os papéis `anon` e `authenticated` não têm nenhum privilégio nas tabelas do schema `public`, e toda função desse schema (por exemplo a de importação) tem `EXECUTE` revogado de `public`, `anon` e `authenticated`, para não ser chamável pela API pública. Para tabelas, isso vale também para objetos criados no futuro (`ALTER DEFAULT PRIVILEGES`). Para funções, o `EXECUTE` dado a `PUBLIC` é global no Postgres e não pode ser removido por schema, então **toda função nova recebe um `REVOKE EXECUTE ... FROM public, anon, authenticated` explícito logo após ser criada**. Se um dia o frontend for ler o banco direto (item 10), os `GRANT`s necessários são devolvidos junto com as políticas.
3. **Integridade entre organizações também no banco.** As referências de `leads` para `responsaveis` e `importacoes` são chaves estrangeiras compostas com `organizacao_id`, então um lead nunca aponta para um responsável ou importação de outra organização, mesmo com bug no backend.
4. **A chave secreta vive somente no `.env` do backend.** Nunca no frontend, nunca no Git.
5. **Autenticação por token.** O frontend faz login com o Supabase Auth e envia `Authorization: Bearer <access_token>` em toda chamada. Dois middlewares no Express:
   - `autenticar`: valida o token (`getClaims()` ou `getUser()`, conforme a documentação atual) e coloca `req.usuario`;
   - `exigirPerfil`: carrega o registro em `perfis` e coloca `req.perfil` e `req.organizacaoId`; sem perfil, responde 403 `{ "erro": "Onboarding pendente" }`.
6. **Regra inegociável:** toda consulta a tabelas de negócio filtra por `req.organizacaoId`. Rotas que recebem `:id` conferem que o registro pertence à organização do usuário (resposta 404 caso contrário, sem revelar que o recurso existe).
7. **Nunca aceitar do cliente:** `id`, `organizacao_id`, campos de score, campos de enriquecimento e da fila, `created_at`, `updated_at`. Os updates usam lista branca de campos.
8. **Papéis:** `admin` pode editar configurações da organização e gerenciar membros e convites; `membro` trabalha com os leads.
9. **Endurecimento:** CORS restrito ao domínio do frontend, limite de tamanho (5 MB) e de formato no upload, limite de taxa na API (`express-rate-limit`) e validação de todas as entradas no backend.
10. **Recomendação futura (defesa em profundidade):** políticas RLS de leitura baseadas em `perfis`, caso o frontend venha a consultar o Supabase direto.

## 6. Cadastro, onboarding e convites

1. O usuário se cadastra no Supabase Auth e confirma o e-mail.
2. No primeiro login, o frontend chama `GET /me`. Sem perfil, a resposta traz `perfil: null` e a lista de `convites_pendentes` para o e-mail do usuário.
3. Se houver convite, o usuário aceita (`POST /convites/:id/aceitar`) e entra na organização com o papel do convite. Caso contrário, preenche a tela de onboarding (`POST /onboarding`), que cria a organização e o perfil `admin`.
4. O `admin` convida membros por e-mail (`POST /membros/convite`): grava em `convites` e dispara o convite do Supabase Auth. A ligação com a organização acontece no passo 3, nunca por dado enviado pelo cliente.
   - Se a pessoa já tem conta, o Supabase não envia e-mail (`email_enviado: false`); o convite aparece para ela no próximo login.
   - Se o envio falhar por outro motivo, o convite é desfeito, para o admin poder tentar de novo.
   - Convidar quem já é membro da organização responde 409.

**Integridade:**

- Onboarding e aceite de convite exigem e-mail confirmado (conferido direto no Supabase Auth, não no token), para ninguém entrar numa organização com um e-mail que não é seu.
- As duas operações rodam em funções SQL de uma única transação (`criar_organizacao_com_admin` e `aceitar_convite`): não sobram organizações órfãs nem convites aceitos sem perfil, e dois cliques simultâneos não criam duas organizações.
- `listar_membros` lê o e-mail de `auth.users` (o schema `auth` não é exposto pela API do Supabase).
- Um usuário pertence a uma só organização: quem já tem perfil recebe 409 ao tentar onboarding ou aceite.

## 7. Importação de planilhas

Fluxo em duas fases:

1. **Preview:** o usuário envia um `.xlsx` ou `.csv` (até 5 MB e 20.000 linhas). O backend lê a primeira aba e devolve cabeçalhos, 5 linhas de amostra, total de linhas e um `mapeamento_sugerido`, sem gravar nada. A sugestão compara cabeçalhos ignorando acentos, maiúsculas e pontuação, com lista de sinônimos por campo.
2. **Confirmação:** o usuário ajusta o De-Para e confirma. O backend processa:
   - cria o registro em `importacoes` com status `processando`;
   - para cada linha: normaliza e valida o CNPJ, converte números (vírgula decimal, `%`, letras por uma tabela de equivalência configurável) e cria o responsável se ainda não existir;
   - colunas não mapeadas vão para `dados_extras`;
   - linhas inválidas vão para `importacoes.erros` (número da linha e motivo) sem derrubar o lote;
   - **CNPJ repetido na mesma planilha:** a última ocorrência prevalece; as anteriores contam como `ignorados` e entram em `erros` com o motivo "CNPJ duplicado na planilha (prevalece a linha N)";
   - upsert por (`organizacao_id`, `cnpj`) em lotes de cerca de 500, por uma função SQL que processa cada lote em uma transação e devolve quantos foram inseridos e atualizados. Células vazias não sobrescrevem valores existentes, e dados de enriquecimento e de score nunca são apagados;
   - divide `redes_sociais` em itens, detecta a plataforma pela URL e acrescenta em `lead_redes_sociais` (ignorando links já existentes);
   - grava `ultima_importacao_id` nos leads tocados e finaliza a importação como `concluida` (ou `falhou`);
   - recalcula o score dos leads afetados.

A importação é idempotente quanto ao estado dos leads: importar o mesmo arquivo duas vezes deixa os leads exatamente iguais (a segunda importação aparece no histórico, com os leads contados como atualizados).

**Detalhes do contrato:**

- **O arquivo vai nas duas fases** (multipart, campo `arquivo`). Nada fica guardado no servidor entre o preview e a confirmação, então o backend continua sem estado e funciona mesmo se o servidor reiniciar no meio do caminho.
- **Leitura:**
  - só a primeira aba, com o cabeçalho na primeira linha não vazia e linhas totalmente vazias ignoradas;
  - cabeçalhos vazios viram "Coluna B", e repetidos ganham sufixo ("Obs (2)");
  - CSV com vírgula ou ponto e vírgula, em UTF-8 ou Windows-1252 (o padrão do Excel em português);
  - no CSV, tudo é lido como texto, para não perder zeros à esquerda;
  - no `.xlsx`, células com formato de porcentagem viram "75%" e datas viram "AAAA-MM-DD";
  - limites de 200 colunas e 20.000 linhas de dados.
- **Resposta do preview:** `{ nome_arquivo, colunas, amostra, total_linhas, campos, mapeamento_sugerido }`.
  - `amostra` são as 5 primeiras linhas no formato `{ coluna: valor }`.
  - `campos` traz os campos do modelo, com `rotulo` e `obrigatorio`.
  - `mapeamento_sugerido` tem o formato `{ campo: "Cabeçalho" | null }`, com um cabeçalho por campo no máximo.
- **Confirmação:** campo `mapeamento` em texto JSON, no formato `{ campo: "Cabeçalho da planilha" }`. As chaves são as da seção 4.4 (`responsavel_id` recebe a coluna "Quem mapeou?"), e `null` ou vazio deixa o campo sem mapear. As regras:
  - `cnpj` e `nome_lead` são obrigatórios;
  - uma coluna não pode servir a dois campos;
  - coluna inexistente ou campo desconhecido → 400.
  - Responde 201 com a importação: contagens, `erros`, `mapeamento` e `status`.
- **CNPJ:** com ou sem máscara. Zeros iniciais perdidos pelo Excel são recompostos (seção 4.1).
- **Notas** (`calculadora_icp`, `calculadora_midias_sociais`, `nota_final`), convertidas para a escala da organização:
  - número ou texto numérico é usado como está ("7,5", "1.234,5" e "1,234.5" são entendidos);
  - porcentagem é uma fração da escala ("75%" na escala 0-10 vira 7,5);
  - letra segue a `equivalencia_letras` ("B" = 75% da escala);
  - letra e porcentagem guardam o texto original em `dados_extras.originais.<campo>`;
  - valor fora de 0 até a escala, ou que não é número, invalida a linha.
- **Textos:** mesmos limites do cadastro manual (seção 10); texto maior invalida a linha.
- **Responsável:** o nome tem os espaços normalizados e é reaproveitado sem diferenciar maiúsculas.
- **Colunas não mapeadas** vão para `dados_extras` com o nome do cabeçalho, com textos limitados a 1.000 caracteres. Uma coluna chamada "originais" vira "originais (planilha)".
- **Contagens:** `inseridos + atualizados + ignorados = total_linhas`. `ignorados` são as linhas inválidas mais as duplicadas.
- **Erros:** `erros` guarda no máximo 1.000 itens `{ linha, motivo }`; `linha` é o número da linha no Excel. Se passar disso, o último item diz quantos ficaram de fora.
- **Falha de gravação:** se um lote falhar, os lotes anteriores continuam gravados, e a importação fica como `falhou` com as contagens até ali.
- Ao concluir, o score dos leads da importação é recalculado (seção 8.5).

## 8. Score de compensação (núcleo do sistema)

Implementado como funções puras (sem acesso ao banco), recebendo o lead e a configuração da organização, e totalmente testáveis. Os pesos ficam em `organizacoes.config_score`, nunca fixos no código. Os valores abaixo são o padrão (seção 8.6) e são editáveis na tela de configurações.

### 8.1 Regra de N/A (informação insuficiente)

- **Fator sem dado** (ex.: `capital_social` nulo): o fator fica N/A e é excluído; os pesos dos fatores disponíveis do mesmo pilar são redistribuídos proporcionalmente.
- **Pilar sem nenhum fator disponível:** o pilar fica nulo (N/A).
- **`score_parcial = true`** sempre que algum fator ou pilar ficar N/A por falta de dado do lead. Um fator desligado pela organização (ex.: lista de CNAEs prioritários vazia) é apenas ignorado e não torna o score parcial.
- A interface mostra "N/A" nos fatores e pilares nulos e um selo "Parcial — informação insuficiente" no score.

### 8.2 Fórmula

```
com valor e probabilidade:   score_compensacao = √(score_valor × score_probabilidade) ÷ (1 + score_esforco ÷ 100)
só um dos dois disponível:   score_compensacao = pilar_disponivel ÷ (1 + score_esforco ÷ 100)   (parcial)
nenhum dos dois:             score_compensacao = N/A (nulo; aparece no fim do ranking)
```

A média geométrica mantém a escala 0-100 (valor 70 e probabilidade 70 dão 70) e ainda pune desequilíbrio (100 e 10 dão ~32). Com esforço zero, a compensação é a média; com esforço máximo, é a metade dela. O resultado é limitado a 0-100.

### 8.3 Pilares

**`score_valor` (quanto o cliente pode render), 0-100:**

| Fator | Peso | Pontuação padrão |
| --- | --- | --- |
| Porte | 45% | Micro empresa 30, Pequeno porte 60, Demais 100. A BrasilAPI devolve `MICRO EMPRESA`, `EMPRESA DE PEQUENO PORTE`, `DEMAIS` ou `NÃO INFORMADO` (este último fica N/A) |
| Capital social | 40% | < 10 mil: 10; < 100 mil: 30; < 500 mil: 50; < 1 mi: 70; < 5 mi: 85; ≥ 5 mi: 100. Capital zero é N/A (seção 8.5) |
| Idade da empresa (`data_abertura`) | 15% | < 1 ano: 20; 1-3: 40; 3-5: 60; 5-10: 80; ≥ 10: 100 |

Até a revisão 6 o valor tinha um quarto fator, o CNAE prioritário. Ele mede encaixe no perfil de cliente, não quanto a empresa pode render, então foi redirecionado para o critério "setor" do perfil ideal (seção 8.7).

**`score_probabilidade` (chance de fechar), 0-100:**

| Fator | Peso | De onde vem |
| --- | --- | --- |
| `icp` (encaixe no perfil ideal) | 35% | Calculado pelo sistema com o perfil ideal da organização e os dados da Receita (seção 8.7). Sem perfil ideal configurado, ou sem dados para calculá-lo, usa `calculadora_icp` normalizada pela `escala_icp_max` |
| `qualificacao` | 40% | Bloco "qualificação" da avaliação do lead (seção 8.8). N/A enquanto o lead não for avaliado |
| `midias_sociais` | 25% | Bloco "mídias" da avaliação. Sem nenhuma resposta nesse bloco, usa `calculadora_midias_sociais` normalizada pela `escala_midias_max` |

**Regra de origem:** o que o sistema calcula ou a equipe responde no sistema prevalece sobre a nota da planilha, que continua aceita como alternativa (importação e cadastro). Cada fator registra a `origem` (`sistema`, `avaliacao` ou `planilha`) em `score_detalhes`. Um lead sem avaliação e sem perfil ideal configurado é calculado exatamente como na revisão 6.

**`score_esforco` (dificuldade de conquistar), 0-100, soma de penalidades limitada a 100:**

| Penalidade | Padrão | Regra |
| --- | --- | --- |
| `contato_decisor` | até +35 | O melhor canal disponível reduz a penalidade: telefone do decisor (`numero_decisor`) tira 100%, e-mail do decisor 60%, LinkedIn do decisor 40%, só telefone ou e-mail da empresa pela Receita 20%. Sem nenhum canal, +35. Substitui o antigo "sem número do decisor" |
| `sem_nome_decisor` | +25 | Sem nome do decisor. Se a Receita indicar um decisor provável entre os sócios (seção 9.1), a penalidade cai 50% (padrão) |
| `sem_redes_sociais` | +20 | Sem links em `lead_redes_sociais` e sem `@perfil` no texto original |
| `fora_ufs_atendidas` | +20 | Só com a lista `ufs_atendidas` configurada e a UF conhecida |
| Bloco "relacionamento" da avaliação | por resposta | Cada pergunta do bloco soma os pontos da opção escolhida. Padrão: "Como o lead chegou até vocês?" com frio +20, indicação +5, já conversamos 0, ex-cliente 0. Sem resposta: N/A |
| `tentativas_sem_resposta` | +5 por tentativa | Tentativas de contato seguidas sem resposta (tabela `interacoes`) além das 2 toleradas, até +30 |

Cada fato entra num pilar só: a existência de canais de contato e as tentativas sem resposta só no esforço; a qualidade da presença digital (checklist de mídias) só na probabilidade. O esforço fica parcial apenas quando falta a UF (com lista configurada) ou a resposta de uma pergunta do bloco relacionamento.

### 8.4 Situação cadastral

Se a `situacao_cadastral` for **conhecida** e diferente de ativa, `score_compensacao` é limitado a no máximo 10, e isso aparece explicitamente em `score_detalhes`. Situação desconhecida não limita o score (só o torna parcial).

### 8.5 Detalhes, recálculo e faixas

- **`score_detalhes` (jsonb):**
  ```
  { versao (2 a partir da revisão 7), config_em, formula ("media_geometrica" | "pilar_unico" | "na"), faixa ("alta" | "media" | "baixa" | "na"),
    compensacao_sem_limite, limite_situacao ({ situacao, limite } ou null), motivos_parcial: [texto],
    confianca:     { valor, com_dado, total },
    valor:         { valor, parcial, fatores: [{ fator, rotulo, peso, situacao, origem, valor_bruto, pontos, peso_efetivo, contribuicao, motivo?, itens? }] },
    probabilidade: { valor, parcial, fatores: [...] },
    esforco:       { valor, parcial, penalidades: [{ penalidade, rotulo, pontos, maximo, situacao, aplicada, motivo?, detalhe? }] },
    sugestoes:     [{ acao, rotulo, compensacao_simulada, faixa_simulada, ganho }],
    financeiro:    { ticket, origem_ticket, chance, origem_chance, valor_esperado, horas, valor_por_hora, motivo? } }
  ```
  - `situacao` de um fator: `ok`, `na` (falta dado do lead) ou `desligado` (peso zero ou lista vazia na configuração).
  - `origem` de um fator: `sistema` (calculado pelo sistema), `avaliacao` (respostas da equipe) ou `planilha` (nota importada ou digitada).
  - `itens` (fatores `icp` de origem `sistema`, `qualificacao` e `midias_sociais` de origem `avaliacao`): os critérios ou as perguntas que formaram o fator, cada um com `id`, `rotulo`, `resposta` (quando houver), `pontos` (nulo = N/A) e `peso`.
  - `pontos` de uma penalidade é o valor efetivamente aplicado (depois das reduções) e `maximo` o configurado; `detalhe` explica a conta (ex.: "Melhor canal: e-mail do decisor (−60%)"). As perguntas do bloco relacionamento viram penalidades com id `relacionamento:<pergunta>`.
  - `peso_efetivo` é o percentual depois da redistribuição dos N/A.
  - `config_em` é o `updated_at` da organização no momento do cálculo. Se a organização mudou depois, o score está desatualizado.
- **Recálculo automático:**
  - no cadastro manual;
  - na edição de `calculadora_icp`, `calculadora_midias_sociais`, `nome_decisor`, `numero_decisor` ou `redes_sociais`;
  - no fim de cada importação (leads da importação);
  - no enriquecimento (fase 6);
  - na avaliação do lead e no registro ou exclusão de uma interação (revisão 7);
  - na edição de `email_decisor` ou `linkedin_decisor` (revisão 7).

  Se o recálculo falhar, a operação principal continua válida, o erro vai para o log e o score pode ser refeito pela rota de lote. Depois de mudar escalas ou `config_score`, o frontend chama `POST /leads/recalcular-score`. O recálculo não é automático no `PUT /organizacao` para não deixar o salvamento lento em organizações grandes.
- **Faixas de exibição:** alta (70 ou mais), média (40 a 69), baixa (abaixo de 40) e N/A (nulo).

**Regras de borda do cálculo:**

- Porte, CNAE e situação cadastral são comparados sem acento e sem diferenciar maiúsculas. Porte sem pontuação configurada (ex.: "NÃO INFORMADO") é N/A.
- Capital social zero é N/A: na base da Receita, zero é o valor de quem não declara capital (empresário individual, associações etc.), então é falta de dado e não capital baixo. O zero continua gravado no lead e aparece como `valor_bruto` no detalhe.
- A idade é calculada em anos com fração na data do cálculo; data de abertura no futuro conta como 0 anos.
- A nota acima da escala (a organização pode ter reduzido a escala depois) é limitada a 100 no pilar.
- "Sem redes sociais nem site" é penalizado quando não há links em `lead_redes_sociais` e o texto original não tem um `@perfil`.
- Com a lista de UFs configurada e a UF desconhecida, a penalidade de UF não é aplicada, mas o score fica parcial.
- O cálculo fica no backend (funções puras testadas); a gravação é feita em lotes pela função SQL `gravar_scores`, que só altera leads da organização informada.

### 8.6 `config_score` padrão

```json
{
  "valor": {
    "pesos": { "porte": 45, "capital_social": 40, "idade": 15 },
    "porte": { "MICRO EMPRESA": 30, "EMPRESA DE PEQUENO PORTE": 60, "DEMAIS": 100 },
    "capital_social_faixas": [[10000, 10], [100000, 30], [500000, 50], [1000000, 70], [5000000, 85], [null, 100]],
    "idade_faixas": [[1, 20], [3, 40], [5, 60], [10, 80], [null, 100]]
  },
  "probabilidade": { "pesos": { "icp": 35, "qualificacao": 40, "midias_sociais": 25 } },
  "perfil_ideal": {
    "pesos": { "setor": 50, "porte": 30, "idade": 20 },
    "setores": [],
    "portes": [],
    "idade_minima": null
  },
  "esforco": {
    "contato_decisor": 35,
    "reducao_canais": { "telefone_decisor": 100, "email_decisor": 60, "linkedin_decisor": 40, "contato_empresa": 20 },
    "sem_nome_decisor": 25,
    "reducao_decisor_provavel": 50,
    "sem_redes_sociais": 20,
    "fora_ufs_atendidas": 20,
    "ufs_atendidas": [],
    "tentativas": { "toleradas": 2, "pontos_por_tentativa": 5, "maximo": 30 }
  },
  "avaliacao": { "perguntas": ["(modelo padrão da seção 8.8)"] },
  "financeiro": { "ticket_por_porte": {}, "horas_esforco_zero": null, "horas_esforco_maximo": null },
  "prioridade": { "dias_espera": 2, "dias_retomar": 7 },
  "reconsulta_dias": 90,
  "motivos_descarte": ["Sem orçamento", "Sem interesse", "Já tem fornecedor", "Não conseguimos contato", "Fora do perfil", "Outro"],
  "situacao_inativa_limite": 10,
  "faixas": { "alta": 70, "media": 40 },
  "equivalencia_letras": { "A": 100, "B": 75, "C": 50, "D": 25, "E": 0 }
}
```

Nas faixas, cada par é `[limite_superior_exclusivo, pontos]`; `null` é "acima do anterior". Na equivalência de letras, o valor é o percentual da escala da organização (ex.: com escala 0-10, "B" vira 7,5).

**Como a organização guarda e valida a configuração:**

- `organizacoes.config_score` guarda só o que a organização mudou. A configuração efetiva é o padrão acima mesclado com ela: as seções e os `pesos` são mesclados chave a chave; tabelas (`porte`, faixas, listas e `equivalencia_letras`) são substituídas inteiras quando definidas.
- `PUT /organizacao` substitui o `config_score` inteiro pelo enviado, que precisa respeitar a estrutura acima:
  - chaves desconhecidas são recusadas;
  - pontos, pesos e penalidades vão de 0 a 100;
  - as faixas têm limites crescentes e terminam em `null`;
  - CNAEs têm 7 dígitos (a máscara é removida);
  - UFs são siglas válidas;
  - letras vão de A a Z.
- Depois da mescla, os pesos de cada pilar não podem somar zero, e `faixas.alta` precisa ser maior que `faixas.media`.

**Chaves novas da revisão 7** (mesma mescla: seções e objetos de pesos e reduções chave a chave; listas, `ticket_por_porte`, `tentativas` e `avaliacao` substituídos inteiros):

- `perfil_ideal`: `setores` são CNAEs de 7 dígitos; `portes` são rótulos de porte da tabela `valor.porte`; `idade_minima` é um número de anos > 0 ou `null`; pesos de 0 a 100.
- `esforco`: pontos e reduções de 0 a 100; `tentativas` com inteiros ≥ 0 (`maximo` até 100).
- `avaliacao`: regras na seção 8.8.
- `financeiro`: `ticket_por_porte` com rótulos de porte e valores ≥ 0; horas > 0 ou `null`, com `horas_esforco_maximo` ≥ `horas_esforco_zero` quando os dois existem.
- `prioridade`: inteiros de 0 a 365. `reconsulta_dias`: inteiro de 0 (desliga) a 3650.
- `motivos_descarte`: de 1 a 20 textos únicos de até 60 caracteres.

**Migração das configurações gravadas antes da revisão 7** (feita por SQL na migração da revisão 7, sem perder o que a organização mudou): `valor.cnaes_prioritarios` vira `perfil_ideal.setores`; `valor.pesos.cnae` é removido; `esforco.sem_numero_decisor` vira `esforco.contato_decisor`; `probabilidade.pesos` com só `icp` e `midias_sociais` ganha `qualificacao` pelo padrão na mescla.

### 8.7 Perfil ideal (encaixe automático)

Cada organização descreve o cliente que quer conquistar, e o sistema calcula o fator `icp` sozinho com os dados da Receita, sem depender da calculadora da planilha.

| Critério | Pontos | Desligado quando |
| --- | --- | --- |
| `setor` | 100 se o CNAE principal está em `setores`, 0 se não | lista vazia |
| `porte` | 100 se o porte está em `portes`, 0 se não | lista vazia |
| `idade` | 100 se a empresa tem `idade_minima` anos ou mais; abaixo disso, proporcional (`idade ÷ idade_minima × 100`) | `idade_minima` nulo |

- A nota é a média ponderada dos critérios ligados, com a mesma regra de N/A dos pilares: critério sem o dado do lead (ex.: ainda não enriquecido) sai da conta e o peso vai para os outros.
- Perfil não configurado (todos os critérios desligados) ou sem nenhum critério calculável: o fator usa `calculadora_icp` (origem `planilha`). Sem ela também, o fator é N/A.
- A região não entra aqui porque já está no esforço (`ufs_atendidas`). Regime tributário, MEI, CNAEs secundários e natureza jurídica podem virar critérios no futuro (seção 16).

### 8.8 Avaliação do lead (questionário no sistema)

A equipe responde perguntas sobre o lead, e as respostas alimentam o cálculo. O sistema traz um modelo padrão, e o admin de cada organização pode mudar textos, opções, pontos e pesos, tirar ou incluir perguntas (`config_score.avaliacao`).

**Estrutura de uma pergunta:** `{ id, bloco, texto, peso, opcoes: [{ id, rotulo, pontos }] }`.

- `bloco`: `qualificacao` e `midias` viram os fatores `qualificacao` e `midias_sociais` da probabilidade (média ponderada dos pontos das respostas, com `peso` por pergunta). `relacionamento` soma ao esforço os pontos da opção escolhida em cada pergunta (o `peso` é ignorado nesse bloco).
- `pontos` de 0 a 100; `null` marca a opção "não sei", que conta como N/A (a pergunta sai da conta e o peso vai para as outras). Pergunta sem resposta também é N/A.
- Validação: até 30 perguntas; `id` de pergunta e de opção em `^[a-z0-9_]{1,40}$`, únicos entre as perguntas e entre as opções de cada pergunta; texto de 1 a 200 caracteres; rótulo de 1 a 80; de 2 a 8 opções; peso de 0 a 100. Em `qualificacao` e `midias`, com pelo menos uma pergunta, a soma dos pesos do bloco precisa ser maior que zero.

**Modelo padrão:**

| Bloco | Pergunta (`id`) | Peso | Opções (pontos) |
| --- | --- | --- | --- |
| qualificacao | A empresa tem orçamento para isso? (`orcamento`) | 30 | Sim, confirmado (100) · Provavelmente (60) · Não (0) · Não sei (N/A) |
| qualificacao | Vocês estão falando com quem decide? (`decisor`) | 25 | Sim (100) · Com quem influencia (60) · Não (20) · Não sei (N/A) |
| qualificacao | A necessidade está clara? (`necessidade`) | 30 | Muito clara (100) · Alguma (60) · Pouca (30) · Nenhuma (0) · Não sei (N/A) |
| qualificacao | Quando pretendem decidir? (`prazo`) | 15 | Em até 1 mês (100) · Em até 3 meses (70) · Em até 6 meses (40) · Sem prazo (10) · Não sei (N/A) |
| midias | Tem perfil ativo em alguma rede social? (`perfil_ativo`) | 30 | Sim (100) · Não (0) · Não sei (N/A) |
| midias | Publica pelo menos uma vez por semana? (`frequencia`) | 25 | Sim (100) · Não (0) · Não sei (N/A) |
| midias | Tem site profissional? (`site`) | 25 | Sim (100) · Não (0) · Não sei (N/A) |
| midias | Faz anúncios pagos? (`anuncios`) | 20 | Sim (100) · Não (0) · Não sei (N/A) |
| relacionamento | Como o lead chegou até vocês? (`origem_contato`) | — | Contato frio (+20) · Indicação (+5) · Já conversamos antes (0) · Já foi cliente (0) · Não sei (N/A) |

Os ids das opções seguem o rótulo sem acento (`confirmado`, `provavelmente`, `nao`, `nao_sei`, `sim`, `influencia`, `muito_clara`, `alguma`, `pouca`, `nenhuma`, `ate_1_mes`, `ate_3_meses`, `ate_6_meses`, `sem_prazo`, `frio`, `indicacao`, `ja_conversamos`, `ex_cliente`).

**Respostas do lead** (`PUT /leads/:id/avaliacao`):

- Corpo: `{ respostas: { <pergunta>: <opção> | null }, ticket_estimado?: número ≥ 0 | null }`. As respostas enviadas substituem as anteriores inteiras (a tela envia o questionário completo). Pergunta ou opção que não existe no modelo atual → 400.
- Grava `avaliacao`, `ticket_estimado`, `avaliado_em` e `avaliado_por`, recalcula e responde o detalhe do lead.
- Se uma pergunta sair do modelo depois, a resposta guardada é ignorada no cálculo. Se o lead nunca foi avaliado, os fatores voltam para a planilha (ou N/A), como em qualquer lead sem avaliação.

### 8.9 Saídas complementares

Calculadas junto com o score, pelas mesmas funções puras, e gravadas em `score_detalhes` (a confiança também em `score_confianca`). Não mudam a fórmula da compensação nem a ordenação.

- **Confiança:** quantos itens do cálculo tinham dado. Contam os fatores de valor e de probabilidade ligados, as penalidades de esforço ligadas e a situação cadastral; desligados não contam. `valor = com_dado ÷ total × 100`. Exemplo: "9 de 10".
- **Sugestões (o que fazer para aumentar):** até 5, em ordem de ganho. Para cada ação simulável, o cálculo roda de novo com o dado preenchido e registra `compensacao_simulada`, `faixa_simulada` e `ganho`:
  - `telefone_decisor` (quando `contato_decisor` aplica pontos);
  - `nome_decisor` ou `usar_decisor_provavel` (quando `sem_nome_decisor` aplica pontos);
  - `redes_sociais` (quando `sem_redes_sociais` aplica pontos).

  Ações que completam o cálculo mas não têm como prever o resultado entram depois, com `ganho` nulo: `avaliar_qualificacao`, `avaliar_midias`, `avaliar_relacionamento` e `enriquecer` (lead nunca enriquecido).
- **Estimativa em reais (`financeiro`):**
  - `ticket`: o `ticket_estimado` do lead (origem `lead`) ou o `ticket_por_porte` do porte dele (origem `porte`). Sem ticket, todos os campos ficam nulos, com `motivo`.
  - `chance`: a taxa de conversão observada da faixa do lead quando a organização tem pelo menos 20 desfechos nessa faixa (origem `historico`, seção 8.10); antes disso, `score_probabilidade ÷ 100` (origem `indice`). A tela deixa claro que o índice é uma estimativa, não uma probabilidade medida. O cálculo recebe as taxas da organização como parâmetro, para continuar puro.
  - `valor_esperado = ticket × chance`.
  - `horas = horas_esforco_zero + (horas_esforco_maximo − horas_esforco_zero) × esforço ÷ 100`, quando as duas estão configuradas; `valor_por_hora = valor_esperado ÷ horas`.

### 8.10 Desfecho, prioridade e aprendizado

- **Desfecho:** quando o status muda para `convertido` ou `descartado`, o backend grava `desfecho_em` e `desfecho_score` (cópia do score naquele momento). Descartar exige `motivo_descarte`, um dos `motivos_descarte` da organização (400 sem ele). Se o status voltar para outra etapa, os três campos são limpos. Recálculos depois do desfecho não alteram `desfecho_score`.
- **Prioridade** (`GET /leads/prioridade`): duas listas, cada uma por compensação decrescente (N/A no fim), com filtro opcional `responsavel_id` e `limite` (padrão 10, máximo 50):
  - `abordar`: status `novo` e nenhuma interação nos últimos `dias_espera` dias;
  - `retomar`: status `em_contato` ou `qualificado` e última interação há `dias_retomar` dias ou mais (ou nenhuma).

  Cada item traz o resumo do lead (`id`, `nome_lead`, `cnpj`, `score_compensacao`, faixa, `score_parcial`, `status`, `responsavel`, `ultima_interacao_em`, `tentativas_sem_resposta`) e um `motivo` em texto (ex.: "sem contato há 9 dias").
- **Conversão por faixa** (`GET /dashboard/conversao`): para os leads com desfecho, por faixa registrada em `desfecho_score`: convertidos, descartados e taxa (`convertidos ÷ (convertidos + descartados)`); e a contagem por motivo de descarte.
- **Sugestão de pesos** (`GET /organizacao/sugestao-pesos`, admin):
  - Exige pelo menos 30 convertidos e 30 descartados com `desfecho_score` da versão 2. Com menos, responde `{ suficiente: false, convertidos, descartados, minimo }`.
  - Valor e probabilidade: para cada fator, a média dos pontos nos convertidos menos a média nos descartados (só leads com o fator `ok`). Os pesos sugeridos são proporcionais às diferenças positivas, com mínimo de 5, e somam 100 em cada pilar.
  - Esforço: para cada penalidade, a taxa de conversão de quem tinha a penalidade aplicada comparada à de quem não tinha. Os pontos sugeridos são proporcionais à queda, de 0 a 50.
  - Responde os pesos atuais e os sugeridos, com o número de leads usado em cada um. Só sugere: aplicar é decisão do admin, pelo `PUT /organizacao`.

**Detalhes do contrato (revisão 7):**

- **Interações:**
  - `ocorreu_em` aceita `AAAA-MM-DD` (meia-noite UTC) ou data e hora com fuso. Data e hora sem fuso e datas impossíveis são recusadas (400), e há tolerância de 5 minutos para o futuro.
  - A resposta de cada interação traz `perfil: { id, nome }` de quem registrou.
  - Um lead de outra organização responde 404.
  - O resumo do lead é recalculado pela função SQL `atualizar_resumo_interacoes`. Se ela falhar depois da gravação, a rota responde 500, mas a interação fica gravada e o resumo se corrige na próxima interação registrada ou excluída.
- **Contatos do decisor:** `linkedin_decisor` sem protocolo é gravado com `https://` na frente; outros protocolos e endereços sem domínio são recusados.
- **Motivo de descarte:**
  - A comparação com `motivos_descarte` ignora maiúsculas, e o texto é gravado como está configurado.
  - Quando o status final não é `descartado`, um motivo enviado é ignorado e gravado como nulo.
  - Apagar o motivo de um lead descartado responde 400.
- **Lead cadastrado já com desfecho** (`POST /leads` com status `convertido` ou `descartado`): `desfecho_score` é copiado logo depois do primeiro cálculo. Se a cópia falhar, o erro vai para o log e o lead conta na faixa N/A da conversão.
- **Prioridade:** o `motivo` é "nenhuma interação registrada", "última interação hoje" ou "sem contato há N dias", com "(N tentativas sem resposta)" quando houver. `responsavel_id` malformado ou de outra organização responde 400.
- **Conversão:** `taxa` é uma fração com 4 casas, e os motivos vêm do mais frequente para o menos frequente.
- **Sugestão de pesos:**
  - Cada pilar vem como `{ atuais, sugeridos, fatores | penalidades }`, com o número de `leads` em cada item.
  - Um fator com peso atual 0 continua 0, e um fator sem comparação possível fica no mínimo de 5. Um pilar sem nenhuma diferença positiva vem com `sugeridos: null`.
  - No esforço, a maior queda de conversão recebe 50 pontos e as outras são proporcionais. Queda zero ou negativa dá 0, e uma penalidade sem os dois grupos ("com" e "sem") dá `null`.
  - O valor "atual" de `tentativas_sem_resposta` é `tentativas.maximo`, e o de `relacionamento:<pergunta>` é a maior pontuação entre as opções da pergunta.

## 9. Enriquecimento por CNPJ

Serviço que consulta a BrasilAPI (`https://brasilapi.com.br/api/cnpj/v1/{cnpj}`, gratuita e sem chave) e preenche as colunas de enriquecimento do lead. A BrasilAPI repassa os dados da Minha Receita (base pública da Receita Federal).

**De-para da resposta** (campo ausente ou fora do formato vira nulo, ou seja, N/A no score):

| Coluna do lead | Campo da BrasilAPI | Observação |
| --- | --- | --- |
| `razao_social` | `razao_social` | |
| `porte` | `porte` | `MICRO EMPRESA`, `EMPRESA DE PEQUENO PORTE`, `DEMAIS` ou `NÃO INFORMADO` |
| `capital_social` | `capital_social` (número) | Zero é gravado, mas o score o trata como N/A (seção 8.5) |
| `cnae_principal` | `cnae_fiscal` (número) | Gravado com 7 dígitos: o zero inicial perdido no número é recomposto (`111301` → `0111301`) |
| `data_abertura` | `data_inicio_atividade` (`AAAA-MM-DD`) | |
| `cidade` | `municipio` | |
| `uf` | `uf` | |
| `situacao_cadastral` | `descricao_situacao_cadastral` | `ATIVA`, `BAIXADA`, `INAPTA`, `SUSPENSA` ou `NULA` |
| `enriquecido_em` | (data e hora da consulta) | |

**Resultado de cada consulta:**

| Resposta da BrasilAPI | Situação do lead |
| --- | --- |
| 200 | `concluido`: dados gravados e score recalculado |
| 404 | `nao_encontrado`: CNPJ válido que não está na base da Receita |
| 400 para CNPJ alfanumérico | `nao_suportado` (o backend já validou os dígitos, então só pode ser falta de suporte) |
| 403, 408, 429, 5xx, falha de rede, tempo esgotado (10 s) ou resposta ilegível | Passageira: volta para `pendente` com espera de 30 s e depois 2 min; na 3ª tentativa vira `erro` |
| Outros 4xx | `erro` |

Em `nao_encontrado`, `nao_suportado` e `erro`, o motivo fica em `enriquecimento_erro` e os dados de um enriquecimento anterior são mantidos. A BrasilAPI bloqueia o User-Agent padrão do Node, então o backend envia um próprio.

- **Individual** (`POST /leads/:id/enriquecer`): reserva o lead, consulta na hora e devolve o detalhe atualizado (200, com o resultado em `enriquecimento_status`). Se o lead já estiver em processamento, 409. Se a BrasilAPI estiver fora do ar, o lead entra na fila para nova tentativa e a resposta é 503.
- **Em lote** (`POST /leads/enriquecer-lote`, corpo opcional `{ ids }` com até 1.000 ids):
  - sem `ids`, entram os leads da organização nunca solicitados ou que terminaram em `erro`;
  - com `ids`, entram esses leads, mesmo já enriquecidos (para atualizar os dados);
  - leads já na fila não entram de novo;
  - responde 202 com `{ enfileirados }`.
- **Processador:** roda dentro do próprio backend e consome a fila do banco um lead por vez, com 1 s de pausa entre consultas (cerca de 3.000 leads por hora).
  - A fila alterna entre organizações (rodízio pela última atendida), para uma importação grande não travar as outras.
  - Com a BrasilAPI fora do ar, a pausa cresce a cada falha seguida (30 s, 60 s... até 5 min), para não gastar as tentativas de toda a fila na mesma queda.
- **Resiliência:** o estado fica no banco. Reservar um lead o marca como `processando` com prazo de 5 minutos. Se o servidor cair no meio, o lead volta para `pendente` quando o prazo vence (ou vira `erro`, se já esgotou as tentativas). O processador começa junto com o servidor e retoma a fila sozinho.
- **Funções SQL** (sem acesso pela API pública):
  - `enfileirar_enriquecimento`;
  - `pegar_proximo_enriquecimento`: rodízio, reserva com `skip locked` e recuperação de reservas vencidas;
  - `reservar_enriquecimento`: reserva do enriquecimento individual;
  - `contar_enriquecimento`.
- **Progresso:** `GET /leads/enriquecimento/status` devolve `{ nao_solicitado, pendente, processando, concluido, nao_encontrado, nao_suportado, erro, total }`. O frontend consulta essa rota periodicamente enquanto houver pendentes.
- **Plano gratuito:** o processador só anda com o servidor acordado. No Render, o servidor dorme após ~15 min sem requisições; enquanto a tela de progresso estiver aberta, as consultas de status o mantêm acordado.
- Ao concluir cada lead, o score dele é recalculado.

### 9.1 Campos ampliados e reconsulta (revisão 7)

A mesma resposta da BrasilAPI passa a preencher também:

| Coluna do lead | Campo da BrasilAPI | Observação |
| --- | --- | --- |
| `telefone_receita` | `ddd_telefone_1` (ou `ddd_telefone_2`, se o primeiro vier vazio) | Só dígitos; muitas vezes é o telefone do contador da empresa |
| `email_receita` | `email` | Em minúsculas |
| `socios` | `qsa` | Só `nome_socio` e `qualificacao_socio`, até 20 sócios. CPF, faixa etária e os demais campos do quadro societário não são gravados (LGPD) |

- **Decisor provável:** o primeiro sócio cuja qualificação contenha "ADMINISTRADOR", "PRESIDENTE", "DIRETOR" ou "GERENTE" (sem acento, sem diferenciar maiúsculas); sem nenhum assim, o único sócio quando houver só um. É calculado a partir de `socios`, não é gravado à parte, e aparece como sugestão: a equipe confirma copiando o nome para `nome_decisor`. Enquanto `nome_decisor` estiver vazio, ele reduz a penalidade `sem_nome_decisor` (seção 8.3).
- **Contato da empresa:** `telefone_receita` ou `email_receita` preenchido conta como o canal `contato_empresa` do esforço.
- **Telefone e e-mail:** sem `ddd_telefone_1` válido, usa o `ddd_telefone_2`; telefone fora de 8 a 15 dígitos ou e-mail fora do formato (ou com mais de 200 caracteres) ficam nulos, sem truncar.
- **Reconsulta periódica:** ao iniciar o servidor e depois a cada 24 h com ele acordado, o processador coloca na fila (função `enfileirar_reconsulta`) os leads com enriquecimento `concluido` e `enriquecido_em` mais antigo que `reconsulta_dias` (padrão 90; 0 desliga), exceto os que já têm desfecho. Leads que terminaram em `nao_encontrado`, `nao_suportado` ou `erro` ficam de fora, para não voltarem à fila todo dia; eles continuam podendo ser enfileirados pelo `POST /leads/enriquecer-lote`. A reconsulta usa a mesma fila, as mesmas regras de tentativa e o mesmo rodízio entre organizações.
- **Mudanças na Receita:** quando uma consulta muda a `situacao_cadastral` ou o `porte` de um lead que já tinha sido enriquecido (com o valor antigo e o novo conhecidos), o backend grava `ultima_mudanca_receita` (`{ em, mudancas: [{ campo, de, para }] }`). O resumo do dashboard passa a trazer a lista das mudanças mais recentes (fase 11).

## 10. API (backend Express)

Organização de pastas: `src/config`, `src/middlewares`, `src/routes`, `src/controllers`, `src/services`, `src/utils`. Erros sempre no formato `{ "erro": "mensagem" }` com o status HTTP correto (400, 401, 403, 404, 409, 413, 429, 500, 502, 503). Erros inesperados respondem 500 com mensagem genérica; o detalhe fica só no log do servidor. Um `:id` malformado responde 404, igual a um recurso inexistente. O `organizacao_id` nunca é parâmetro: vem do usuário autenticado. Respostas e corpos em JSON, com nomes de campos iguais aos do banco (`snake_case`).

Legenda de acesso: **P** = pública; **T** = só token (`autenticar`); **O** = token e perfil (`autenticar` + `exigirPerfil`); **A** = perfil `admin`.

| Método e rota | Acesso | Função |
| --- | --- | --- |
| `GET /` | P | Retorna `{ "mensagem": "API de Leads online" }` |
| `GET /saude` | P | Confere a conexão com o banco |
| `GET /me` | T | Usuário, perfil e organização; sem perfil, `perfil: null` e `convites_pendentes` |
| `POST /onboarding` | T | Cria a organização e o perfil `admin` (`nome_organizacao` obrigatório, `nome` opcional); 201 com o mesmo formato de `/me`; 403 sem e-mail confirmado; 409 se já tiver perfil |
| `POST /convites/:id/aceitar` | T | Aceita convite destinado ao e-mail do usuário e cria o perfil (`nome` opcional); responde no formato de `/me`; 404 se o convite não for dele ou não estiver pendente |
| `GET /organizacao` | O | A organização com `config_score` (só o que ela mudou), `config_padrao` e `config_efetivo` (padrão mesclado), para o frontend exibir faixas e motivos e editar a configuração (fase 10). Para salvar, o frontend envia em `PUT /organizacao` só as seções que diferem do padrão |
| `PUT /organizacao` | A | Atualiza só os campos enviados entre `nome`, escalas (> 0) e `config_score` (validado, seção 8.6); responde a organização |
| `GET /membros` | A | Lista membros |
| `POST /membros/convite` | A | Convida por e-mail (`email`, `papel` padrão `membro`); 201 com `{ convite, email_enviado }` |
| `GET /convites`, `DELETE /convites/:id` | A | Lista e cancela (204) convites pendentes |
| `GET /responsaveis` | O | Lista responsáveis da organização, por nome |
| `POST /responsaveis` | O | Cadastra responsável (`nome`); 201; 409 se o nome já existir (sem diferenciar maiúsculas) |
| `GET /leads` | O | Lista com filtros `status`, `faixa` (`alta`, `media`, `baixa` ou `na`, pelos limites de `faixas` da organização; revisão 7), `busca`, ordenação `ordem` (`score_compensacao`, `nota_final`, `created_at`), `direcao` (`asc`, `desc`), `pagina` (a partir de 1) e `limite` (padrão 20, máximo 100); padrão: `score_compensacao` decrescente; nulos (N/A) sempre por último. A `busca` (até 100 caracteres) procura em `nome_lead`, `nome_decisor`, `razao_social` e no CNPJ sem máscara. Responde `{ leads, total, pagina, limite }`; cada lead inclui `responsavel` (`{ id, nome }` ou nulo) e `lead_redes_sociais` |
| `GET /leads/enriquecimento/status` | O | Progresso da fila: quantidade de leads por situação (seção 9) |
| `GET /leads/:id` | O | Detalhe do lead (todas as colunas, `responsavel` e `lead_redes_sociais`) |
| `POST /leads` | O | Cadastro manual: `cnpj` e `nome_lead` obrigatórios, mais os campos editáveis; 201 com o detalhe; 409 se o CNPJ já existir na organização |
| `PUT /leads/:id` | O | Atualiza só os campos editáveis enviados (`null` limpa um campo opcional); `cnpj` não é editável (400) |
| `DELETE /leads/:id` | O | Exclui o lead (204) |
| `POST /importacoes/preview` | O | Fase 1 da importação (multipart: `arquivo`, até 5 MB, `.xlsx` ou `.csv`); não grava nada; 413 se passar de 5 MB |
| `POST /importacoes` | O | Fase 2 (multipart: `arquivo` e `mapeamento` em JSON): processa e responde 201 com a importação |
| `GET /importacoes`, `GET /importacoes/:id` | O | Histórico (últimas 100, sem `erros` e `mapeamento`) e detalhe (com erros por linha e o De-Para usado) |
| `POST /leads/:id/enriquecer` | O | Enriquecimento individual; responde o detalhe do lead (200), 409 se já estiver em processamento, 503 se a BrasilAPI estiver fora do ar (o lead vai para a fila) |
| `POST /leads/enriquecer-lote` | O | Coloca leads na fila (corpo opcional `{ ids }`, até 1.000); 202 com `{ enfileirados }` (seção 9) |
| `POST /leads/:id/calcular-score` | O | Recalcula o score de um lead e responde o detalhe do lead |
| `POST /leads/recalcular-score` | O | Recalcula todos os leads da organização; responde `{ recalculados }` |
| `GET /dashboard/resumo` | O | Total de leads, contagem por status, média do score, top 10 por compensação, leads sem enriquecimento e leads com score parcial; na revisão 7, também as mudanças recentes na Receita (seção 9.1) |
| `GET /avaliacao/modelo` | O | Modelo de perguntas efetivo da organização (padrão mesclado com o configurado), para montar a tela de avaliação (revisão 7) |
| `PUT /leads/:id/avaliacao` | O | Grava a avaliação do lead (seção 8.8), recalcula e responde o detalhe do lead |
| `GET /leads/:id/interacoes` | O | Interações do lead, da mais recente para a mais antiga (revisão 7) |
| `POST /leads/:id/interacoes` | O | Registra uma interação (`tipo`, `teve_resposta`, `observacao` e `ocorreu_em` opcionais), atualiza o resumo do lead e recalcula; 201 com a interação |
| `DELETE /leads/:id/interacoes/:interacaoId` | O | Exclui uma interação (quem registrou ou um admin; 403 para os outros), atualiza o resumo e recalcula; 204 |
| `GET /leads/prioridade` | O | Fila de prioridade `{ abordar, retomar }` (seção 8.10) |
| `GET /dashboard/conversao` | O | Conversão por faixa e contagem por motivo de descarte (seção 8.10) |
| `GET /organizacao/sugestao-pesos` | A | Sugestão de pesos a partir dos desfechos (seção 8.10) |

Rotas fixas como `/leads/enriquecimento/status`, `/leads/enriquecer-lote`, `/leads/recalcular-score` e `/leads/prioridade` são registradas antes de `/leads/:id`.

**Campos editáveis de um lead** (lista branca de `POST` e `PUT`; outros campos enviados são ignorados):

- textos: `nome_lead` (até 200 caracteres), `nome_decisor` (150), `numero_decisor` (50), `link_cnpj` (500), `redes_sociais` (2000);
- notas: `calculadora_icp`, `calculadora_midias_sociais` e `nota_final`, números de 0 até a escala da organização (ex.: ICP 15 é recusado numa escala de 0 a 10);
- `status`, um valor do ENUM;
- `responsavel_id`, que precisa ser da mesma organização (400 se não for);
- revisão 7: `email_decisor` (até 200 caracteres, formato de e-mail, gravado em minúsculas), `linkedin_decisor` (até 500, URL) e `motivo_descarte` (um dos `motivos_descarte`; obrigatório quando o status passa a `descartado`, seção 8.10).

A avaliação (`avaliacao`, `ticket_estimado`) não entra nesta lista: tem rota própria. Os campos de resumo das interações e de desfecho são mantidos pelo backend e nunca aceitos do cliente.

Os links do texto de `redes_sociais` são acrescentados em `lead_redes_sociais` (seção 4.3).

## 11. Frontend (React, Vite, Tailwind)

A aplicação tem um serviço de API (axios) com URL base do `.env` e um interceptor que anexa o token da sessão do Supabase Auth. As funções do serviço correspondem exatamente às rotas da seção 10. O visual (layout, cores e componentes) segue o protótipo aprovado na fase 8.

**Telas:**

- **Login e cadastro** (Supabase Auth), com aviso para confirmar o e-mail. Após o login, se `GET /me` vier sem perfil: tela de convites pendentes ou de onboarding (seção 6).
- **Layout** com cabeçalho "Gestão de Leads", nome da organização e usuário logado, e uma barra "Sites Úteis" com links externos (`target="_blank"`, `rel="noopener noreferrer"`) para casadosdados.com.br, econodata.com.br, cnpj.biz e consultasocio.com.
- **Dashboard:** cards (total, por status, média do score, sem enriquecimento, score parcial), ranking dos 10 leads que mais compensam e, na revisão 7, conversão por faixa e mudanças recentes na Receita.
- **Nome na interface:** o score de compensação aparece como **"Potencial"** (alto, médio, baixo, N/A); no banco e na API os nomes continuam os do contrato.
- **Lista de leads:** filtro por faixa de potencial (`faixa`) além do status; tabela com Compensação, Nome do Lead, CNPJ, Nome do Decisor, Redes Sociais, Nota Final (original), Responsável, Status e Ações. Filtro por status, busca com debounce e paginação. O score aparece como barra ou badge por faixa (incluindo N/A e selo de parcial); a nota final original usa cores condicionais (verde, amarelo, vermelho), respeitando a escala da organização; o status aparece como badge colorida. CNPJ exibido com máscara.
- **Detalhe do lead** (painel lateral ou página): o medidor de compensação em destaque, com os três pilares, a contribuição de cada fator (N/A onde faltar dado), a confiança, as sugestões de como aumentar e a estimativa em reais, tudo a partir de `score_detalhes`. Abaixo, dados originais, dados da Receita (incluindo o decisor provável, com a opção de usá-lo), redes sociais e a lista de interações com o botão de registrar uma nova. Ações: avaliar, avançar status, descartar (pedindo o motivo), editar, excluir com confirmação, enriquecer e recalcular.
- **Avaliar lead** (revisão 7): o questionário em blocos (qualificação, mídias, relacionamento), montado a partir de `GET /avaliacao/modelo`, com o ticket estimado; ao salvar, mostra o novo valor do medidor.
- **Prioridade** (revisão 7): as listas "abordar" e "retomar" de `GET /leads/prioridade`, filtráveis por responsável.
- **Importação em 3 passos:** (1) enviar o arquivo; (2) preview com amostra e um select por campo do modelo padrão, pré-preenchido pelo `mapeamento_sugerido`, validando `cnpj` e `nome_lead`; (3) resultado com inseridos, atualizados, ignorados e erros por linha. Inclui o histórico de importações e a opção de enfileirar o enriquecimento e recalcular o score dos leads importados, com barra de progresso.
- **Configurações** (admin): escalas das calculadoras, pesos e faixas do score, perfil ideal (setores, portes, idade mínima), perguntas da avaliação, canais e penalidades de esforço, UFs atendidas, ticket por porte e horas, motivos de descarte, reconsulta, equivalência de letras, membros e convites. Mostra também a sugestão de pesos quando houver desfechos suficientes.

### 11.1 Visual aprovado (fase 8) e base do frontend (fase 9)

- **Interface neutra, potencial em azul:**
  - Botões, menus e textos são em preto e branco (tinta).
  - O azul é reservado ao medidor de potencial, numa escala de um tom só: baixo, médio e alto vão do claro para o escuro. Essa escala foi validada para daltonismo nos dois temas.
  - Verde, âmbar e vermelho ficaram de fora das faixas porque reprovaram no teste de daltonismo. Continuam só na nota final da planilha.
- **A faixa nunca depende só da cor:**
  - um ícone de sinal com 1, 2 ou 3 barras;
  - o nome escrito (Baixo, Médio, Alto ou N/A);
  - `role="meter"` com `aria-valuetext` (ex.: "47,1 de 100, potencial médio, parcial").
- **Tema claro e escuro:**
  - O escuro é quase preto, não azul-marinho, e cada tema tem as próprias cores.
  - A escolha fica no navegador (`gl-tema`); sem escolha, segue o sistema operacional.
  - O tema é aplicado antes da primeira pintura, para não piscar.
- **Medidores:**
  - O arco semicircular aparece só no destaque do detalhe e na avaliação.
  - Na tabela e nos rankings, o medidor é uma barra com as divisões de 40 e 70.
  - As animações são curtas (arco em 0,75 s), não rodam nas tabelas e se desligam com `prefers-reduced-motion`.
- **Telas do protótipo:**
  - login e primeiro acesso;
  - potencial (dashboard);
  - lista com filtros de potencial e de status;
  - detalhe com o medidor, a confiança, a estimativa em reais, as sugestões, o fator a fator e as interações;
  - avaliar lead;
  - prioridade;
  - importação;
  - configurações em 6 abas.
- **Base do frontend** (`frontend/`): Vite 8, React 19, React Router 8 (modo de dados, `createBrowserRouter`; o pacote `react-router-dom` não existe mais e o React Router 8 exige Node 22.22 ou mais), Tailwind CSS 4 e axios.
  - Os tokens de cor ficam em variáveis CSS (`:root` e `.dark`) ligadas aos utilitários do Tailwind por `@theme inline`.
  - Organização de pastas: `src/config`, `src/servicos` (`api.js`, `supabase.js`), `src/contextos` (tema e autenticação), `src/componentes`, `src/paginas`, `src/rotas` e `src/utils`.
- **Rotas do frontend:**
  - `/entrar` (só sem sessão);
  - `/primeiro-acesso` (com sessão e sem perfil);
  - as telas do sistema, com perfil: `/`, `/leads`, `/leads/:id`, `/leads/:id/avaliar`, `/prioridade`, `/importacao` e `/configuracoes`.
- **Erros:** a API devolve `{ erro }`, e o serviço converte em `{ status, mensagem }`. Os erros do Supabase Auth são traduzidos pelo código (credenciais inválidas, e-mail não confirmado, conta já existente, limite de envio).

### 11.2 Telas (fase 10)

- **Configuração da organização:** um contexto carrega `GET /organizacao` uma vez no layout. Todas as telas leem dali as faixas do medidor, os motivos de descarte e os prazos da prioridade.
- **Lista de leads:**
  - os filtros de faixa e status, a busca (com espera de 300 ms), a ordenação e a página vão para os parâmetros de `GET /leads`;
  - "Novo lead" abre um formulário;
  - "Enriquecer pendentes" chama `POST /leads/enriquecer-lote`.
- **Detalhe:**
  - o medidor em arco, os pilares, a fórmula, a estimativa em reais, as sugestões e o fator a fator saem de `score_detalhes`;
  - o "decisor provável" pode ser copiado para o nome do decisor;
  - "Avançar" segue o funil (novo → em contato → em negociação → convertido);
  - "Descartar" pede o motivo.
- **Avaliar:**
  - a prévia do medidor é uma simulação no navegador, feita com o `score_detalhes` atual e as respostas marcadas;
  - o valor oficial é o que o backend calcula ao salvar;
  - a pergunta sem resposta é enviada como `null` ("não sei").
- **Importação:** depois de importar, a tela consulta `GET /leads/enriquecimento/status` a cada 4 segundos enquanto houver leads na fila.
- **Configurações** (só admin), em 6 abas: cálculo do potencial, perfil ideal, perguntas da avaliação, negócio e funil, escalas da planilha e equipe.
  - Edita-se a configuração efetiva. Ao salvar, vão para `PUT /organizacao` só as seções de topo que diferem do padrão; voltar ao padrão é salvar a configuração sem essas seções.
  - Depois de salvar, a tela oferece recalcular todos os leads (`POST /leads/recalcular-score`), porque o potencial gravado não muda sozinho.
- **Dashboard** (`/`): fica para a fase 11, com os gráficos.

## 12. Deploy (tudo gratuito)

O Supabase sozinho não hospeda o backend Express: ele oferece banco, autenticação e Edge Functions, mas as Edge Functions rodam em Deno, por pouco tempo a cada chamada, o que obrigaria a reescrever a API e inviabilizaria a fila de enriquecimento contínua. Por isso:

| Parte | Serviço (plano gratuito) | Observação |
| --- | --- | --- |
| Banco e autenticação | Supabase Free | O projeto é pausado após cerca de 1 semana sem uso; basta reativar no painel |
| Backend | Render (Web Service Free) | "Dorme" após ~15 min sem requisições e leva ~1 min para acordar; a fila retoma sozinha (seção 9) |
| Frontend | Cloudflare Pages ou Vercel (Hobby) | Site estático gerado pelo Vite |

Os limites dos planos gratuitos mudam; conferir as condições atuais na fase 11, antes de publicar. Alternativa ao Render, caso mude: Koyeb (plano gratuito).

## 13. Variáveis de ambiente

**Backend:** `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `PORT` (padrão 3000), `CORS_ORIGIN` (uma ou mais origens separadas por vírgula), `FRONTEND_URL` (endereço do frontend usado no link dos e-mails de convite). O servidor não sobe se faltar alguma obrigatória.

**Frontend:** `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

(Se o projeto Supabase usar as chaves antigas, os valores são a `service_role` e a `anon`, com os mesmos nomes de variável.)

Os dois projetos devem ter `.env.example` e `.gitignore` que impeçam o commit de segredos. A chave secreta não pode aparecer em nenhum arquivo do frontend.

## 14. Ordem de implementação

0. **Repositório e documentação:** git, estrutura de pastas e esta especificação.
1. **Banco:** arquivos de migração SQL (função `set_updated_at`, ENUM, tabelas, constraints, índices, triggers, RLS e revogação de privilégios).
2. **Backend base:** estrutura de pastas, conexão com o Supabase, middlewares de autenticação, funções SQL de conta, `/`, `/saude`, `/me`, `/onboarding`, membros e convites.
3. **CRUD:** organização (com validação do `config_score`), responsáveis, leads (com separação dos links de redes sociais) e utilitário de CNPJ alfanumérico com testes.
4. **Importação:** preview, confirmação com upsert (função SQL por lote), histórico.
5. **Score:** motor de score com N/A e testes das funções puras.
6. **Enriquecimento:** serviço da BrasilAPI e fila em segundo plano.
7. **Motor de compensação, revisão 7** (volta às fases 5 e 6; em 2026-11-21 o protótipo da antiga fase 7 foi pausado para isso):
   - **7a. Motor v2:** funções puras e testes de perfil ideal, avaliação, esforço novo, confiança, sugestões e estimativa em reais; validação e migração do `config_score`.
   - **7b. Banco e rotas da avaliação:** colunas novas de `leads`, `gravar_scores` com a confiança, `GET /avaliacao/modelo`, `PUT /leads/:id/avaliacao` e os campos editáveis novos.
   - **7c. Enriquecimento ampliado:** sócios, contatos da Receita, decisor provável, reconsulta periódica e mudanças na Receita (seção 9.1).
   - **7d. Interações e aprendizado:** tabela `interacoes`, tentativas sem resposta, prioridade, motivo de descarte e desfecho, conversão por faixa e sugestão de pesos (seção 8.10).
8. **Protótipo visual:** mockup navegável de todas as telas da seção 11, com dados fictícios (incluindo N/A e score parcial), validado antes de qualquer código de frontend. Define layout, cores, componentes e fluxos. Começou antes da revisão 7 e é retomado com o motor no centro (avaliação, interações, prioridade e configurações novas).
9. **Frontend base:** projeto Vite, Tailwind, rotas, autenticação, onboarding e serviço de API, seguindo o protótipo aprovado.
10. **Telas:** lista, detalhe, avaliação, prioridade, importação, configurações.
11. **Dashboard** e rotas de resumo e conversão.
12. **Endurecimento e deploy:** CORS, limites, backups, variáveis seguras e publicação (seção 12).

## 15. Convenções de desenvolvimento

- Desenvolvimento por fases, na ordem da seção 14, com validação ao fim de cada uma.
- Contrato único: nomes de tabelas, colunas, rotas e parâmetros desta especificação não podem divergir entre banco, backend e frontend. Qualquer mudança atualiza este documento.
- Commits agrupados por assunto ou funcionalidade, no padrão Conventional Commits em português: `<tipo>(<escopo>): <descrição no imperativo>` (ex.: `feat(banco): cria tabela de leads`).
- Segredos nunca em código, commits ou logs.
- Testes para as funções puras (validação de CNPJ, normalização de cabeçalhos, conversão de notas, cálculo do score).
- Conferir a documentação atual de qualquer biblioteca ou API externa antes de usá-la.
- Código e identificadores em português seguindo os nomes do contrato; comentários curtos onde houver lógica não óbvia.

## 16. Pontos em aberto

- **Cadastro de empresas:** assumido como aberto (qualquer pessoa cria sua organização como `admin`). Confirmar se será apenas por convite.
- **Cobrança e planos:** fora do escopo da primeira versão.
- **Pesos e faixas do score:** os valores da seção 8 são provisórios; ajustar com a realidade de cada empresa.
- **LGPD:** nome, telefone, e-mail e LinkedIn do decisor e os nomes dos sócios vindos da Receita são dados pessoais (os sócios são dado público, mas continuam pessoais); avaliar aviso de privacidade e exclusão a pedido antes de abrir para clientes reais.
- **Ideias para depois (marcadas como "talvez" na revisão 7):** regime tributário como pista de faturamento, MEI, CNAEs secundários e natureza jurídica no perfil ideal; ciclo de venda por porte e cidades atendidas no esforço; histórico da compensação (cerca de 100 bytes por mudança, guardando só os números); comparação planilha × sistema; próximo contato com data.
- **Chance de fechar na estimativa em reais:** até haver 20 desfechos por faixa, ela é o índice de probabilidade, não uma probabilidade medida.
- **E-mails do Supabase Auth:** o envio padrão do plano gratuito tem limite baixo por hora e serve para testes. Para usuários reais (confirmação de cadastro e convites), configurar um SMTP próprio com plano gratuito na fase 11.
- **Remoção de membros e troca de papel:** ainda sem rota; definir regras (por exemplo, impedir remover o último admin) antes de implementar.
- **Remoção de links de redes sociais:** os links só são acrescentados; um link digitado errado continua em `lead_redes_sociais`. Avaliar uma rota de exclusão de link na fase 9.
- **Leads `nao_encontrado`:** não voltam para a fila no lote sem `ids` (a base da Receita só é atualizada de tempos em tempos). Avaliar uma opção "tentar de novo os não encontrados" na fase 9.
- **Busca sem acento:** a busca de leads diferencia acentos ("sao" não encontra "São"). Avaliar a extensão `unaccent` se fizer falta.
- **Responsáveis:** sem rota para renomear ou excluir no MVP.
- **Idioma da interface:** português do Brasil.
