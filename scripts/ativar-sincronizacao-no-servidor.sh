#!/usr/bin/env bash
#
# Ativa a sincronização agendada no servidor (Edge Function sincronizar-fontes + pg_cron).
#
# O que faz, nesta ordem, no projeto Supabase vinculado (produção):
#   1. gera um segredo novo para o agendamento;
#   2. grava o segredo como secret da Edge Function (CRON_SECRET);
#   3. empacota e implanta a função (npm run deploy:sincronizar-fontes);
#   4. aplica as migrations pendentes (76: acesso do servidor às funções; 77: extensões e jobs do pg_cron);
#   5. grava no Vault do banco o endereço da função e o mesmo segredo, que os jobs leem;
#   6. testa, com o segredo, o acesso da função às fontes oficiais (modo dry: consulta e conta, não grava).
#
# Pode ser repetido: gera um segredo novo e regrava os dois lados. Não apaga nada.
# O segredo nunca é impresso nem fica em arquivo depois do uso.
#
# Uso: npm run ativar:sincronizacao-no-servidor     (ou: bash scripts/ativar-sincronizacao-no-servidor.sh --sim)
#
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

REF_ARQUIVO="supabase/.temp/project-ref"
[ -f "$REF_ARQUIVO" ] || { echo "Projeto não vinculado. Rode: supabase link --project-ref <ref>"; exit 1; }
REF="$(tr -d '[:space:]' < "$REF_ARQUIVO")"
URL_FUNCAO="https://${REF}.supabase.co/functions/v1/sincronizar-fontes"

command -v supabase >/dev/null || { echo "CLI do Supabase não encontrada."; exit 1; }
command -v openssl  >/dev/null || { echo "openssl não encontrado."; exit 1; }
command -v curl     >/dev/null || { echo "curl não encontrado."; exit 1; }

echo "Projeto: $REF"
echo "Função:  $URL_FUNCAO"
echo
echo "Isto vai ALTERAR o projeto de produção: secret da função, implantação da função, migrations 76 e 77"
echo "(extensões pg_cron e pg_net, funções do banco e 6 jobs) e dois secrets no Vault."
SEM_PERGUNTAS=""
if [ "${1:-}" = "--sim" ]; then SEM_PERGUNTAS="--yes"; fi
if [ "${1:-}" != "--sim" ]; then
  read -r -p "Continuar? [s/N] " resposta
  [ "$resposta" = "s" ] || [ "$resposta" = "S" ] || { echo "Cancelado."; exit 0; }
fi

SEGREDO="$(openssl rand -hex 32)"
SQL_TEMP="$(mktemp)"
trap 'rm -f "$SQL_TEMP"' EXIT
chmod 600 "$SQL_TEMP"

echo
echo "1/6 Segredo do agendamento na função (CRON_SECRET)..."
supabase secrets set "CRON_SECRET=${SEGREDO}" --project-ref "$REF" >/dev/null
echo "    ok"

echo "2/6 Empacotando e implantando a função..."
npm run --silent deploy:sincronizar-fontes
echo "    ok"

echo "3/6 Aplicando as migrations pendentes (76 e 77)..."
supabase db push --linked ${SEM_PERGUNTAS}
echo "    ok"

echo "4/6 Gravando endereço e segredo no Vault do banco..."
cat > "$SQL_TEMP" <<SQL
DO \$\$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'sincronizacao_url';
  IF v_id IS NULL THEN PERFORM vault.create_secret('${URL_FUNCAO}', 'sincronizacao_url', 'Endereço da Edge Function sincronizar-fontes');
  ELSE PERFORM vault.update_secret(v_id, '${URL_FUNCAO}', 'sincronizacao_url', 'Endereço da Edge Function sincronizar-fontes'); END IF;

  SELECT id INTO v_id FROM vault.secrets WHERE name = 'sincronizacao_segredo';
  IF v_id IS NULL THEN PERFORM vault.create_secret('${SEGREDO}', 'sincronizacao_segredo', 'Segredo do agendamento (cabeçalho x-cron-secret)');
  ELSE PERFORM vault.update_secret(v_id, '${SEGREDO}', 'sincronizacao_segredo', 'Segredo do agendamento (cabeçalho x-cron-secret)'); END IF;
END
\$\$;
SQL
supabase db query --linked -f "$SQL_TEMP" >/dev/null
rm -f "$SQL_TEMP"
echo "    ok"

echo "5/6 Testando o acesso da função às fontes oficiais (UASG 200330, só consulta)..."
RESPOSTA="$(curl -sS --max-time 150 -X POST "$URL_FUNCAO" \
  -H "content-type: application/json" -H "x-cron-secret: ${SEGREDO}" \
  -d '{"recurso":"contratos","uasg":"200330","dry":true}' -w '\n%{http_code}' || true)"
CODIGO="$(printf '%s' "$RESPOSTA" | tail -n1)"
CORPO="$(printf '%s' "$RESPOSTA" | sed '$d')"
echo "    HTTP $CODIGO"
echo "    $CORPO"

echo "6/6 Jobs agendados:"
supabase db query --linked "select jobname, schedule, active from cron.job order by jobname" 2>&1 | grep -E '"(jobname|schedule|active)"' | paste - - - | sed 's/^ *//' || true

echo
if [ "$CODIGO" = "200" ]; then
  echo "Pronto. Os jobs rodam de hora em hora (contratos :05, atas :15, saldos :35)."
  echo "Para disparar a primeira sincronização agora, sem esperar:"
  echo "  supabase db query --linked \"select public.disparar_sincronizacao('contratos','200331')\""
  echo "Acompanhe em: select * from sincronizacao_fontes;   e   select * from cron.job_run_details order by start_time desc limit 10;"
else
  echo "ATENÇÃO: o teste de acesso não retornou 200. A função e o agendamento foram instalados, mas confira o"
  echo "resultado acima (logs: supabase functions logs sincronizar-fontes) antes de confiar no agendamento."
  exit 2
fi
