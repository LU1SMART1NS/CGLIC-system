-- ==============================================================================
-- MIGRATION 134: CRON MAIS LEVE PARA O BANCO
-- Versão: 20261014000134_cron_mais_leve.sql
--
-- Contexto (14/10/2026): o banco (computação Nano) ficou estrangulado. Todos os jobs do pg_cron falhavam
-- com "job startup timeout", o PostgREST devolvia 503 e o app parava em "Verificando credenciais". Não era
-- uma consulta presa (pg_stat_activity vazio): era a máquina sem fôlego. Contribuíram as cargas iniciais do
-- dia (saldo contábil do Tesouro, itens das notas no Portal da Transparência), quatro jobs rodando duas vezes
-- por hora e vários jobs disparando no mesmo minuto.
--
-- O que muda:
--   1) Quatro jobs passam de duas vezes por hora para uma: itens das notas no SIAFI das duas UGs
--      (eram :02/:32 e :17/:47), recálculo do pagamento das faturas (era :28/:58) e conciliação dos ciclos
--      (era :29/:59).
--   2) Jobs que começavam no mesmo minuto ficam em minutos diferentes (contratos, atas e itens dos contratos
--      das duas UGs; ordens bancárias 200330 × vínculo automático; saldo contábil 200330 × atas-participação).
--      No fim, a migration confere que nenhum minuto ficou com dois jobs.
--   3) recalcular_pagamento_faturas() (mediana 20 s, até 95 s) sai cedo quando nada mudou desde a última
--      rodada. A conferência é por uma assinatura do conteúdo que a regra lê (faturas, ordens bancárias e
--      fornecedor dos contratos) mais o corpo das três funções da regra, guardada em rotinas_controle.
--      Só a data de sincronização não serviria: toda sincronização grava sincronizado_em/consultado_em = NOW()
--      mesmo quando a fonte devolveu a mesma coisa. Trocar a regra (nova versão da função) invalida a
--      assinatura sozinha; para obrigar um recálculo à mão:
--        DELETE FROM public.rotinas_controle WHERE rotina = 'recalcular_pagamento_faturas';
--        SELECT public.recalcular_pagamento_faturas();
--
-- Horários (minuto de cada hora, relógio do banco) depois desta migration:
--   :02 itens-notas-siafi-200330   :05 contratos-200330        :07 contratos-200331 (era :05)
--   :09 saldo-contabil-200330 (6/6 h, era :12)                 :10 atas-participacao-200330
--   :12 atas-participacao-200331   :15 atas-200330             :17 itens-notas-siafi-200331
--   :18 atas-200331 (era :15)      :20 faturas-200330          :22 faturas-200331
--   :25 itens-contratos-200330     :27 saldo-contabil-200331 (6/6 h)
--   :28 recalcular-pagamento-faturas (uma vez)                 :31 conciliar-ciclos-pagamento (uma vez, era :29/:59)
--   :32 contratos-participantes-200330                         :34 contratos-participantes-200331
--   :35 saldos-itens               :38 itens-contratos-200331 (era :25)
--   :40 unidades-itens-200330      :42 unidades-itens-200331   :45 empenhos-200330
--   :48 cadastro-uasgs             :50 empenhos-200331         :53 ordens-bancarias-200330 (era :55)
--   :55 vincular-contratos-automaticamente                     :57 ordens-bancarias-200331
--   domingo 03:00 limpar-historico-do-cron
--
-- Nada é apagado; o cron só muda de horário. Idempotente: pode rodar de novo.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) rotinas_controle: o que cada rotina viu na última rodada
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rotinas_controle (
  rotina        TEXT        PRIMARY KEY,
  assinatura    TEXT        NOT NULL,              -- resumo do que a rotina lê; igual = nada mudou
  detalhes      JSONB       NOT NULL DEFAULT '{}'::jsonb, -- contagens e datas, só para quem for diagnosticar
  conferido_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- última vez que a rotina olhou
  executado_em  TIMESTAMPTZ,                        -- última vez que a rotina trabalhou de verdade
  resultado     JSONB,                              -- o que a última execução de verdade devolveu
  CONSTRAINT rotinas_controle_rotina_formato CHECK (rotina ~ '^[a-z_]+$')
);

