# CONTEXT.md · Arquitetura e funcionamento

Guia para quem vai trabalhar no código: como o sistema está montado, de onde vêm os dados, quem pode o quê e como publicar e diagnosticar. Visão geral e comandos estão no [README](README.md); as regras de negócio, em [docs/regras-de-dados.md](docs/regras-de-dados.md).

Atualizado em 14/10/2026.

## 1. Visão geral

```
Fontes oficiais (Compras.gov.br, PNCP, Contratos.gov.br, STA, Portal da Transparência)
        │  lidas só pelo servidor
        ▼
Edge Function sincronizar-fontes  ◄── pg_cron (de hora em hora)  ◄── botão "Atualizar" do coordenador
        │  grava com service_role
        ▼
Supabase Postgres (RLS, RPCs, views)
        │  leitura de usuário logado; gravação só por RPC
        ▼
Site React (Vercel)
```

- **O navegador só lê o banco.** Toda leitura das fontes oficiais roda no servidor. Exceções: algumas telas de detalhe ainda fazem leituras pontuais ao vivo pelo proxy da Vercel (divulgação no PNCP, contrato avulso, data de assinatura da ata, empenhos de um contrato).
- **Gravação do usuário** passa por funções do banco (RPC) que conferem `has_role` / `has_permission`. Desde a migration 65 a leitura é só para logados; desde a 84, atas e itens só o servidor grava; desde a 124, usuário desativado perde o acesso na hora.
- UASGs da CGLIC: 200330 e 200331 (`src/config/unidadesGestoras.ts`).

## 2. Áreas, páginas e perfis

Navegação em dois níveis (`src/config/navigation.ts`): o menu chave lista as áreas (trilho lateral no computador, barra inferior no celular) e as páginas da área aparecem como abas no topo (`AreaTabs`). Cada rota é protegida por `<RequireRole>` em `src/App.tsx`.

Perfis: **A** = Coordenador (`admin`), **G** = Gestor de atas e contratos (`gestor`), **GS** = Gestor de saldos (`gestor_saldos`), **GE** = Gestor de emendas da CAEP (`gestor_emendas`), **L** = Consulta (`leitor`).

| Área | Página | Rota | Quem vê |
| --- | --- | --- | --- |
| Início | Painel | `/instrumentos` | A G GS L |
| | Distribuição | `/atas/distribuicao` | A L |
| Carteira | Atas · Contratos · Itens | `/atas` · `/contratos` · `/itens` | A G GS L (GE: Atas e Itens) |
| | Ata 360 · Item · Contrato 360 | `/atas/detalhe/:ataKey` · `…/itens/:numeroItem` · `/contratos/:contractKey` | A G GS L |
| Alocação | Itens às unidades | `/alocacao` | A G GS L |
| Vínculos | Contratos à ata · Empenhos ao contrato · Empenhos aos itens | `/vinculacao/contratos` · `/vinculacao/empenhos-contrato` · `/vinculacao/empenhos-itens` | A G L |
| Financeiro | Empenhos · Pagamentos · Previsão | `/empenhos` · `/pagamentos` · `/pagamentos/previsao` | A G L |
| Emendas | Pedidos (Ver por pedido · por autor) · Itens e kits (Por item · Por kit) | `/emendas/pedidos` (`?ver=autor`; `/emendas/por-autor` redireciona) · `/emendas/itens` (`?ver=kit`; `/emendas/kits` redireciona) | A GE L (edita: A GE) |
| Ajustes | Modelos de Gestão | `/configuracoes/modelos` | A G |
| | Regras de Alertas · Feriados | `/admin/regras-alertas` · `/admin/feriados` | A |
| | Unidades Internas | `/admin/departamentos` | A G GS L (edita: A GS) |
| | Usuários · Perfis | `/admin/usuarios` · `/admin/perfis` | A |

Rotas públicas: `/login`, `/definir-senha` (convite), `/redefinir-senha`. Endereços antigos redirecionam para os novos.

O que cada perfil pode fazer (`role_permissions`, migrations 23, 30, 33 e 55):

