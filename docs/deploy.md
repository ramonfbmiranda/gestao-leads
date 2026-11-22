# Deploy, operação e backups

Como publicar o sistema de graça e mantê-lo funcionando. Visão geral e motivos na seção 12 da [especificação](especificacao.md).

| Parte | Onde | Configuração no repositório |
| --- | --- | --- |
| Banco e autenticação | Supabase (Free) | `supabase/migrations/` |
| Backend (API) | Render (Free) | `render.yaml` |
| Frontend | Cloudflare Workers, arquivos estáticos (Free) | `frontend/wrangler.jsonc`, `frontend/public/_headers`, `frontend/.node-version` |

Planos conferidos em 21/11/2026.

- **Render Free:**
  - o serviço dorme depois de 15 minutos sem requisições e leva cerca de 1 minuto para acordar;
  - são 750 horas por mês para a conta.
- **Cloudflare:** arquivos estáticos sem limite de acessos e 3.000 minutos de build por mês.
- **Supabase Free:**
  - pausa o projeto depois de cerca de 1 semana sem uso;
  - não faz backup automático.

## Antes de começar

- **Código no GitHub:** tudo commitado e enviado para a branch `main`.
- **Banco atualizado:** as migrações já aplicadas no Supabase (`npx supabase db push --remote`).
- **Valores à mão:** pegue no painel do Supabase, em **Project Settings → API Keys** e **Data API**:
  - a **URL do projeto** (`https://xxxx.supabase.co`);
  - a **chave pública** (`sb_publishable_...`), que vai para o frontend;
  - a **chave secreta** (`sb_secret_...`), que vai **só** para o Render. Nunca coloque essa chave no frontend, em arquivo do repositório ou em mensagem.

## 1. Backend no Render

1. Crie a conta em render.com, entrando com o GitHub.
2. No painel, crie um Blueprint: **New → Blueprint**. Escolha o repositório. O Render lê o `render.yaml` e mostra o serviço `gestao-leads-api` no plano Free.
3. Preencha as variáveis que ele pedir:

   | Variável | Valor |
   | --- | --- |
   | `SUPABASE_URL` | URL do projeto Supabase |
   | `SUPABASE_SECRET_KEY` | chave secreta |
   | `CORS_ORIGIN` | por enquanto `http://localhost:5173` (troca no passo 3) |
   | `FRONTEND_URL` | por enquanto `http://localhost:5173` (troca no passo 3) |

4. Confirme e espere o deploy terminar. O endereço fica parecido com `https://gestao-leads-api.onrender.com`; se o nome estiver ocupado, o Render acrescenta um sufixo.
5. Teste abrindo `https://SEU-BACKEND.onrender.com/saude` no navegador.
   - **Esperado:** `{"status":"ok","banco":"ok"}`.
   - Se o banco aparecer indisponível, confira a URL e a chave secreta.

## 2. Frontend na Cloudflare

1. Crie a conta em dash.cloudflare.com.
2. Vá em **Workers & Pages → Create → Import a repository** e conecte o GitHub.
3. Configure o build:

   | Campo | Valor |
   | --- | --- |
   | Project name | `gestao-leads` (precisa ser igual ao `name` do `frontend/wrangler.jsonc`) |
   | Root directory | `frontend` |
   | Build command | `npm run build` |
   | Deploy command | `npx wrangler deploy` |

4. Em **Build variables and secrets**, cadastre as variáveis abaixo. Elas entram no momento do build, por isso vão aqui e não em "Variables & Secrets", que só valem com o site rodando.

   | Variável | Valor |
   | --- | --- |
   | `VITE_API_URL` | endereço do backend do passo 1 (sem barra no fim) |
   | `VITE_SUPABASE_URL` | URL do projeto Supabase |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | chave **pública** |

5. Mande fazer o deploy. O endereço fica no formato `https://gestao-leads.SEU-SUBDOMINIO.workers.dev`.

## 3. Ligar as pontas

