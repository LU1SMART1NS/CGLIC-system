-- ==============================================================================
-- Versão: 20261116000313_leitura_do_nome_das_atas_novas.sql
-- Leitura automática do nome do item na ata assinada das atas novas (pedido do usuário em 16/11/2026).
--
-- A carga da migration 312 gravou o nome de 478 dos 480 itens das atas vigentes, conferido pelo usuário. As atas que
-- chegam depois passam a ser lidas pelo servidor (recurso 'nome_item_ata' da função sincronizar-fontes), de 6 em
-- 6 horas, no molde da leitura do TR (migration 303):
-- 1) itens_nome_leituras: uma linha por ata (número de controle do PNCP), com as tentativas (o PDF pode derrubar a
--    função), quando foi lida e o que ficou sem nome (item e motivo). As atas da carga entram já como lidas.
-- 2) atas_para_leitura_do_nome(limite): atas vigentes ainda não lidas, com os itens que não têm nome.
-- 3) registrar_tentativa_leitura_nome(controle) e gravar_nomes_lidos_da_ata(payload): só o servidor. A gravação
--    nunca reescreve um nome que já existe (ON CONFLICT DO NOTHING) e só aceita itens da própria ata.
-- 4) Agendamento no minuto 38 da 1h, 7h, 13h e 19h.
-- O recurso só funciona depois de publicar a função sincronizar-fontes.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.itens_nome_leituras (
  numero_controle_pncp VARCHAR(40) PRIMARY KEY CHECK (numero_controle_pncp ~ '^[0-9]{14}-1-[0-9]{6}/[0-9]{4}-[0-9]{6}$'),
  tentativas           INTEGER     NOT NULL DEFAULT 0,
  ultima_tentativa     TIMESTAMPTZ,
  lida_em              TIMESTAMPTZ,
  -- Por que a ata inteira ficou sem leitura (sem PDF, PDF de outra ata, sem tabela de preços); NULL quando foi lida.
  motivo               VARCHAR(200),
  nomes_gravados       INTEGER     NOT NULL DEFAULT 0,
  -- Itens que ficaram sem nome e o motivo: [{"item_key": "...", "motivo": "..."}].
  sem_nome             JSONB       NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(sem_nome) = 'array')
);
COMMENT ON TABLE public.itens_nome_leituras IS
  'Leitura do nome do item na ata assinada das atas novas, por ata (migration 313): tentativas, quando foi lida e o que ficou sem nome. Só o servidor grava.';
ALTER TABLE public.itens_nome_leituras ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.itens_nome_leituras FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.itens_nome_leituras TO service_role;

-- As atas da carga de 16/11/2026 já foram lidas e conferidas: não voltam para a fila.
INSERT INTO public.itens_nome_leituras (numero_controle_pncp, tentativas, lida_em, motivo, nomes_gravados)
SELECT n.documento_pncp, 0, min(n.lido_em), 'carga de 16/11/2026 (migration 312)', count(*)
  FROM public.itens_nome_na_ata n
 WHERE n.documento_pncp ~ '^[0-9]{14}-1-[0-9]{6}/[0-9]{4}-[0-9]{6}$'
 GROUP BY n.documento_pncp
ON CONFLICT (numero_controle_pncp) DO NOTHING;

-- Atas vigentes não lidas, com os itens ainda sem nome (chave, número no PNCP e preço de hoje, que é só pista).
CREATE OR REPLACE FUNCTION public.atas_para_leitura_do_nome(p_limite INTEGER DEFAULT 40)
RETURNS TABLE (numero_controle_pncp TEXT, numero_ata TEXT, codigo_uasg TEXT, tentativas INTEGER, itens JSONB)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.numero_controle_pncp::TEXT, min(a.numero_ata)::TEXT, min(a.codigo_uasg)::TEXT, COALESCE(max(l.tentativas), 0),
         jsonb_agg(jsonb_build_object('item_key', a.numero_ata || '-' || a.codigo_uasg || '-' || i.numero_item,
                                      'numero_item', i.numero_item, 'valor_unitario', i.valor_unitario)
                   ORDER BY i.numero_item)
    FROM public.atas_registro_preco a
    JOIN public.itens_ata i ON i.ata_id = a.id
    LEFT JOIN public.itens_nome_leituras l ON l.numero_controle_pncp = a.numero_controle_pncp
   WHERE a.numero_controle_pncp ~ '^[0-9]{14}-1-[0-9]{6}/[0-9]{4}-[0-9]{6}$'
     AND (a.data_vigencia_final IS NULL OR a.data_vigencia_final >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE)
     AND NOT EXISTS (SELECT 1 FROM public.itens_nome_na_ata n WHERE n.item_key = a.numero_ata || '-' || a.codigo_uasg || '-' || i.numero_item)
     AND l.lida_em IS NULL
     AND COALESCE(l.tentativas, 0) < 2
     AND (l.ultima_tentativa IS NULL OR l.ultima_tentativa < NOW() - INTERVAL '5 hours')
   GROUP BY a.numero_controle_pncp
   ORDER BY COALESCE(max(l.tentativas), 0), a.numero_controle_pncp DESC
   LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 40), 200));
