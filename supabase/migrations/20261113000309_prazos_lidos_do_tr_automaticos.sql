-- ==============================================================================
-- Versão: 20261113000309_prazos_lidos_do_tr_automaticos.sql
-- Leitura clara do TR vale sozinha (decisão do usuário em 13/11/2026): o prazo de entrega e o de recebimento lidos com
-- clareza passam a valer sem a confirmação do gestor da ata, marcados "leitura do TR" (automático). O gestor pode
-- corrigir quando quiser, sem motivo na primeira vez; a leitura duvidosa ou sem cláusula continua a confirmar.
--
-- 1) ata_prazo_entrega: confirmado_automatico e recebimento_automatico.
-- 2) Carga: prazo de entrega das leituras CLARO ainda sem confirmação; recebimento das 79 compras com leitura clara
--    (modelo da AGU de material: os trechos com nota fiscal dizem o mesmo). Os itens sem data prevista recebem a data
--    pela regra (as datas da planilha não mudam).
-- 3) fisc_regra_do_contrato e fisc_regra_de_recebimento dizem se a regra é automática.
-- 4) confirmar_prazo_entrega_ata: corrigir a leitura automática não pede motivo; confirmar tira o "automático".
-- 5) gravar_leitura_prazo_tr (atas novas): leitura clara já entra valendo.
-- ==============================================================================

-- 1) Colunas -------------------------------------------------------------------------------------------------
ALTER TABLE public.ata_prazo_entrega
  ADD COLUMN IF NOT EXISTS confirmado_automatico  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recebimento_automatico BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN public.ata_prazo_entrega.confirmado_automatico IS
  'O prazo de entrega vale pela leitura clara do TR, sem confirmação do gestor da ata (migration 309).';
COMMENT ON COLUMN public.ata_prazo_entrega.recebimento_automatico IS
  'O prazo de recebimento vale pela leitura clara do TR, sem confirmação do gestor da ata (migration 309).';

-- 2) Carga ---------------------------------------------------------------------------------------------------
UPDATE public.ata_prazo_entrega
   SET sem_prazo = FALSE, dias = sugerido_dias, contagem = sugerido_contagem, inicio = sugerido_inicio, por_item = '{}'::JSONB,
       confirmado_por = NULL, confirmado_por_nome = 'Leitura do TR', confirmado_em = NOW(), confirmado_automatico = TRUE
 WHERE confirmado_em IS NULL AND leitura = 'CLARO'
   AND sugerido_dias BETWEEN 1 AND 730 AND sugerido_contagem IN ('CORRIDOS', 'UTEIS')
   AND sugerido_inicio IN ('OF_RECEBIMENTO', 'OF_EMISSAO', 'ASSINATURA', 'EXERCITO');