1. **No Render:** abra o serviço, vá em **Environment** e troque `CORS_ORIGIN` e `FRONTEND_URL` pelo endereço do frontend. Salve, e o Render publica de novo sozinho.
   - Para continuar usando o sistema local junto, coloque os dois endereços em `CORS_ORIGIN`, separados por vírgula: `https://gestao-leads....workers.dev,http://localhost:5173`.
2. **No Supabase:** vá em **Authentication → URL Configuration**.
   - **Site URL:** o endereço do frontend.
   - **Redirect URLs:** acrescente `https://ENDERECO-DO-FRONTEND/entrar`. Mantenha `http://localhost:5173/entrar` para o desenvolvimento.
   - Sem isso, o link de confirmação do cadastro e os convites mandam para o lugar errado.

## 4. Conferir em produção

1. Abra o endereço do frontend. A tela de login aparece.
2. Entre. O primeiro acesso depois de um tempo parado pode levar até 1 minuto, porque o Render está acordando.
3. Teste o caminho principal: criar um lead, abrir o detalhe, avaliar, importar uma planilha pequena e abrir o painel.
4. Recarregue a página numa rota interna (por exemplo `/leads`). Ela precisa abrir normalmente, sem erro 404.

## Atualizações

- **Código:** cada `git push` na `main` publica sozinho no Render e na Cloudflare.
- **Banco:** as migrações continuam manuais. Rode `npx supabase db push --remote` **antes** de enviar o código que depende delas; senão a API nova chama uma função que ainda não existe.

## Backups (o Supabase Free não faz)

Faça um backup ao menos uma vez por semana e antes de qualquer migração arriscada. O comando usa o Supabase CLI, que precisa do **Docker Desktop aberto**, e pede a senha do banco (em **Project Settings → Database**).

Na raiz do projeto (PowerShell):

```powershell
$pasta = "backups/$(Get-Date -Format yyyy-MM-dd)"
New-Item -ItemType Directory -Force $pasta | Out-Null
npx supabase db dump --remote -f "$pasta/papeis.sql" --role-only
npx supabase db dump --remote -f "$pasta/esquema.sql"
npx supabase db dump --remote -f "$pasta/dados.sql" --use-copy --data-only
```

- **Dados pessoais:** os arquivos têm dados reais (empresas, decisores, sócios, contas de usuário). A pasta `backups/` está no `.gitignore` e **nunca** deve ir para o GitHub. Guarde uma cópia fora do computador, num drive pessoal com acesso restrito.
- **Restaurar:** crie um projeto novo no Supabase e rode, com o `psql`:

  ```powershell
  psql --single-transaction --variable ON_ERROR_STOP=1 --file papeis.sql --file esquema.sql --command "SET session_replication_role = replica" --file dados.sql --dbname "CONNECTION_STRING_DO_PROJETO_NOVO"
  ```

  Depois, aponte as variáveis do Render e da Cloudflare para o projeto novo.

## O que esperar no dia a dia

- **Backend dormindo:** depois de 15 minutos sem uso, o primeiro acesso demora até 1 minuto. Se passar do tempo-limite, a tela avisa que o servidor está acordando. A fila de enriquecimento fica gravada no banco e retoma sozinha quando o backend acorda.
- **Supabase pausado:** depois de cerca de 1 semana sem uso, o projeto pausa e o sistema mostra erro de banco. Reative no painel do Supabase (**Restore project**) e espere alguns minutos.
- **Limites de uso da API**, por usuário:

  | Operação | Limite |
  | --- | --- |
  | Uso geral | 300 requisições a cada 5 minutos |
  | Importação, busca na Receita em lote e recálculo geral | 30 a cada 15 minutos |
  | Convites | 20 por hora |

  Passando disso, a API responde 429 com uma mensagem pedindo para esperar.

## Segurança: o que fica onde

| Segredo | Onde fica | Onde nunca fica |
| --- | --- | --- |
| Chave secreta do Supabase | Render (`SUPABASE_SECRET_KEY`) e `backend/.env` local | frontend, GitHub, mensagens |
| Chave pública do Supabase | Cloudflare (build) e `frontend/.env` local | (é pública, mas o RLS bloqueia o acesso direto às tabelas) |
| Senha do banco | só no momento do backup | arquivos, GitHub |
