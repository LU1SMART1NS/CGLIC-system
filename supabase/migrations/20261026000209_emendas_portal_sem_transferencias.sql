-- ==============================================================================
-- MIGRATION 209: NOTAS DO PORTAL SÓ SE O FAVORECIDO FOR FORNECEDOR; CORREÇÕES DE 26/10/2026
--
-- A busca de 26/10/2026 (migration 207) gravou pelo Portal duas notas que são transferências, não compras da CGLIC: o
-- Portal não diz a natureza da despesa, e elas inflaram o empenhado da SENASP nas emendas:
--   2026NE000306 (R$ 1,5 mi, Polícia Civil do Estado de Rondônia, emenda 4360 0002 - Dr. Fernando Máximo)
--   2026NE000308 (R$ 400 mil, Secretaria de Estado da Segurança Pública, emenda 4553 0007 - Gleisi Hoffmann)
-- 1) gravar_notas_pelo_portal: só grava se o favorecido for fornecedor de alguma ata dos pedidos da emenda
--    (credor_e_fornecedor_da_ata); senão marca FORA_DO_ESCOPO, como as transferências da migration 197.
-- 2) Apaga as duas notas (sem ligação a linhas) e marca as tentativas como fora do escopo.
-- 3) Completa o ano da emenda nos pedidos sem ano quando os outros pedidos da mesma emenda têm um ano só (11 pedidos,
--    todos 2026; entre eles o 480, da mesma emenda do 419).
-- 4) Refaz o empenhado da SENASP das emendas lidas no Portal.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.gravar_notas_pelo_portal(p_notas JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_n         JSONB;
  v_numero    TEXT;
  v_codigo    TEXT;
  v_ano       INTEGER;
  v_chave     TEXT;
  v_pi        TEXT;
  v_situacao  TEXT;
  v_empenhado NUMERIC;
  v_liquidado NUMERIC;
  v_pago      NUMERIC;
  v_contagem  JSONB := '{}'::JSONB;
BEGIN
  IF NOT public.eh_service_role() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o servidor grava notas pelo Portal.' USING ERRCODE = '42501';
  END IF;
  IF p_notas IS NULL OR jsonb_typeof(p_notas) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Envie a lista de respostas do Portal.' USING ERRCODE = '22023';
  END IF;

  FOR v_n IN SELECT x FROM jsonb_array_elements(p_notas) x LOOP
    v_numero := upper(btrim(COALESCE(v_n->>'numero', '')));
    v_codigo := NULLIF(regexp_replace(COALESCE(v_n->>'emenda_codigo', ''), '\D', '', 'g'), '');
    -- Só a nota que ainda está na lista e cuja emenda é a do pedido que a cita.
    IF NOT EXISTS (SELECT 1 FROM public.notas_das_emendas_pelo_portal(INTERVAL '0 seconds') a WHERE a.numero_oficial = v_numero) THEN
      CONTINUE;
    END IF;
    IF v_codigo IS NULL OR v_codigo !~ '^20[0-9]{10}$'
       OR NOT EXISTS (SELECT 1 FROM public.notas_das_emendas_pelo_portal(INTERVAL '0 seconds') a
                       WHERE a.numero_oficial = v_numero AND a.emenda = right(v_codigo, 8)) THEN
      v_situacao := 'PORTAL_SEM_A_NOTA';
    -- Migration 209: o Portal não diz a natureza da despesa. Só é compra da CGLIC se o favorecido for fornecedor de
    -- alguma ata dos pedidos da emenda; senão é transferência (convênio, contribuição a estado ou município) ou outra
    -- despesa, e fica fora como na migration 197 (ex.: 2026NE000306, Polícia Civil de RO; 2026NE000308, SESP).
    ELSIF NOT EXISTS (
      SELECT 1
        FROM public.emenda_pedidos p
        JOIN public.emenda_pedido_linhas l ON l.pedido_id = p.id AND NOT l.cancelada AND l.item_key IS NOT NULL
        JOIN public.atas_registro_preco r ON r.numero_ata = split_part(l.item_key, '-', 1) AND r.codigo_uasg = split_part(l.item_key, '-', 2)
        JOIN public.itens_ata i ON i.ata_id = r.id AND lpad(i.numero_item, 5, '0') = split_part(l.item_key, '-', 3)
       WHERE p.siop_emenda = right(v_codigo, 8) AND p.etapa <> 'CANCELADO'
         AND public.credor_e_fornecedor_da_ata(v_n->>'favorecido_codigo', v_n->>'favorecido_nome', i.fornecedor_cnpj_cpf, i.fornecedor_razao_social)
    ) THEN
      v_situacao := 'FORA_DO_ESCOPO';
    ELSE
      v_ano := left(v_numero, 4)::INTEGER;
      v_chave := '200330-' || v_ano || '-' || v_ano || 'NE' || (substr(v_numero, 7))::INTEGER;
      v_pi := left('Emenda ' || v_codigo || ' (Portal da Transparência)' || COALESCE(' - ' || NULLIF(btrim(v_n->>'autor'), ''), ''), 200);
      SELECT sum(s.saldo) FILTER (WHERE s.conta IN ('622920101', '622920102', '622920103', '622920104')),
             sum(s.saldo) FILTER (WHERE s.conta IN ('622920103', '622920104')),
             sum(s.saldo) FILTER (WHERE s.conta = '622920104')
        INTO v_empenhado, v_liquidado, v_pago
        FROM public.empenho_saldo_contabil s
       WHERE s.ug = '200330' AND s.numero_empenho = v_numero AND s.ano = v_ano;
      IF v_empenhado IS NULL THEN
        v_situacao := 'SEM_SALDO_CONTABIL';
      ELSE
        INSERT INTO public.empenhos (
          canonical_key, numero_oficial, ano_exercicio, uasg_emitente, numero_normalizado, data_emissao,
          valor_empenhado, valor_liquidado, valor_pago, valor_rpinscrito, credor_nome, credor_cnpj_cpf,
          fonte_origem, informado_manualmente_inicialmente, plano_interno, last_synced_at)
        VALUES (
          v_chave, v_numero, v_ano, '200330', v_ano || 'NE' || (substr(v_numero, 7))::INTEGER,
          COALESCE(NULLIF(v_n->>'data', '')::DATE, make_date(v_ano, 1, 1)),
          GREATEST(v_empenhado, 0), GREATEST(COALESCE(v_liquidado, 0), 0), GREATEST(COALESCE(v_pago, 0), 0), 0,
          NULLIF(btrim(v_n->>'favorecido_nome'), ''), NULLIF(btrim(v_n->>'favorecido_codigo'), ''),
          'PORTAL', FALSE, v_pi, NOW())
        ON CONFLICT (canonical_key) DO NOTHING;
        v_situacao := CASE WHEN FOUND THEN 'GRAVADA' ELSE 'JA_EXISTIA' END;
      END IF;
    END IF;

    UPDATE public.emenda_notas_tesouro_tentativas
       SET portal_em = NOW(),
           situacao = CASE WHEN v_situacao IN ('GRAVADA', 'JA_EXISTIA', 'FORA_DO_ESCOPO') THEN v_situacao ELSE situacao END,
           ug = CASE WHEN v_situacao IN ('GRAVADA', 'JA_EXISTIA') THEN '200330' ELSE ug END,
           detalhe = CASE WHEN v_situacao IN ('GRAVADA', 'JA_EXISTIA') THEN 'pelo Portal da Transparência: ' || v_pi
                          WHEN v_situacao = 'PORTAL_SEM_A_NOTA' THEN 'O Portal não liga a nota à emenda do pedido.'
                          WHEN v_situacao = 'FORA_DO_ESCOPO' THEN left('Favorecido ' || COALESCE(NULLIF(btrim(v_n->>'favorecido_nome'), ''), '?')
                               || ' não é fornecedor das atas dos pedidos da emenda: transferência ou outra despesa, não compra da CGLIC (Portal).', 300)
                          ELSE detalhe END
     WHERE numero_oficial = v_numero;
    v_contagem := jsonb_set(v_contagem, ARRAY[v_situacao], to_jsonb(COALESCE((v_contagem->>v_situacao)::INTEGER, 0) + 1));
  END LOOP;

  RETURN v_contagem;
END;
$function$;

DELETE FROM public.empenhos e
 WHERE e.fonte_origem = 'PORTAL' AND e.uasg_emitente = '200330' AND e.numero_oficial IN ('2026NE000306', '2026NE000308')
   AND NOT EXISTS (SELECT 1 FROM public.emenda_linha_notas n WHERE n.empenho_id = e.id);

UPDATE public.emenda_notas_tesouro_tentativas t
   SET situacao = 'FORA_DO_ESCOPO',
       detalhe = CASE t.numero_oficial
                   WHEN '2026NE000306' THEN 'Transferência, não compra da CGLIC (favorecido POLICIA CIVIL DO ESTADO DE RONDONIA, pelo Portal). Apagada na migration 209.'
                   ELSE 'Transferência, não compra da CGLIC (favorecido SECRETARIA DE ESTADO DA SEGURANCA PUBLICA, pelo Portal). Apagada na migration 209.'
                 END
 WHERE t.numero_oficial IN ('2026NE000306', '2026NE000308');

UPDATE public.emenda_pedidos p
   SET siop_emenda_ano = a.ano
  FROM (SELECT siop_emenda, min(siop_emenda_ano) AS ano
          FROM public.emenda_pedidos
         WHERE siop_emenda IS NOT NULL AND siop_emenda_ano IS NOT NULL AND etapa <> 'CANCELADO'
         GROUP BY siop_emenda
        HAVING count(DISTINCT siop_emenda_ano) = 1) a
 WHERE p.siop_emenda = a.siop_emenda AND p.siop_emenda_ano IS NULL AND p.etapa <> 'CANCELADO';

UPDATE public.emenda_execucao_portal x
   SET (empenhado_senasp, notas_sem_valor) = (SELECT v.empenhado, v.sem_valor FROM public.emendas_valor_notas_senasp(x.notas_senasp) v)
 WHERE x.notas_senasp IS NOT NULL;
