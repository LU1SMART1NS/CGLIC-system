-- ==============================================================================
-- Versão: 20261113000303_leitura_do_tr_das_atas_novas.sql
-- Leitura automática do prazo de entrega no Termo de Referência das atas novas (pedido do usuário em 13/11/2026).
--
-- A carga da migration 301 leu os editais das atas que já estavam no banco. As que chegam depois passam a ser lidas
-- pelo servidor (recurso 'prazo_tr' da função sincronizar-fontes), de 6 em 6 horas:
-- 1) ata_prazo_leituras_tr: tentativas por compra (o PDF pode derrubar a função); depois de 2 sem leitura, a compra
--    sai da fila e a ata fica para o gestor informar.
-- 2) atas_para_leitura_do_tr(limite): compras com ata vigente sem linha em ata_prazo_entrega (inclusive as de outro
--    órgão em que a SENASP participa).
-- 3) registrar_tentativa_leitura_tr(compra) e gravar_leitura_prazo_tr(payload): só o servidor.
-- 4) Agendamento no minuto 41 das 3h, 9h, 15h e 21h.
-- O recurso só funciona depois de publicar a função sincronizar-fontes.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.ata_prazo_leituras_tr (
  numero_controle_compra VARCHAR(40) PRIMARY KEY CHECK (numero_controle_compra ~ '^[0-9]{14}-1-[0-9]{6}/[0-9]{4}$'),
  tentativas             INTEGER     NOT NULL DEFAULT 0,
  ultima_tentativa       TIMESTAMPTZ,
  lida_em                TIMESTAMPTZ
);
COMMENT ON TABLE public.ata_prazo_leituras_tr IS
  'Leitura do prazo de entrega no TR das atas novas, por compra (migration 303): tentativas e quando foi lida. Só o servidor grava.';
ALTER TABLE public.ata_prazo_leituras_tr ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ata_prazo_leituras_tr FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ata_prazo_leituras_tr TO service_role;

-- Atas vigentes com o número de controle da compra no PNCP.
CREATE OR REPLACE FUNCTION public.atas_da_compra_para_tr()
RETURNS TABLE (ata_key TEXT, numero_ata TEXT, uasg TEXT, compra TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT public.chave_gestao_ata(a.numero_ata || '-' || a.codigo_uasg)::TEXT, a.numero_ata::TEXT, a.codigo_uasg::TEXT,
         split_part(a.numero_controle_pncp, '-', 1) || '-1-' || split_part(a.numero_controle_pncp, '-', 3)
    FROM public.atas_registro_preco a
   WHERE a.numero_controle_pncp ~ '^[0-9]{14}-1-[0-9]{6}/[0-9]{4}-[0-9]{6}$'
     AND (a.data_vigencia_final IS NULL OR a.data_vigencia_final >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE);
$$;
REVOKE ALL ON FUNCTION public.atas_da_compra_para_tr() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atas_da_compra_para_tr() TO service_role;

CREATE OR REPLACE FUNCTION public.atas_para_leitura_do_tr(p_limite INTEGER DEFAULT 50)
RETURNS TABLE (numero_controle_compra TEXT, atas TEXT[], tentativas INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.compra, array_agg(DISTINCT a.ata_key ORDER BY a.ata_key), COALESCE(t.tentativas, 0)
    FROM public.atas_da_compra_para_tr() a
    LEFT JOIN public.ata_prazo_leituras_tr t ON t.numero_controle_compra = a.compra
   WHERE NOT EXISTS (SELECT 1 FROM public.ata_prazo_entrega p WHERE p.ata_key = a.ata_key)
     AND COALESCE(t.tentativas, 0) < 2
     AND (t.ultima_tentativa IS NULL OR t.ultima_tentativa < NOW() - INTERVAL '5 hours')
   GROUP BY a.compra, t.tentativas
   ORDER BY COALESCE(t.tentativas, 0), a.compra DESC
   LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 50), 200));
