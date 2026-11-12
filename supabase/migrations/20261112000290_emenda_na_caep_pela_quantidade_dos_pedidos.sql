-- ==============================================================================
-- Contrato de emenda na CAEP: só a quantidade dos pedidos de emenda (12/11/2026)
-- ==============================================================================
-- Muda a regra da migration 289. Antes o contrato de emenda ia inteiro para a CAEP; agora a CAEP
-- recebe só a soma das linhas de pedido de emenda que citam o contrato naquele item (limitada à
-- quantidade do contrato). O resto do contrato fica sem unidade para o gestor dividir.
--
--   * contrato de emenda sem divisão → CAEP com a quantidade dos pedidos, se couber no livre dela;
--   * divisão desta automação → acompanha a quantidade dos pedidos e a do contrato (se couber);
--     contrato que deixou de ser citado em pedido → a divisão da automação sai;
--   * divisão do gestor e AUTO da migration 110 (item só da CAEP, contrato inteiro) não se tocam.
-- As cargas manuais de 12/11/2026 passam a ser desta automação e são recalculadas ao aplicar.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.dividir_contratos_de_emenda_na_caep()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_autor CONSTANT VARCHAR(150) := 'Automático: emenda → CAEP';
  c_obs   CONSTANT TEXT := 'Contrato de emenda parlamentar: a quantidade dos pedidos de emenda fica na CAEP; o resto, o gestor divide.';
  v_l RECORD;
  v_alocado NUMERIC(18, 4);
  v_outros NUMERIC(18, 4);
  v_novos INTEGER := 0;
  v_atualizados INTEGER := 0;
  v_retirados INTEGER := 0;
  v_nao_cabem INTEGER := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.internal_departments WHERE sigla = 'CAEP' AND ativo) THEN
    RETURN jsonb_build_object('novos', 0, 'atualizados', 0, 'retirados', 0, 'nao_cabem', 0, 'motivo', 'CAEP inativa');
  END IF;

  FOR v_l IN
    WITH emenda AS (
      SELECT e.item_key, '200331-' || replace(btrim(e.contrato_numero), '/', '-') AS contract_key,
             sum(COALESCE(e.quantidade, 0)) AS q_pedidos
        FROM public.emenda_pedido_linhas e
       WHERE e.contrato_numero IS NOT NULL AND btrim(e.contrato_numero) <> ''
       GROUP BY 1, 2
    ),
    alvo AS (
      SELECT l.item_key, l.contract_key,
             COALESCE(l.quantidade_ajustada, l.quantidade_contratada_api) AS qtd_contrato,
             LEAST(COALESCE(e.q_pedidos, 0), COALESCE(l.quantidade_ajustada, l.quantidade_contratada_api, 0)) AS qtd_caep,
             d.origem,
             d.dividido_por_nome,
             d.quantidade_contrato,
             (SELECT sum(u.quantidade) FROM public.contrato_item_divisao_unidades u
               WHERE u.item_key = l.item_key AND u.contract_key = l.contract_key) AS qtd_dividida,
             (SELECT count(*) FROM public.contrato_item_divisao_unidades u
               WHERE u.item_key = l.item_key AND u.contract_key = l.contract_key AND u.unit_name <> 'CAEP') AS outras_unidades
        FROM public.arp_item_contract_links l
        LEFT JOIN emenda e ON e.item_key = l.item_key AND e.contract_key = l.contract_key
        LEFT JOIN public.contrato_item_divisoes d ON d.item_key = l.item_key AND d.contract_key = l.contract_key
       WHERE e.item_key IS NOT NULL OR d.dividido_por_nome = c_autor
    )
    SELECT * FROM alvo a
     WHERE (a.origem IS NULL AND a.qtd_caep > 0)
        OR (a.dividido_por_nome = c_autor AND (
              a.qtd_caep <= 0
              OR a.quantidade_contrato IS DISTINCT FROM a.qtd_contrato
              OR a.qtd_dividida IS DISTINCT FROM a.qtd_caep
              OR a.outras_unidades > 0))
     ORDER BY a.item_key, a.contract_key
  LOOP
    -- A mesma trava que save_allocations_atomic e dividir_contrato_nas_unidades usam.
    PERFORM 1 FROM public.item_allocation_state WHERE item_key = v_l.item_key FOR UPDATE;

    -- O gestor pode ter dividido entre a leitura e a trava: a dele fica.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.contrato_item_divisoes d
       WHERE d.item_key = v_l.item_key AND d.contract_key = v_l.contract_key
         AND d.dividido_por_nome IS DISTINCT FROM c_autor
    );

    -- Deixou de ser citado em pedido (ou o contrato ficou sem quantidade): a divisão da automação sai.
    IF v_l.qtd_caep <= 0 THEN
      DELETE FROM public.contrato_item_divisoes
       WHERE item_key = v_l.item_key AND contract_key = v_l.contract_key AND dividido_por_nome = c_autor;
      v_retirados := v_retirados + 1;
      CONTINUE;
    END IF;

    SELECT a.allocated_qty INTO v_alocado
      FROM public.arp_allocations a
     WHERE a.item_key = v_l.item_key AND a.unit_name = 'CAEP';

    SELECT COALESCE(sum(u.quantidade), 0) INTO v_outros
      FROM public.contrato_item_divisao_unidades u
     WHERE u.item_key = v_l.item_key AND u.unit_name = 'CAEP' AND u.contract_key <> v_l.contract_key;

    IF v_alocado IS NULL OR v_outros + v_l.qtd_caep > v_alocado THEN
      v_nao_cabem := v_nao_cabem + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.contrato_item_divisoes (
      item_key, contract_key, origem, quantidade_contrato, dividido_por_user_id, dividido_por_nome, dividido_em, observacao
    ) VALUES (
      v_l.item_key, v_l.contract_key, 'USUARIO', v_l.qtd_contrato, NULL, c_autor, NOW(), c_obs
    )
    ON CONFLICT (item_key, contract_key) DO UPDATE
      SET quantidade_contrato = EXCLUDED.quantidade_contrato,
          dividido_em = EXCLUDED.dividido_em,
          observacao = EXCLUDED.observacao
    WHERE public.contrato_item_divisoes.dividido_por_nome = c_autor;

    DELETE FROM public.contrato_item_divisao_unidades
     WHERE item_key = v_l.item_key AND contract_key = v_l.contract_key;
    INSERT INTO public.contrato_item_divisao_unidades (item_key, contract_key, unit_name, quantidade)
    VALUES (v_l.item_key, v_l.contract_key, 'CAEP', v_l.qtd_caep);

    IF v_l.origem IS NULL THEN
      v_novos := v_novos + 1;
    ELSE
      v_atualizados := v_atualizados + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('novos', v_novos, 'atualizados', v_atualizados, 'retirados', v_retirados, 'nao_cabem', v_nao_cabem);
END;
$$;

REVOKE ALL ON FUNCTION public.dividir_contratos_de_emenda_na_caep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dividir_contratos_de_emenda_na_caep() TO service_role;

COMMENT ON FUNCTION public.dividir_contratos_de_emenda_na_caep() IS
  'Contrato de emenda parlamentar (citado em emenda_pedido_linhas): a soma dos pedidos que o citam no item vai para a CAEP, se couber no alocado dela. Autor ''Automático: emenda → CAEP''. Cron :57.';

-- Cargas manuais de 12/11/2026 passam a ser desta automação (recalculadas logo abaixo).
UPDATE public.contrato_item_divisoes
   SET dividido_por_nome = 'Automático: emenda → CAEP'
 WHERE origem = 'USUARIO'
   AND dividido_por_nome IN ('Carga: emenda → CAEP', 'Carga: parte da emenda → CAEP');

-- O cron já vem da 289; garante que existe se a 289 não tiver criado.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dividir-contratos-de-emenda-na-caep') THEN
    PERFORM cron.schedule('dividir-contratos-de-emenda-na-caep', '57 * * * *',
                          'SELECT public.dividir_contratos_de_emenda_na_caep()');
  END IF;
END $$;

SELECT public.dividir_contratos_de_emenda_na_caep();
