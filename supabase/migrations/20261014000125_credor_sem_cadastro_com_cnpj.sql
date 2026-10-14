-- ==============================================================================
-- MIGRATION 125: "CREDOR SEM CADASTRO" COM CNPJ NÃO É INTERMEDIÁRIO
-- Versão: 20261014000125_credor_sem_cadastro_com_cnpj.sql
--
-- Contexto (conferência do 00269/2025 em 14/10/2026): a regra da migration 123 aceitava como intermediário
-- (pagamento confirmado por valor compatível) a OB cujo favorecido se chama "CREDOR SEM CADASTRO", mesmo com CNPJ.
-- Mas o SIAFI usa esse nome também para empresas com CNPJ, como o SERPRO (33.683.111). Resultado: 81 faturas
-- (R$ 5,8 mi, 42 contratos) dadas como pagas por OB de outra empresa; 71 delas por OBs do SERPRO, inclusive 2 dos
-- veículos da General Motors (00269/2025), que o saldo contábil do Tesouro mostra como não pagos.
--
-- O que muda em recalcular_pagamento_faturas():
--   - intermediário = Banco do Brasil ou Caixa pela raiz do CNPJ (00000000 e 00360305), ou "credor sem cadastro"
--     sem CNPJ nem CPF (estrangeiro, carta de crédito). O nome sozinho de banco deixa de valer: só a raiz.
--   - a verificação de acesso aceita também papel membro de postgres (o db push entra como cli_login_postgres),
--     para o cálculo da própria migration rodar no db push.
-- O resto da regra da migration 123 não muda. No fim, recalcula.
-- ==============================================================================

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
BEGIN
  -- pg_has_role: o db push entra com um papel de login membro de postgres (cli_login_postgres); o authenticator do app não é.
  IF NOT (public.eh_service_role() OR public.has_role('gestor') OR public.has_role('admin')
          OR session_user IN ('postgres', 'supabase_admin') OR pg_has_role(session_user, 'postgres', 'MEMBER')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito.' USING ERRCODE = '42501';
  END IF;
  -- um recálculo por vez (as duas UGs e o pg_cron podem chamar juntos)
  PERFORM pg_advisory_xact_lock(hashtext('recalcular_pagamento_faturas'));

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

  RETURN jsonb_build_object('faturas_com_ob', v_faturas, 'alteradas', v_alteradas, 'removidas', v_removidas);
END;
$$;

SELECT public.recalcular_pagamento_faturas();
