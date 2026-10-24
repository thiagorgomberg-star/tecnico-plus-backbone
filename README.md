# Técnico Plus Backbone

Sistema da Multivale para o técnico de backbone receber e executar ordens de serviço, com rastreamento durante o expediente, alertas e um painel para o supervisor despachar e dar baixa.

## Estrutura

| Pasta | O que é |
| --- | --- |
| `apps/mobile` | App do técnico (React Native com Expo, Android primeiro) |
| `apps/painel` | Painel web do supervisor (Next.js) |
| `supabase/migrations` | Banco de dados (Postgres + PostGIS), permissões e regras |
| `supabase/tests` | Teste do fluxo do MVP direto no banco |

## Fases

0. Base: repositório, Supabase, login e tabelas do MVP.
1. MVP: O.S. com histórico, iniciar/encerrar expediente, GPS, alertas, despacho e baixa.
2. Custos e KMZ: abastecimento, hora extra, deslocamento, ferramentas, importação de KMZ e meta diária de km.
3. Almoxarifado e banco de atividades.

## Supabase

Projeto `tecnico-plus` (região São Paulo), id `wnuivnpywflczknxpytx`. A URL e a chave pública ficam no painel do Supabase em Project Settings → API.

## Rodar localmente

```bash
npm install
cp .env.example apps/mobile/.env        # preencher com a URL e a chave do Supabase
cp .env.example apps/painel/.env.local
npm run painel   # painel em http://localhost:3000
npm run mobile   # app no Expo Go
```

## Testar o banco sem Supabase

Precisa de Postgres 16 com PostGIS:

```bash
createdb tecnico_teste
psql -d tecnico_teste -f supabase/tests/stub_auth.sql -f supabase/migrations/20261024120000_mvp.sql
psql -d tecnico_teste -f supabase/tests/fluxo_mvp.sql
```

## Publicação do painel (Vercel)

Projeto importado do GitHub com **Root Directory** `apps/painel`. Não precisa de variáveis de ambiente:
o endereço e a chave pública do Supabase estão em `apps/painel/src/lib/supabase.ts`.
Cada push na `main` publica uma versão nova.