- **Coordenador:** tudo. É o único que gerencia usuários, perfis, regras de alertas e feriados, decide conflitos de gestor, marca avisos como resolvidos e força a sincronização ("Atualizar").
- **Gestor:** contratos atribuídos a ele (escopo ASSIGNED), vincular contrato à ata, vincular nota aos itens e à unidade interna, informar a quantidade da ata assinada, exportar.
- **Gestor de saldos:** alocações (ver, gerenciar, ligar nota à unidade), unidades internas, remanejamentos de quantitativos. Não vê Financeiro nem Vínculos.
- **Gestor de emendas (CAEP):** menu Emendas (`emendas.view`/`emendas.manage`, migration 155): pedidos dos parlamentares com etapas até o empenho e trava de saldo (migration 157: o reservado não passa do alocado à CAEP e a alocação da CAEP não baixa abaixo do reservado), kits com os itens alocados à CAEP, quadro da reserva para copiar no SEI e no WhatsApp no formato do Anexo, com o valor já pelo reajuste previsto e total por GND (migration 165), beneficiários pelo CNPJ e o cadastro dos autores (Câmara e Senado, lidos pelo servidor toda segunda-feira; consulta em Pedidos › Ver por autor). Na Carteira, só Atas e Itens.
- **Consulta:** só leitura e exportação.

Os nomes exibidos dos perfis são editáveis pelo coordenador (migration 68). As Edge Functions `invite-user` e `manage-user` convertem os nomes da tela (coordenador, gestor, consulta, gestor_saldos, gestor_emendas) nos perfis do banco (`supabase/functions/_shared/roleMapping.ts`).

## 3. Sincronização com as fontes