$$;
REVOKE ALL ON FUNCTION public.atas_para_leitura_do_nome(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atas_para_leitura_do_nome(INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_tentativa_leitura_nome(p_controle TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.itens_nome_leituras AS t (numero_controle_pncp, tentativas, ultima_tentativa)
  VALUES (p_controle, 1, NOW())
  ON CONFLICT (numero_controle_pncp) DO UPDATE SET tentativas = t.tentativas + 1, ultima_tentativa = NOW();
$$;
REVOKE ALL ON FUNCTION public.registrar_tentativa_leitura_nome(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_tentativa_leitura_nome(TEXT) TO service_role;

-- Grava os nomes lidos: só itens da ata deste número de controle, só os que ainda não têm nome.
CREATE OR REPLACE FUNCTION public.gravar_nomes_lidos_da_ata(p_payload JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_controle TEXT := p_payload->>'numero_controle_pncp';
  v_sem_nome JSONB;
  v_n        INTEGER;
BEGIN
  IF v_controle IS NULL OR v_controle !~ '^[0-9]{14}-1-[0-9]{6}/[0-9]{4}-[0-9]{6}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Número de controle inválido.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_payload->'nomes', '[]'::JSONB)) <> 'array' OR jsonb_typeof(COALESCE(p_payload->'sem_nome', '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: nomes e sem_nome devem ser listas.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.itens_nome_na_ata (item_key, nome, lido_de, documento_pncp, lido_em)
  SELECT DISTINCT ON (x.item_key) x.item_key, x.nome, 'TABELA', v_controle, NOW()
    FROM (
      SELECT btrim(e->>'item_key') AS item_key,
             left(btrim(regexp_replace(e->>'nome', '[\x01-\x1f]+', ' ', 'g')), 200) AS nome
        FROM jsonb_array_elements(COALESCE(p_payload->'nomes', '[]'::JSONB)) e
    ) x
   WHERE length(x.nome) >= 3
     AND EXISTS (SELECT 1 FROM public.atas_registro_preco a JOIN public.itens_ata i ON i.ata_id = a.id
                  WHERE a.numero_controle_pncp = v_controle AND a.numero_ata || '-' || a.codigo_uasg || '-' || i.numero_item = x.item_key)
  ON CONFLICT (item_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('item_key', left(e->>'item_key', 100), 'motivo', left(e->>'motivo', 120))), '[]'::JSONB)
    INTO v_sem_nome
    FROM (SELECT e FROM jsonb_array_elements(COALESCE(p_payload->'sem_nome', '[]'::JSONB)) e LIMIT 500) s;

  INSERT INTO public.itens_nome_leituras AS t (numero_controle_pncp, tentativas, ultima_tentativa, lida_em, motivo, nomes_gravados, sem_nome)
  VALUES (v_controle, 1, NOW(), NOW(), left(NULLIF(p_payload->>'motivo', ''), 200), v_n, v_sem_nome)
  ON CONFLICT (numero_controle_pncp) DO UPDATE
    SET lida_em = NOW(), motivo = EXCLUDED.motivo, nomes_gravados = t.nomes_gravados + EXCLUDED.nomes_gravados, sem_nome = EXCLUDED.sem_nome;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.gravar_nomes_lidos_da_ata(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_nomes_lidos_da_ata(JSONB) TO service_role;

-- Agendamento: de 6 em 6 horas, no minuto 38 (livre).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sincronizar-nome-item-ata';
    PERFORM cron.schedule('sincronizar-nome-item-ata', '38 1,7,13,19 * * *', $c$SELECT public.disparar_sincronizacao('nome_item_ata', '000000')$c$);
  END IF;
END $$;