-- Recebimento: as compras com leitura clara (C:ano/sequencial pelo link do edital; A:número da ata quando o texto foi
-- lido pela ata e o número é de uma ata só), as mesmas chaves da carga da migration 306.
WITH claras (chave) AS (SELECT unnest(ARRAY['A:00001/2025', 'A:00002/2026', 'A:00005/2025', 'A:00013/2025', 'A:00020/2026', 'A:00024/2024', 'A:00024/2026', 'A:00036/2024', 'A:00037/2024', 'A:00040/2025', 'A:00047/2024', 'A:00048/2025', 'A:00050/2025', 'A:00051/2024', 'A:00052/2024', 'A:00058/2025', 'A:00059/2024', 'A:00073/2025', 'A:00074/2025', 'A:00090/2024', 'A:00102/2024', 'A:00108/2024', 'C:2023/108', 'C:2023/1023', 'C:2024/291', 'C:2024/390', 'C:2024/709', 'C:2024/808', 'C:2024/820', 'C:2024/827', 'C:2024/839', 'C:2024/905', 'C:2024/947', 'C:2024/1048', 'C:2024/1077', 'C:2024/1096', 'C:2024/1097', 'C:2024/1102', 'C:2024/1112', 'C:2024/1115', 'C:2024/1130', 'C:2024/1132', 'C:2024/1157', 'C:2024/1169', 'C:2024/1197', 'C:2024/1233', 'C:2024/1264', 'C:2024/1265', 'C:2024/1398', 'C:2024/1400', 'C:2024/1407', 'C:2024/1408', 'C:2024/1410', 'C:2024/1413', 'C:2024/1431', 'C:2024/1436', 'C:2025/219', 'C:2025/220', 'C:2025/304', 'C:2025/322', 'C:2025/450', 'C:2025/571', 'C:2025/641', 'C:2025/669', 'C:2025/704', 'C:2025/724', 'C:2025/835', 'C:2025/996', 'C:2025/1102', 'C:2025/1276', 'C:2025/1313', 'C:2025/1331', 'C:2025/1447', 'C:2025/1524', 'C:2025/1651', 'C:2025/1664', 'C:2025/1667', 'C:2026/275', 'C:2026/366'])),
alvo AS (
  SELECT p.ata_key FROM claras l
    JOIN public.ata_prazo_entrega p ON l.chave LIKE 'C:%'
     AND p.url ~ ('/editais/[0-9]+/' || split_part(substr(l.chave, 3), '/', 1) || '/' || split_part(substr(l.chave, 3), '/', 2) || '$')
  UNION
  SELECT p.ata_key FROM claras l
    JOIN public.ata_prazo_entrega p ON l.chave LIKE 'A:%' AND p.numero_ata = substr(l.chave, 3)
   WHERE (SELECT count(*) FROM public.ata_prazo_entrega x WHERE x.numero_ata = substr(l.chave, 3)) = 1
)
UPDATE public.ata_prazo_entrega p
   SET recebimento = p.recebimento_sugerido, recebimento_confirmado_por_nome = 'Leitura do TR', recebimento_confirmado_em = NOW(),
       recebimento_automatico = TRUE
  FROM alvo a
 WHERE p.ata_key = a.ata_key AND p.recebimento_confirmado_em IS NULL AND p.recebimento_sugerido IS NOT NULL;

