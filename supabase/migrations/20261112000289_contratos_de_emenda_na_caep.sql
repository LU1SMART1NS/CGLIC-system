-- ==============================================================================
-- Contratos de emenda parlamentar ficam na unidade interna CAEP (12/11/2026)
-- ==============================================================================
-- Regra da coordenação: todo contrato de emenda parlamentar é da CAEP. Contrato de emenda =
-- par (item da ata, contrato) citado numa linha de pedido de emenda (emenda_pedido_linhas).
--
-- A divisão AUTO da migration 110 só vale quando TODOS os contratos do item cabem na única
-- unidade alocada; num item com contratos de fora da emenda ela desiste e o contrato de emenda
-- fica "Sem unidade". Esta automação cuida só dos contratos de emenda:
--   * contrato de emenda sem divisão → CAEP, se cabe no livre da CAEP no item
--     (alocado − o que já está na CAEP em outros contratos); não cabe = fica sem unidade;
--   * divisão feita por esta automação cuja quantidade do contrato mudou → acompanha, se couber;
--   * divisão feita pelo gestor (ou AUTO da 110) não se toca.
-- Grava como USUARIO (a 110 apaga AUTO quando o item deixa de ter uma unidade só) com o autor
-- 'Automático: emenda → CAEP'. Roda de hora em hora (:57) e uma vez ao aplicar.
-- A carga manual de 12/11/2026 (51 divisões) passa a ter o mesmo autor.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.dividir_contratos_de_emenda_na_caep()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_autor CONSTANT VARCHAR(150) := 'Automático: emenda → CAEP';
  c_obs   CONSTANT TEXT := 'Contrato de emenda parlamentar: unidade CAEP.';
  v_l RECORD;
  v_alocado NUMERIC(18, 4);
  v_outros NUMERIC(18, 4);
  v_novos INTEGER := 0;
  v_atualizados INTEGER := 0;
  v_nao_cabem INTEGER := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.internal_departments WHERE sigla = 'CAEP' AND ativo) THEN
    RETURN jsonb_build_object('novos', 0, 'atualizados', 0, 'nao_cabem', 0, 'motivo', 'CAEP inativa');
  END IF;

  FOR v_l IN
    WITH emenda AS (
      SELECT DISTINCT e.item_key, '200331-' || replace(btrim(e.contrato_numero), '/', '-') AS contract_key
        FROM public.emenda_pedido_linhas e
       WHERE e.contrato_numero IS NOT NULL AND btrim(e.contrato_numero) <> ''
    )
    SELECT l.item_key, l.contract_key,
           COALESCE(l.quantidade_ajustada, l.quantidade_contratada_api) AS qtd,
           d.origem, d.dividido_por_nome, d.quantidade_contrato
      FROM emenda e
      JOIN public.arp_item_contract_links l
        ON l.item_key = e.item_key AND l.contract_key = e.contract_key
      LEFT JOIN public.contrato_item_divisoes d
        ON d.item_key = l.item_key AND d.contract_key = l.contract_key
     WHERE COALESCE(l.quantidade_ajustada, l.quantidade_contratada_api) > 0
       AND (
         d.item_key IS NULL
         OR (d.origem = 'USUARIO' AND d.dividido_por_nome = c_autor
             AND d.quantidade_contrato IS DISTINCT FROM COALESCE(l.quantidade_ajustada, l.quantidade_contratada_api))
       )
     ORDER BY l.item_key, l.contract_key
  LOOP
    -- A mesma trava que save_allocations_atomic e dividir_contrato_nas_unidades usam.
    PERFORM 1 FROM public.item_allocation_state WHERE item_key = v_l.item_key FOR UPDATE;

    -- O gestor pode ter dividido entre a leitura e a trava: a dele fica.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.contrato_item_divisoes d
       WHERE d.item_key = v_l.item_key AND d.contract_key = v_l.contract_key
         AND d.dividido_por_nome IS DISTINCT FROM c_autor
    );

    SELECT a.allocated_qty INTO v_alocado
      FROM public.arp_allocations a
     WHERE a.item_key = v_l.item_key AND a.unit_name = 'CAEP';

    SELECT COALESCE(sum(u.quantidade), 0) INTO v_outros
      FROM public.contrato_item_divisao_unidades u
     WHERE u.item_key = v_l.item_key AND u.unit_name = 'CAEP' AND u.contract_key <> v_l.contract_key;

    IF v_alocado IS NULL OR v_outros + v_l.qtd > v_alocado THEN
      v_nao_cabem := v_nao_cabem + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.contrato_item_divisoes (
      item_key, contract_key, origem, quantidade_contrato, dividido_por_user_id, dividido_por_nome, dividido_em, observacao
    ) VALUES (
      v_l.item_key, v_l.contract_key, 'USUARIO', v_l.qtd, NULL, c_autor, NOW(), c_obs
    )
    ON CONFLICT (item_key, contract_key) DO UPDATE
      SET quantidade_contrato = EXCLUDED.quantidade_contrato,
          dividido_em = EXCLUDED.dividido_em
    WHERE public.contrato_item_divisoes.dividido_por_nome = c_autor;

    DELETE FROM public.contrato_item_divisao_unidades
     WHERE item_key = v_l.item_key AND contract_key = v_l.contract_key;
    INSERT INTO public.contrato_item_divisao_unidades (item_key, contract_key, unit_name, quantidade)
    VALUES (v_l.item_key, v_l.contract_key, 'CAEP', v_l.qtd);

    IF v_l.origem IS NULL THEN
      v_novos := v_novos + 1;
    ELSE
      v_atualizados := v_atualizados + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('novos', v_novos, 'atualizados', v_atualizados, 'nao_cabem', v_nao_cabem);
END;
$$;

REVOKE ALL ON FUNCTION public.dividir_contratos_de_emenda_na_caep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dividir_contratos_de_emenda_na_caep() TO service_role;

COMMENT ON FUNCTION public.dividir_contratos_de_emenda_na_caep() IS
  'Contrato de emenda parlamentar (citado em emenda_pedido_linhas) sem divisão vai para a CAEP se couber no alocado dela no item. Autor ''Automático: emenda → CAEP''. Cron :57.';

-- Carga manual de 12/11/2026 passa a ser desta automação.
UPDATE public.contrato_item_divisoes
   SET dividido_por_nome = 'Automático: emenda → CAEP',
       observacao = 'Contrato de emenda parlamentar: unidade CAEP.'
 WHERE origem = 'USUARIO'
   AND dividido_por_nome = 'Carga: emenda → CAEP';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dividir-contratos-de-emenda-na-caep') THEN
    PERFORM cron.unschedule('dividir-contratos-de-emenda-na-caep');
  END IF;
  PERFORM cron.schedule('dividir-contratos-de-emenda-na-caep', '57 * * * *',
                        'SELECT public.dividir_contratos_de_emenda_na_caep()');
END $$;

SELECT public.dividir_contratos_de_emenda_na_caep();
