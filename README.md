# ComprasSUSP · Gestão de Atas e Contratos (CGLIC/SENASP)

Sistema web da Coordenação-Geral de Licitações e Contratos (CGLIC) da SENASP/MJSP para acompanhar as **atas de registro de preços**, os **contratos**, os **empenhos** e os **pagamentos** das UASGs 200330 e 200331.

Os dados vêm das fontes oficiais abertas (Compras.gov.br, PNCP, Contratos.gov.br, STA do Tesouro e Portal da Transparência) e são lidos por uma sincronização no servidor. A equipe usa o sistema para distribuir atas e contratos entre os gestores, alocar quantitativos às unidades internas, vincular contratos e empenhos e acompanhar o ciclo de pagamento.

## O que o sistema faz

| Área | Páginas |
| --- | --- |
| **Início** | Painel com o que exige atenção; Distribuição de atas e contratos aos gestores |
| **Carteira** | Atas · Contratos · Itens, com filtros por situação, unidade, gestor e órgão; telas de detalhe Ata 360, Contrato 360 e Item |
| **Alocação** | Quantitativo de cada item para as unidades internas |
| **Vínculos** | Contratos à ata · Empenhos ao contrato · Empenhos aos itens |
| **Financeiro** | Empenhos · Pagamentos (ciclo da Portaria 50) · Previsão mensal |
| **Emendas** | Pedidos dos parlamentares (da reserva ao empenho) · Itens da CAEP · Por autor · Kits · Beneficiários · Autores (CAEP) |
| **Ajustes** | Modelos de gestão, regras de alertas, feriados, unidades internas, usuários e perfis |

Perfis: **Coordenador** (`admin`), **Gestor de atas e contratos** (`gestor`), **Gestor de saldos** (`gestor_saldos`), **Gestor de emendas** (`gestor_emendas`, da CAEP) e **Consulta** (`leitor`). O detalhe de quem vê e faz o quê está em [CONTEXT.md](CONTEXT.md).

## Tecnologia

- **Front:** React 19, React Router 7, TanStack Query 5, Vite 8, TypeScript; design system próprio no padrão gov.br (`src/design-system`).
- **Banco e autenticação:** Supabase (Postgres com RLS, RPCs, pg_cron, pg_net, Vault).
- **Sincronização:** Edge Function `sincronizar-fontes` (Deno), disparada de hora em hora pelo pg_cron.
- **Hospedagem do site:** Vercel (com proxies para as APIs públicas).
- **Testes:** Vitest (unidade) e Playwright (layout no celular).

## Como rodar

Pré-requisitos: Node 20.19 ou mais novo (exigência do Vite 8) e npm.

```bash
npm install
cp .env.example .env.local   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:5173
```

O sistema exige login. Os usuários são convidados pela tela Ajustes › Usuários; não há cadastro aberto.

### Comandos

| Comando | Para quê |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Checagem de tipos (`tsc -b`, inclui testes e `server/`) e build de produção |
| `npx tsc --noEmit -p tsconfig.app.json` | Checagem rápida de tipos do app |
| `npm run lint` | oxlint |
| `npm test` | Testes Vitest |
| `npm run e2e:login` e depois `npm run e2e` | Testes de layout no celular (ver [e2e/README.md](e2e/README.md)) |
| `npm run deploy:sincronizar-fontes` | Empacota e publica a Edge Function de sincronização |

## Publicação

- **Site:** o merge na `main` publica pela integração da Vercel.
- **Banco:** migrations em `supabase/migrations`, aplicadas com `supabase db push --linked` (projeto vinculado com `supabase link`). Toda migration é testada antes (PGlite ou ensaio em transação desfeita) e só é aplicada com autorização da coordenação.
- **Sincronização:** depois de mudar código usado pelo servidor (`src/services` ou `server/`), republicar com `npm run deploy:sincronizar-fontes` a partir de um checkout limpo da `main`. A primeira instalação do agendamento é feita por `scripts/ativar-sincronizacao-no-servidor.sh`.

### Variáveis de ambiente (só os nomes)

- Site: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Função `sincronizar-fontes`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `PORTAL_TRANSPARENCIA_CHAVE`.
- Funções `invite-user` e `manage-user`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Vault do banco: `sincronizacao_url`, `sincronizacao_segredo`.

## Documentação

- [CONTEXT.md](CONTEXT.md): arquitetura, perfis, sincronização, pastas e como diagnosticar.
- [docs/regras-de-dados.md](docs/regras-de-dados.md): regras de negócio e decisões sobre os dados das fontes.
- [docs/migrations.md](docs/migrations.md): índice das migrations por tema, jobs do cron e tabelas.
- [e2e/README.md](e2e/README.md): testes de layout no celular.
- [docs/historico/](docs/historico/): relatórios das fases anteriores do projeto (histórico, não descrevem o estado atual).