-- 3) Regras com "automatico" ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fisc_regra_do_contrato(p_contrato TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  f        public.fisc_contratos%ROWTYPE;
  a        public.ata_prazo_entrega%ROWTYPE;
  v_atas   TEXT[];
  v_regras INTEGER;
  v_item   JSONB;
BEGIN
  SELECT * INTO f FROM public.fisc_contratos WHERE contract_key = p_contrato;
  IF FOUND AND f.prazo_dias IS NOT NULL THEN
    RETURN jsonb_build_object('dias', f.prazo_dias, 'contagem', f.prazo_contagem, 'inicio', f.prazo_inicio, 'origem', f.prazo_origem,
                              'ata', f.prazo_ata, 'trecho', f.prazo_trecho, 'documento', f.prazo_documento, 'motivo', f.prazo_motivo,
                              'definidoPor', f.prazo_definido_por_nome, 'definidoEm', f.prazo_definido_em);
  END IF;
  SELECT array_agg(DISTINCT public.ata_key_from_item_key(l.item_key)) INTO v_atas
    FROM public.arp_item_contract_links l WHERE l.contract_key = p_contrato;
  IF v_atas IS NULL THEN RETURN NULL; END IF;
  SELECT count(DISTINCT (p.dias, p.contagem, p.inicio)) INTO v_regras
    FROM public.ata_prazo_entrega p WHERE p.ata_key = ANY (v_atas) AND p.confirmado_em IS NOT NULL AND NOT p.sem_prazo;
  IF v_regras = 0 THEN RETURN NULL; END IF;
  IF v_regras > 1 THEN
    RETURN jsonb_build_object('conflito', TRUE, 'atas', to_jsonb(v_atas));
  END IF;
  SELECT * INTO a FROM public.ata_prazo_entrega p
   WHERE p.ata_key = ANY (v_atas) AND p.confirmado_em IS NOT NULL AND NOT p.sem_prazo ORDER BY p.ata_key LIMIT 1;
  -- Prazo por item, com a chave "ata|item" (o item vem da chave do item da ata: ata-UASG-item).
  SELECT COALESCE(jsonb_object_agg(p.ata_key || '|' || x.key, x.value), '{}'::JSONB) INTO v_item
    FROM public.ata_prazo_entrega p, jsonb_each(p.por_item) x
   WHERE p.ata_key = ANY (v_atas) AND p.confirmado_em IS NOT NULL AND NOT p.sem_prazo;
  RETURN jsonb_build_object('dias', a.dias, 'contagem', a.contagem, 'inicio', a.inicio, 'origem', 'TR', 'ata', a.numero_ata,
                            'trecho', array_to_string(a.trechos, ' '), 'documento', a.documento,
                            'confirmadoPor', a.confirmado_por_nome, 'confirmadoEm', a.confirmado_em, 'porItem', v_item,
                            'automatico', a.confirmado_automatico);
END;
$$;

CREATE OR REPLACE FUNCTION public.fisc_regra_de_recebimento(p_contrato TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c      JSONB;
  v_atas   TEXT[];
  v_regras INTEGER;
  a        public.ata_prazo_entrega%ROWTYPE;
  n        INTEGER;
BEGIN
  SELECT f.prazo_recebimento INTO v_c FROM public.fisc_contratos f WHERE f.contract_key = p_contrato;
  IF v_c IS NOT NULL THEN RETURN v_c; END IF;
  SELECT array_agg(DISTINCT public.ata_key_from_item_key(l.item_key)) INTO v_atas
    FROM public.arp_item_contract_links l WHERE l.contract_key = p_contrato;
  IF v_atas IS NULL THEN RETURN NULL; END IF;
  SELECT count(DISTINCT p.recebimento) INTO v_regras
    FROM public.ata_prazo_entrega p WHERE p.ata_key = ANY (v_atas) AND p.recebimento IS NOT NULL;
  IF v_regras = 0 THEN RETURN NULL; END IF;
  IF v_regras > 1 THEN RETURN jsonb_build_object('conflito', TRUE); END IF;
  SELECT * INTO a FROM public.ata_prazo_entrega p WHERE p.ata_key = ANY (v_atas) AND p.recebimento IS NOT NULL ORDER BY p.ata_key LIMIT 1;
  n := cardinality(a.recebimento_trechos);
  RETURN a.recebimento || jsonb_build_object('origem', 'TR', 'ata', a.numero_ata, 'confirmadoPor', a.recebimento_confirmado_por_nome,
                                             'automatico', a.recebimento_automatico,
                                             'trechoTrp', CASE WHEN n >= 2 THEN a.recebimento_trechos[1] END,
                                             'trechoTrd', CASE WHEN n >= 1 THEN a.recebimento_trechos[n] END);
END;
$$;

-- 4) Confirmação do gestor -----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirmar_prazo_entrega_ata(p_ata_key TEXT, p_sem_prazo BOOLEAN, p_dias INTEGER, p_contagem TEXT,
                                                              p_inicio TEXT, p_por_item JSONB, p_motivo TEXT,
                                                     p_recebimento JSONB DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome  TEXT := left(public.nome_do_usuario_logado(), 200);
  v_mot   TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_key   TEXT := btrim(COALESCE(p_ata_key, ''));
  v_item  JSONB := COALESCE(p_por_item, '{}'::JSONB);
  p       public.ata_prazo_entrega%ROWTYPE;
  v_c     RECORD;
  v_ct    INTEGER := 0;
  v_it    INTEGER := 0;
  -- Recebimento (migration 305): NULL = não mexe; {"naoDiz": true} = o TR não traz o prazo; senão, a regra.
  v_rec_informado BOOLEAN := p_recebimento IS NOT NULL;
  v_rec   JSONB := CASE WHEN p_recebimento IS NULL OR COALESCE((p_recebimento->>'naoDiz')::BOOLEAN, FALSE) THEN NULL
                        ELSE public.fisc_recebimento_normalizado(p_recebimento) END;
  v_entrega_mudou BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Faça login.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role('admin')
     AND NOT EXISTS (SELECT 1 FROM public.ata_managers am WHERE am.ata_key = v_key AND am.gestor_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor da ata ou o coordenador confirmam o prazo de entrega.' USING ERRCODE = '42501';
  END IF;
  IF v_key !~ '^\d{5}/\d{4}(-\d{6})?$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Ata inválida.' USING ERRCODE = '22023';
  END IF;
  IF NOT COALESCE(p_sem_prazo, FALSE) THEN
    IF p_dias IS NULL OR p_dias NOT BETWEEN 1 AND 730 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Prazo de 1 a 730 dias.' USING ERRCODE = '22023';
    END IF;
    IF p_contagem NOT IN ('CORRIDOS', 'UTEIS') OR p_inicio NOT IN ('OF_RECEBIMENTO', 'OF_EMISSAO', 'ASSINATURA', 'EXERCITO') THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Contagem ou início do prazo inválido.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_item) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_each(v_item) x
                                                     WHERE x.key !~ '^\d{1,5}$' OR jsonb_typeof(x.value) <> 'number'
                                                        OR (x.value)::TEXT::NUMERIC NOT BETWEEN 1 AND 730) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Prazo por item inválido.' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_rec_informado AND v_rec IS NULL AND NOT COALESCE((p_recebimento->>'naoDiz')::BOOLEAN, FALSE) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Prazo de recebimento inválido (TRP de 0 a 90 dias, TRD de 1 a 90).' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO p FROM public.ata_prazo_entrega WHERE ata_key = v_key FOR UPDATE;
  -- Leitura automática do TR (migration 309): a primeira confirmação do gestor vale como confirmação, mesmo sem mudar.
  v_entrega_mudou := NOT FOUND OR p.confirmado_em IS NULL OR p.confirmado_automatico
     OR (p.sem_prazo, p.dias, p.contagem, p.inicio, p.por_item) IS DISTINCT FROM
        (COALESCE(p_sem_prazo, FALSE), CASE WHEN p_sem_prazo THEN NULL ELSE p_dias END, CASE WHEN p_sem_prazo THEN NULL ELSE p_contagem END,
         CASE WHEN p_sem_prazo THEN NULL ELSE p_inicio END, CASE WHEN p_sem_prazo THEN '{}'::JSONB ELSE v_item END);
  IF FOUND AND v_rec_informado AND p.recebimento_confirmado_em IS NOT NULL AND NOT p.recebimento_automatico AND p.recebimento IS DISTINCT FROM v_rec
     AND COALESCE(length(v_mot), 0) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Diga por que o prazo de recebimento confirmado muda (mínimo de 10 letras).' USING ERRCODE = '22023';
  END IF;
  IF FOUND AND p.confirmado_em IS NOT NULL AND NOT p.confirmado_automatico
     AND (p.sem_prazo, p.dias, p.contagem, p.inicio, p.por_item) IS DISTINCT FROM
         (COALESCE(p_sem_prazo, FALSE), CASE WHEN p_sem_prazo THEN NULL ELSE p_dias END, CASE WHEN p_sem_prazo THEN NULL ELSE p_contagem END,
          CASE WHEN p_sem_prazo THEN NULL ELSE p_inicio END, CASE WHEN p_sem_prazo THEN '{}'::JSONB ELSE v_item END)
     AND COALESCE(length(v_mot), 0) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Diga por que o prazo confirmado muda (mínimo de 10 letras).' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ata_prazo_entrega AS t (ata_key, numero_ata, uasg, sem_prazo, dias, contagem, inicio, por_item, motivo,
                                             confirmado_por, confirmado_por_nome, confirmado_em)
  VALUES (v_key, split_part(v_key, '-', 1), NULLIF(split_part(v_key, '-', 2), ''), COALESCE(p_sem_prazo, FALSE),
          CASE WHEN p_sem_prazo THEN NULL ELSE p_dias END, CASE WHEN p_sem_prazo THEN NULL ELSE p_contagem END,
          CASE WHEN p_sem_prazo THEN NULL ELSE p_inicio END, CASE WHEN p_sem_prazo THEN '{}'::JSONB ELSE v_item END, v_mot,
          auth.uid(), v_nome, NOW())
  ON CONFLICT (ata_key) DO UPDATE
     SET sem_prazo = EXCLUDED.sem_prazo, dias = EXCLUDED.dias, contagem = EXCLUDED.contagem, inicio = EXCLUDED.inicio,
         por_item = EXCLUDED.por_item, motivo = CASE WHEN v_entrega_mudou THEN COALESCE(EXCLUDED.motivo, t.motivo) ELSE t.motivo END,
         -- Só o recebimento confirmado: o prazo de entrega guarda quem e quando o confirmou.
         confirmado_por = CASE WHEN v_entrega_mudou THEN EXCLUDED.confirmado_por ELSE t.confirmado_por END,
         confirmado_por_nome = CASE WHEN v_entrega_mudou THEN EXCLUDED.confirmado_por_nome ELSE t.confirmado_por_nome END,
         confirmado_em = CASE WHEN v_entrega_mudou THEN EXCLUDED.confirmado_em ELSE t.confirmado_em END,
         confirmado_automatico = CASE WHEN v_entrega_mudou THEN FALSE ELSE t.confirmado_automatico END;

  IF v_rec_informado THEN
    UPDATE public.ata_prazo_entrega
       SET recebimento = v_rec,
           recebimento_motivo = CASE WHEN recebimento_confirmado_em IS NOT NULL AND recebimento IS DISTINCT FROM v_rec THEN v_mot ELSE recebimento_motivo END,
           recebimento_confirmado_por_nome = v_nome, recebimento_confirmado_em = NOW(), recebimento_automatico = FALSE
     WHERE ata_key = v_key;
  END IF;

  -- Contratos da ata que herdam: os itens que já podem ter a data recebem agora.
  FOR v_c IN SELECT DISTINCT l.contract_key FROM public.arp_item_contract_links l
              JOIN public.fisc_contratos f ON f.contract_key = l.contract_key AND f.prazo_dias IS NULL
             WHERE public.ata_key_from_item_key(l.item_key) = v_key LOOP
    v_ct := v_ct + 1;
    v_it := v_it + public.fisc_aplicar_regra_aos_itens(v_c.contract_key, v_nome);
  END LOOP;
  RETURN jsonb_build_object('ata', v_key, 'contratos', v_ct, 'itens_com_data', v_it);