COMMENT ON TABLE public.rotinas_controle IS
  'Assinatura do que cada rotina do cron leu na última rodada (migration 134). Quando a assinatura não muda, a rotina sai cedo. Escrita só pelas próprias rotinas.';

ALTER TABLE public.rotinas_controle ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated Read: rotinas_controle" ON public.rotinas_controle;
CREATE POLICY "Authenticated Read: rotinas_controle" ON public.rotinas_controle FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.rotinas_controle FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rotinas_controle TO authenticated;

-- ------------------------------------------------------------------------------
-- 2) recalcular_pagamento_faturas(): sai cedo quando nada mudou
--    Mesma assinatura e mesmas permissões da migration 125 (CREATE OR REPLACE). A regra do cálculo não muda.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalcular_pagamento_faturas()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_faturas INTEGER;
  v_alteradas INTEGER;
  v_removidas INTEGER;
  v_resultado JSONB;
  v_assinatura TEXT;
  v_detalhes JSONB;
  v_anterior public.rotinas_controle%ROWTYPE;
BEGIN
  -- pg_has_role: o db push entra com um papel de login membro de postgres (cli_login_postgres); o authenticator do app não é.
  IF NOT (public.eh_service_role() OR public.has_role('gestor') OR public.has_role('admin')
          OR session_user IN ('postgres', 'supabase_admin') OR pg_has_role(session_user, 'postgres', 'MEMBER')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito.' USING ERRCODE = '42501';
  END IF;
  -- um recálculo por vez (as duas UGs e o pg_cron podem chamar juntos)
  PERFORM pg_advisory_xact_lock(hashtext('recalcular_pagamento_faturas'));

  -- Assinatura do que a regra lê (migration 134): só as colunas usadas no cálculo, mais o corpo das funções da
  -- regra (mudou a regra, muda a assinatura). Uma passada por tabela: bem mais barato que o cálculo em si.
  WITH f AS (
    SELECT count(*) AS n, max(sincronizado_em) AS ultimo,
           md5(coalesce(string_agg(md5(concat_ws('|', id_fatura, contract_key, numero, valor_liquido, cancelada, np, ug_np)), '' ORDER BY id_fatura), '')) AS h
      FROM public.contrato_faturas
  ), o AS (
    SELECT count(*) AS n, max(consultado_em) AS ultimo,
           md5(coalesce(string_agg(md5(concat_ws('|', ug, gestao, numero, np, emissao, valor, cancelada, favorecido_documento, favorecido_nome, observacao)), '' ORDER BY ug, gestao, numero), '')) AS h
      FROM public.ordens_bancarias
  ), c AS (
    SELECT count(*) AS n, max(sincronizado_em) AS ultimo,
           md5(coalesce(string_agg(md5(concat_ws('|', uasg, contract_key, fornecedor_cnpj_cpf)), '' ORDER BY uasg, contract_key), '')) AS h
      FROM public.contratos_oficiais
  ), r AS (
    SELECT md5(string_agg(p.prosrc, '' ORDER BY p.proname)) AS h
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('recalcular_pagamento_faturas', 'ob_cita_fatura', 'raiz_documento')
  )
  SELECT md5(f.h || o.h || c.h || r.h),
         jsonb_build_object(
           'faturas', jsonb_build_object('linhas', f.n, 'ultima_sincronizacao', f.ultimo),
           'ordens_bancarias', jsonb_build_object('linhas', o.n, 'ultima_consulta', o.ultimo),
           'contratos', jsonb_build_object('linhas', c.n, 'ultima_sincronizacao', c.ultimo))
    INTO v_assinatura, v_detalhes
    FROM f, o, c, r;

  SELECT * INTO v_anterior FROM public.rotinas_controle WHERE rotina = 'recalcular_pagamento_faturas';
  IF FOUND AND v_anterior.assinatura = v_assinatura THEN
    UPDATE public.rotinas_controle SET conferido_em = NOW(), detalhes = v_detalhes WHERE rotina = 'recalcular_pagamento_faturas';
    RETURN COALESCE(v_anterior.resultado, '{}'::jsonb)
           || jsonb_build_object('alteradas', 0, 'removidas', 0, 'pulado', TRUE,
                                 'motivo', 'nada mudou desde ' || to_char(v_anterior.executado_em AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI') || ' UTC');
  END IF;

  WITH np_valores AS (
    -- quanto as faturas da NP somam e quanto as OBs válidas da NP na mesma UG pagaram
    SELECT fx.ug_np, fx.np, SUM(fx.valor_liquido) AS faturas,
           (SELECT COALESCE(SUM(o.valor), 0) FROM public.ordens_bancarias o
             WHERE o.ug = fx.ug_np AND o.np = fx.np AND NOT o.cancelada) AS obs
      FROM public.contrato_faturas fx
     WHERE fx.np IS NOT NULL AND NOT fx.cancelada
     GROUP BY fx.ug_np, fx.np
  ),
  fornecedor AS (
    SELECT DISTINCT ON (contract_key) contract_key, raiz
      FROM (SELECT contract_key, public.raiz_documento(fornecedor_cnpj_cpf) AS raiz FROM public.contratos_oficiais) c
     WHERE raiz IS NOT NULL
     ORDER BY contract_key
  ),
  calc AS (
    SELECT f.id_fatura, ob.obs, ob.ob_emissao, ob.ob_valor, ob.obs_a_conferir
      FROM public.contrato_faturas f
      LEFT JOIN fornecedor forn ON forn.contract_key = f.contract_key
      LEFT JOIN np_valores npv ON npv.ug_np = f.ug_np AND npv.np = f.np
      CROSS JOIN LATERAL (
        SELECT string_agg(x.numero, ', ' ORDER BY x.emissao, x.numero) FILTER (WHERE x.aceita) AS obs,
               MAX(x.emissao) FILTER (WHERE x.aceita) AS ob_emissao,
               SUM(x.valor) FILTER (WHERE x.aceita) AS ob_valor,
               string_agg(x.numero || ' (' || COALESCE(x.favorecido_nome, 'favorecido não informado') || ')', ', '
                          ORDER BY x.emissao, x.numero) FILTER (WHERE NOT x.aceita) AS obs_a_conferir
          FROM (
            SELECT o.numero, o.emissao, o.valor, o.favorecido_nome,
                   -- a citação (expressão regular) só é avaliada quando o favorecido não confirma sozinho
                   CASE
                     WHEN o.ug = f.ug_np
                      AND (
                        forn.raiz IS NULL
                        OR public.raiz_documento(o.favorecido_documento) = forn.raiz
                        OR (
                          -- intermediário: Banco do Brasil ou Caixa pela raiz do CNPJ, ou "credor sem cadastro" sem
                          -- CNPJ/CPF (estrangeiro). "Credor sem cadastro" com CNPJ é outra empresa (ex.: SERPRO).
                          (public.raiz_documento(o.favorecido_documento) IN ('00000000', '00360305')
                           OR (o.favorecido_nome ~* '^CREDOR SEM CADASTRO'
                               AND COALESCE(length(public.raiz_documento(o.favorecido_documento)), 0) NOT IN (8, 11)))
                          AND COALESCE(npv.obs, 0) >= 0.5 * COALESCE(npv.faturas, 0)
                        )
                      ) THEN TRUE
                     ELSE public.ob_cita_fatura(o.observacao, f.numero)
                   END AS aceita
              FROM public.ordens_bancarias o
             WHERE NOT o.cancelada
               AND o.np = f.np
               AND (o.ug = f.ug_np OR public.ob_cita_fatura(o.observacao, f.numero))
          ) x
      ) ob
     WHERE f.np IS NOT NULL AND (ob.obs IS NOT NULL OR ob.obs_a_conferir IS NOT NULL)
  ),
  removidas AS (
    DELETE FROM public.fatura_pagamento fp
     WHERE NOT EXISTS (SELECT 1 FROM calc c WHERE c.id_fatura = fp.id_fatura)
    RETURNING 1
  ),
  alteradas AS (
    INSERT INTO public.fatura_pagamento AS fp (id_fatura, ordens_bancarias, ob_emissao, ob_valor, obs_a_conferir, calculado_em)
    SELECT id_fatura, obs, ob_emissao, ob_valor, obs_a_conferir, NOW() FROM calc
    ON CONFLICT (id_fatura) DO UPDATE SET
      ordens_bancarias = EXCLUDED.ordens_bancarias, ob_emissao = EXCLUDED.ob_emissao, ob_valor = EXCLUDED.ob_valor,
      obs_a_conferir = EXCLUDED.obs_a_conferir, calculado_em = NOW()
    WHERE (fp.ordens_bancarias, fp.ob_emissao, fp.ob_valor, fp.obs_a_conferir)
          IS DISTINCT FROM (EXCLUDED.ordens_bancarias, EXCLUDED.ob_emissao, EXCLUDED.ob_valor, EXCLUDED.obs_a_conferir)
    RETURNING 1
  )
  SELECT (SELECT COUNT(*) FROM calc), (SELECT COUNT(*) FROM alteradas), (SELECT COUNT(*) FROM removidas)
    INTO v_faturas, v_alteradas, v_removidas;

  v_resultado := jsonb_build_object('faturas_com_ob', v_faturas, 'alteradas', v_alteradas, 'removidas', v_removidas);

  INSERT INTO public.rotinas_controle AS rc (rotina, assinatura, detalhes, conferido_em, executado_em, resultado)
  VALUES ('recalcular_pagamento_faturas', v_assinatura, v_detalhes, NOW(), NOW(), v_resultado)
  ON CONFLICT (rotina) DO UPDATE SET
    assinatura = EXCLUDED.assinatura, detalhes = EXCLUDED.detalhes, conferido_em = NOW(), executado_em = NOW(),
    resultado = EXCLUDED.resultado;

  RETURN v_resultado || jsonb_build_object('pulado', FALSE);
END;
$$;

COMMENT ON FUNCTION public.recalcular_pagamento_faturas() IS
  'Recalcula fatura_pagamento (regra das migrations 123 e 125). Desde a migration 134 sai cedo, sem recalcular, quando faturas, ordens bancárias, fornecedor dos contratos e a própria regra não mudaram desde a última rodada (rotinas_controle).';

-- ------------------------------------------------------------------------------
-- 3) Horários do cron: um por minuto, quatro jobs uma vez por hora
--    Pelo nome, nunca pelo número do job. Job que não existir faz a migration parar: melhor saber do que pular.
--    O teste no PGlite não tem pg_cron; a verificação é pela função cron.alter_job.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_job RECORD;
  v_id BIGINT;
  v_repetidos TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'cron' AND p.proname = 'alter_job') THEN
    RAISE NOTICE 'pg_cron ausente: horários não alterados.';
    RETURN;
  END IF;

  FOR v_job IN
    SELECT * FROM (VALUES
      -- duas vezes por hora → uma
      ('sincronizar-itens-notas-siafi-200330', '2 * * * *'),
      ('sincronizar-itens-notas-siafi-200331', '17 * * * *'),
      ('recalcular-pagamento-faturas',         '28 * * * *'),
      ('conciliar-ciclos-pagamento',           '31 * * * *'),   -- depois do recálculo das :28, como antes
      -- mesmo minuto → minutos diferentes
      ('sincronizar-contratos-200331',         '7 * * * *'),    -- era :05, junto com a 200330
      ('sincronizar-atas-200331',              '18 * * * *'),   -- era :15, junto com a 200330
      ('sincronizar-itens-contratos-200331',   '38 * * * *'),   -- era :25, junto com a 200330
      ('sincronizar-ordens-bancarias-200330',  '53 * * * *'),   -- era :55, junto com o vínculo automático
      ('sincronizar-saldo-contabil-200330',    '9 */6 * * *')   -- era :12, junto com atas-participacao-200331
    ) AS t(nome, horario)
  LOOP
    SELECT jobid INTO v_id FROM cron.job WHERE jobname = v_job.nome;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Job do cron não encontrado: %', v_job.nome;
    END IF;
    PERFORM cron.alter_job(v_id, schedule => v_job.horario);
  END LOOP;

  -- Conferência: nenhum minuto com dois jobs (conta os de hora em hora e os de 6 em 6 horas).
  SELECT string_agg(minuto || ' (' || nomes || ')', '; ')
    INTO v_repetidos
    FROM (
      SELECT split_part(schedule, ' ', 1) AS minuto, string_agg(jobname, ', ' ORDER BY jobname) AS nomes
        FROM cron.job
       WHERE schedule ~ '^[0-9]+ (\*|\*/[0-9]+) \* \* \*$'
       GROUP BY 1
      HAVING count(*) > 1
    ) x;
  IF v_repetidos IS NOT NULL THEN
    RAISE EXCEPTION 'Ainda há jobs no mesmo minuto: %', v_repetidos;
  END IF;
END;
$$;