- **Código:** `server/sincronizar-fontes/` (`index.ts` com `Deno.serve`, `handler.ts`, `executar.ts`, `proxyDeFontes.ts`, `supabaseServidor.ts`). Reaproveita os serviços de `src/services`.
- **Empacotamento:** `scripts/build-sincronizar-fontes.mjs` junta tudo com rolldown num arquivo só (`supabase/functions/sincronizar-fontes/index.ts`, gerado e fora do git), troca o cliente do navegador pelo cliente do servidor e recusa o pacote se encontrar chave ou variável do navegador.
- **Quem chama:** o pg_cron, com o cabeçalho `x-cron-secret` (nunca força), ou o coordenador logado, que pode forçar. A resposta é 202 e o trabalho segue em segundo plano. O modo `dry` só consulta e conta, sem gravar.
- **Recursos** (`RECURSOS_DO_SERVIDOR` em `executar.ts`): `contratos`, `atas`, `saldos_itens`, `itens_contratos`, `unidades_itens`, `atas_participacao`, `contratos_participantes`, `empenhos`, `faturas`, `ordens_bancarias`, `cadastro_uasgs`, `itens_notas_siafi`.
- **Fontes** (prefixos em `vercel.json`, `vite.config.ts` e `proxyDeFontes.ts`): `/api-arp` → Compras.gov.br dados abertos; `/api-pncp` → PNCP; `/api-contratos-gov` → Contratos.gov.br; `/api-sta` → STA do Tesouro; `/api-transparencia` → Portal da Transparência (só no servidor, exige chave).
- **Agendamento:** `disparar_sincronizacao(recurso, uasg)` (migration 77) lê o endereço e o segredo do Vault e chama a função. Jobs e horários em [docs/migrations.md](docs/migrations.md#jobs-do-pg_cron).
- **Limites:** cada execução tem orçamento de ~100 s (a Edge Function para em 150 s); o que não couber fica para a próxima. Cada chamada a uma fonte tem 30 s. O recurso só roda se passou da validade e respeita a trava em `sincronizacao_fontes`.
- **Instalação inicial:** `scripts/ativar-sincronizacao-no-servidor.sh` gera o segredo, publica a função, aplica as migrations, grava o Vault e faz um teste `dry`.

### Diagnóstico

- Situação de cada recurso: `select * from sincronizacao_fontes;`
- Execuções do cron: `cron.job_run_details`; resposta de cada disparo: `net._http_response`.
- Para obrigar uma releitura sem o botão do coordenador: recuar as datas de controle (`ultimo_sucesso_em` além da validade e `ultima_tentativa_em` além de 30 min em `sincronizacao_fontes`; por contrato ou NP, `contrato_faturas_sincronizacao.sincronizado_em` e `np_consultas`) e chamar `select public.disparar_sincronizacao('<recurso>', '<uasg>');`.
- Trava presa (função derrubada aos 150 s) só solta na reserva seguinte, depois de 10 min.

## 4. Pastas

| Pasta | Conteúdo |
| --- | --- |
| `src/routes/` | Páginas de rota (carregadas sob demanda) |
| `src/components/` | Telas e partes, por área: `layout`, `auth`, `carteira`, `atas`, `contracts`, `itens`, `item-balances`, `instrument360`, `instrumentos`, `alocacao`, `vinculacao`, `financeiro`, `admin`, `avisos`… |
| `src/design-system/` | Tokens, catálogo de ações (`actions.ts`) e componentes (AppButton, ActionButton, DataTable, Modal, KpiCard, MetricStrip, NoticeBar, StatusBadge…) |
| `src/hooks/` | Hooks React Query de leitura e de gravação por RPC |
| `src/services/` | Acesso a dados e às fontes; também rodam no servidor. Atenção: algumas leituras de `api.ts` gravam no banco quando rodam no servidor |
| `src/adapters/`, `src/utils/` | Conversão das respostas das fontes; regras puras (saldos, quantitativos, vínculos, formatação) |
| `src/config/` | Navegação, regras de alerta, feriados, limites da Lei 14.133, UASGs |
| `src/context/`, `src/types/` | Sessão e perfil (`AuthContext`), tipos de domínio e de RBAC |
| `server/sincronizar-fontes/` | Código da Edge Function de sincronização |
| `supabase/migrations/` | Migrations (ver [docs/migrations.md](docs/migrations.md)) |
| `supabase/functions/` | `invite-user`, `manage-user` e o pacote gerado de `sincronizar-fontes` |
| `supabase/tests/` | Testes SQL de regressão de RLS e RBAC |
| `supabase/limpezas/` | Limpezas únicas feitas à mão; rodam como ensaio por padrão (só gravam com `SET limpeza.aplicar = 'sim'`) |
| `e2e/` | Testes de layout no celular (Playwright) |
| `docs/` | Regras de dados, índice das migrations e `historico/` (relatórios das fases anteriores) |
| `db/` | Sobras de fases antigas, fora do build |

## 5. Convenções de tela

- **Padrão gov.br:** cor primária `#0c326f`, tokens de cor no `:root`, botões só pelo `AppButton`/`ActionButton` com o catálogo de ações.
- **Tabelas:** a linha inteira abre o detalhe; ordenação pelo cabeçalho guardada na URL; ações da linha no menu ⋯. No celular, as tabelas viram cartões.
- **Carteiras:** situações em trilho (Vigentes · Atenção · Crítico · Todas · Encerradas), barra de filtros comum e filtros na URL; um trilho por tela.
- **Telas 360:** cartão no topo que encolhe em barra ao rolar; abas na URL (`?aba=`); "Voltar" leva à origem.
- **Celular:** sem rolagem lateral, alvo de toque de 44 px (os botões compactos ganham a área por um `::after` invisível), campos com 16 px e texto com no mínimo 12 px. Conferido pelo `npm run e2e`.
- **Palavras:** "distribuir" só para atas e contratos aos gestores; "alocar" para quantitativo às unidades; "vincular" sempre diz a quê.

## 6. Fluxo de trabalho

1. Trabalho novo em branch própria a partir da `main` e PR para a `main` (o merge publica o site).
2. Antes do PR: `npx tsc --noEmit -p tsconfig.app.json`, `npm test` e, quando mexer em tipos de teste ou `server/`, `npm run build` (o `tsc -b` da Vercel também checa os testes).
3. **Migration:** testar antes (PGlite ou ensaio em transação desfeita no banco real), conferir o próximo número livre no histórico do banco, aplicar com `supabase db push --linked` só com autorização da coordenação.
4. Se a mudança afeta o servidor, republicar a função (`npm run deploy:sincronizar-fontes`) depois da migration, a partir de um checkout limpo da `main`.
5. Tabela nova nasce com RLS de leitura só para logados e escrita só por RPC ou pelo servidor.