END;
$$;
REVOKE ALL ON FUNCTION public.confirmar_prazo_entrega_ata(TEXT, BOOLEAN, INTEGER, TEXT, TEXT, JSONB, TEXT, JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_prazo_entrega_ata(TEXT, BOOLEAN, INTEGER, TEXT, TEXT, JSONB, TEXT, JSONB) TO authenticated;

-- 5) Leitura das atas novas ----------------------------------------------------------------------------------
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
  v_trechos_rec TEXT[];
  v_claro     BOOLEAN;
  v_rec_claro BOOLEAN;
  v_c         RECORD;
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
  SELECT COALESCE(array_agg(left(regexp_replace(x, '[\x01-\x1f]', ' ', 'g'), 300)) FILTER (WHERE btrim(x) <> ''), '{}')
    INTO v_trechos_rec FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_payload->'recebimento_trechos') = 'array' THEN p_payload->'recebimento_trechos' ELSE '[]'::JSONB END) x;
  v_trechos_rec := v_trechos_rec[1:2];
  v_claro := v_leitura = 'CLARO' AND v_dias IS NOT NULL AND v_cont IS NOT NULL AND v_inicio IS NOT NULL;
  v_rec_claro := COALESCE((p_payload->>'recebimento_claro')::BOOLEAN, FALSE) AND public.fisc_recebimento_normalizado(p_payload->'recebimento') IS NOT NULL;

  INSERT INTO public.ata_prazo_entrega (ata_key, numero_ata, uasg, leitura, leitura_motivo, sugerido_dias, sugerido_contagem, contagem_dita,
                                        sugerido_inicio, trechos, documento, url, lido_em, recebimento_sugerido, recebimento_trechos,
                                        dias, contagem, inicio, confirmado_por_nome, confirmado_em, confirmado_automatico,
                                        recebimento, recebimento_confirmado_por_nome, recebimento_confirmado_em, recebimento_automatico)
  SELECT DISTINCT ON (a.ata_key) a.ata_key, a.numero_ata, a.uasg, v_leitura, left(NULLIF(p_payload->>'motivo', ''), 300), v_dias, v_cont,
         COALESCE((p_payload->>'contagem_dita')::BOOLEAN, FALSE), v_inicio, v_trechos[1:3], left(NULLIF(p_payload->>'documento', ''), 300),
         left(NULLIF(p_payload->>'url', ''), 300), NOW(),
         public.fisc_recebimento_normalizado(p_payload->'recebimento'), v_trechos_rec,
         -- Leitura clara vale sozinha (migration 309); a duvidosa espera o gestor da ata.
         CASE WHEN v_claro THEN v_dias END, CASE WHEN v_claro THEN v_cont END, CASE WHEN v_claro THEN v_inicio END,
         CASE WHEN v_claro THEN 'Leitura do TR' END, CASE WHEN v_claro THEN NOW() END, v_claro,
         CASE WHEN v_rec_claro THEN public.fisc_recebimento_normalizado(p_payload->'recebimento') END,
         CASE WHEN v_rec_claro THEN 'Leitura do TR' END, CASE WHEN v_rec_claro THEN NOW() END, v_rec_claro
    FROM public.atas_da_compra_para_tr() a
   WHERE a.compra = v_compra
  ON CONFLICT (ata_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  -- Contratos acompanhados dessas atas que herdam o prazo: os itens que já podem ter a data recebem agora.
  IF v_claro AND v_n > 0 THEN
    FOR v_c IN SELECT DISTINCT l.contract_key FROM public.arp_item_contract_links l
                 JOIN public.fisc_contratos f ON f.contract_key = l.contract_key AND f.prazo_dias IS NULL
                 JOIN public.atas_da_compra_para_tr() a ON a.compra = v_compra AND a.ata_key = public.ata_key_from_item_key(l.item_key) LOOP
      PERFORM public.fisc_aplicar_regra_aos_itens(v_c.contract_key, 'Leitura do TR');
    END LOOP;
  END IF;

  INSERT INTO public.ata_prazo_leituras_tr AS t (numero_controle_compra, tentativas, ultima_tentativa, lida_em)
  VALUES (v_compra, 1, NOW(), NOW())
  ON CONFLICT (numero_controle_compra) DO UPDATE SET lida_em = NOW();
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.gravar_leitura_prazo_tr(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_leitura_prazo_tr(JSONB) TO service_role;

-- 6) Itens que já podem ter a data pela regra (assinatura ou emissão da Ordem), nos contratos que herdam ----------
DO $$
DECLARE v_c RECORD; v_n INTEGER := 0;
BEGIN
  FOR v_c IN SELECT DISTINCT l.contract_key FROM public.arp_item_contract_links l
               JOIN public.fisc_contratos f ON f.contract_key = l.contract_key AND f.prazo_dias IS NULL
               JOIN public.ata_prazo_entrega p ON p.ata_key = public.ata_key_from_item_key(l.item_key) AND p.confirmado_automatico LOOP
    v_n := v_n + public.fisc_aplicar_regra_aos_itens(v_c.contract_key, 'Leitura do TR');
  END LOOP;
  RAISE NOTICE 'Itens com a data pela regra: %', v_n;
END $$;