$$;
REVOKE ALL ON FUNCTION public.atas_para_leitura_do_tr(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atas_para_leitura_do_tr(INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_tentativa_leitura_tr(p_compra TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.ata_prazo_leituras_tr AS t (numero_controle_compra, tentativas, ultima_tentativa)
  VALUES (p_compra, 1, NOW())
  ON CONFLICT (numero_controle_compra) DO UPDATE SET tentativas = t.tentativas + 1, ultima_tentativa = NOW();
$$;
REVOKE ALL ON FUNCTION public.registrar_tentativa_leitura_tr(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_tentativa_leitura_tr(TEXT) TO service_role;

-- Grava a sugestão para as atas da compra que ainda não têm linha (nunca muda prazo confirmado nem leitura anterior).
CREATE OR REPLACE FUNCTION public.gravar_leitura_prazo_tr(p_payload JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_compra  TEXT := p_payload->>'numero_controle_compra';
  v_leitura TEXT := p_payload->>'leitura';
  v_dias    INTEGER := NULLIF(p_payload->>'dias', '')::INTEGER;
  v_cont    TEXT := NULLIF(p_payload->>'contagem', '');
  v_inicio  TEXT := NULLIF(p_payload->>'inicio', '');
  v_trechos TEXT[];
  v_n       INTEGER;
BEGIN
  IF v_compra IS NULL OR v_compra !~ '^[0-9]{14}-1-[0-9]{6}/[0-9]{4}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Compra inválida.' USING ERRCODE = '22023';
  END IF;
  IF v_leitura NOT IN ('CLARO', 'CONFERIR', 'SEM_CLAUSULA') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Leitura inválida.' USING ERRCODE = '22023';
  END IF;
  IF v_dias IS NOT NULL AND v_dias NOT BETWEEN 1 AND 730 THEN v_dias := NULL; END IF;
  IF v_cont IS NOT NULL AND v_cont NOT IN ('CORRIDOS', 'UTEIS') THEN v_cont := NULL; END IF;
  IF v_inicio IS NOT NULL AND v_inicio NOT IN ('OF_RECEBIMENTO', 'OF_EMISSAO', 'ASSINATURA', 'EXERCITO') THEN v_inicio := NULL; END IF;
  SELECT COALESCE(array_agg(left(regexp_replace(x, '[\x01-\x1f]', ' ', 'g'), 300)) FILTER (WHERE btrim(x) <> ''), '{}')
    INTO v_trechos FROM jsonb_array_elements_text(COALESCE(p_payload->'trechos', '[]'::JSONB)) x;

  INSERT INTO public.ata_prazo_entrega (ata_key, numero_ata, uasg, leitura, leitura_motivo, sugerido_dias, sugerido_contagem, contagem_dita,
                                        sugerido_inicio, trechos, documento, url, lido_em)
  SELECT DISTINCT ON (a.ata_key) a.ata_key, a.numero_ata, a.uasg, v_leitura, left(NULLIF(p_payload->>'motivo', ''), 300), v_dias, v_cont,
         COALESCE((p_payload->>'contagem_dita')::BOOLEAN, FALSE), v_inicio, v_trechos[1:3], left(NULLIF(p_payload->>'documento', ''), 300),
         left(NULLIF(p_payload->>'url', ''), 300), NOW()
    FROM public.atas_da_compra_para_tr() a
   WHERE a.compra = v_compra
  ON CONFLICT (ata_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  INSERT INTO public.ata_prazo_leituras_tr AS t (numero_controle_compra, tentativas, ultima_tentativa, lida_em)
  VALUES (v_compra, 1, NOW(), NOW())
  ON CONFLICT (numero_controle_compra) DO UPDATE SET lida_em = NOW();
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.gravar_leitura_prazo_tr(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_leitura_prazo_tr(JSONB) TO service_role;

-- Agendamento: de 6 em 6 horas, no minuto 41.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sincronizar-prazo-tr';
    PERFORM cron.schedule('sincronizar-prazo-tr', '41 3,9,15,21 * * *', $c$SELECT public.disparar_sincronizacao('prazo_tr', '000000')$c$);
  END IF;
END $$;
