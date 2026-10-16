-- ------------------------------------------------------------------------------
-- Versão: 20261016000145_ata_identidade_pelo_controle_pncp.sql
-- A identidade de uma ata é o número de controle do PNCP, não o número da ata.
--
-- O Compras.gov.br/PNCP às vezes muda o número da ata (põe um 9 à frente — ex.:
-- "90068/2024" depois corrigido para "00068/2024"), mantendo o mesmo número de
-- controle do PNCP. Como a gravação da ata casava pela chave (numero_ata,
-- codigo_uasg), a correção do número criava uma SEGUNDA linha em vez de atualizar
-- a existente, deixando uma ata órfã duplicada na carteira.
--
-- Esta migration:
--   1) remove as cópias duplicadas (mesmo numero_controle_pncp) que ficaram sem
--      itens, mantendo a linha boa (a com itens / sincronizada mais recente);
--   2) cria uma restrição única por numero_controle_pncp;
--   3) passa a função espelhar_participacao_na_carteira a casar pelo controle PNCP.
-- O gravador principal (src/services/dbCacheService.ts) passa a usar o mesmo
-- onConflict no mesmo PR.
-- ------------------------------------------------------------------------------

-- ------------------------------------------------------------------------------
-- 1) Deduplicação pelo numero_controle_pncp
-- ------------------------------------------------------------------------------
DO $dedup$
DECLARE
  v_perigo    INT;
  v_apagadas  INT;
  v_forn      INT;
BEGIN
  -- Cópias a apagar: para cada numero_controle_pncp repetido, tudo menos a 1ª linha
  -- (a que tem mais itens e foi sincronizada mais recentemente).
  CREATE TEMP TABLE _dup_apagar ON COMMIT DROP AS
    SELECT z.id, z.numero_ata
      FROM (
        SELECT arp.id, arp.numero_ata,
               row_number() OVER (
                 PARTITION BY arp.numero_controle_pncp
                 ORDER BY (SELECT count(*) FROM public.itens_ata i WHERE i.ata_id = arp.id) DESC,
                          arp.ultimo_sync_em DESC NULLS LAST,
                          arp.id
               ) AS rn
          FROM public.atas_registro_preco arp
         WHERE arp.numero_controle_pncp IN (
                 SELECT numero_controle_pncp
                   FROM public.atas_registro_preco
                  WHERE numero_controle_pncp IS NOT NULL
                  GROUP BY numero_controle_pncp
                 HAVING count(*) > 1)
      ) z
     WHERE z.rn > 1;

  -- Trava: uma cópia duplicada COM itens não deve ser apagada automaticamente.
  SELECT count(*) INTO v_perigo
    FROM _dup_apagar d
   WHERE EXISTS (SELECT 1 FROM public.itens_ata i WHERE i.ata_id = d.id);
  IF v_perigo > 0 THEN
    RAISE EXCEPTION 'Deduplicação de atas: % cópia(s) duplicada(s) têm itens — revisar à mão antes de continuar.', v_perigo;
  END IF;

  -- Fornecedores do PNCP órfãos das atas que serão removidas (nenhuma ata mantida com aquele número).
  DELETE FROM public.atas_fornecedor_pncp f
   WHERE f.numero_ata IN (SELECT numero_ata FROM _dup_apagar)
     AND NOT EXISTS (
           SELECT 1 FROM public.atas_registro_preco a
            WHERE a.numero_ata = f.numero_ata
              AND a.id NOT IN (SELECT id FROM _dup_apagar));
  GET DIAGNOSTICS v_forn = ROW_COUNT;

  -- Apaga as cópias duplicadas sem itens (itens_ata tem FK ON DELETE CASCADE, mas aqui não há itens).
  DELETE FROM public.atas_registro_preco WHERE id IN (SELECT id FROM _dup_apagar);
  GET DIAGNOSTICS v_apagadas = ROW_COUNT;

  RAISE NOTICE 'Atas duplicadas apagadas: % (fornecedores PNCP órfãos: %)', v_apagadas, v_forn;
END $dedup$;

-- ------------------------------------------------------------------------------
-- 2) Identidade única pelo número de controle do PNCP
--    (NULLs continuam permitidos e distintos entre si — ata sem controle não trava.)
-- ------------------------------------------------------------------------------
ALTER TABLE public.atas_registro_preco
  DROP CONSTRAINT IF EXISTS uq_ata_controle_pncp;
ALTER TABLE public.atas_registro_preco
  ADD CONSTRAINT uq_ata_controle_pncp UNIQUE (numero_controle_pncp);

-- ------------------------------------------------------------------------------
-- 3) espelhar_participacao_na_carteira casa pelo controle PNCP
--    (muda só o ON CONFLICT e passa a atualizar numero_ata/codigo_uasg; o resto é igual à migration 114)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.espelhar_participacao_na_carteira(p_numero_ata TEXT, p_uasg_gerenciadora TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ref     public.atas_participacao%ROWTYPE;
  v_carteira TEXT;
  v_papel   TEXT;
  v_ata_id  public.atas_registro_preco.id%TYPE;
BEGIN
  IF p_uasg_gerenciadora IN ('200330', '200331') THEN
    RETURN;
  END IF;

  SELECT * INTO v_ref FROM public.atas_participacao
   WHERE numero_ata = p_numero_ata AND uasg_gerenciadora = p_uasg_gerenciadora
   ORDER BY lido_em DESC, uasg_senasp DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT CASE WHEN bool_or(uasg_senasp = '200331') THEN '200331' ELSE min(uasg_senasp) END,
         CASE WHEN bool_or(papel = 'PARTICIPANTE') THEN 'PARTICIPANTE' ELSE 'ADESAO' END
    INTO v_carteira, v_papel
    FROM public.atas_participacao
   WHERE numero_ata = p_numero_ata AND uasg_gerenciadora = p_uasg_gerenciadora;

  INSERT INTO public.atas_registro_preco AS a (
    numero_ata, codigo_uasg, nome_uasg, ano_compra, numero_compra, modalidade, objeto, valor_total,
    data_vigencia_inicial, data_vigencia_final, status_ata, numero_controle_pncp, data_hora_atualizacao_api,
    ultimo_sync_em, uasg_carteira, papel_senasp
  ) VALUES (
    v_ref.numero_ata, v_ref.uasg_gerenciadora, v_ref.nome_gerenciadora, v_ref.ano_compra, v_ref.numero_compra,
    v_ref.modalidade, v_ref.objeto, 0,
    v_ref.data_vigencia_inicial, v_ref.data_vigencia_final, v_ref.status_ata, v_ref.numero_controle_pncp, v_ref.lido_em,
    NOW(), v_carteira, v_papel
  )
  ON CONFLICT (numero_controle_pncp) DO UPDATE
    SET numero_ata = EXCLUDED.numero_ata,
        codigo_uasg = EXCLUDED.codigo_uasg,
        nome_uasg = EXCLUDED.nome_uasg,
        ano_compra = EXCLUDED.ano_compra,
        numero_compra = EXCLUDED.numero_compra,
        modalidade = EXCLUDED.modalidade,
        objeto = EXCLUDED.objeto,
        data_vigencia_inicial = EXCLUDED.data_vigencia_inicial,
        data_vigencia_final = EXCLUDED.data_vigencia_final,
        status_ata = EXCLUDED.status_ata,
        data_hora_atualizacao_api = EXCLUDED.data_hora_atualizacao_api,
        ultimo_sync_em = EXCLUDED.ultimo_sync_em,
        uasg_carteira = EXCLUDED.uasg_carteira,
        papel_senasp = EXCLUDED.papel_senasp
  RETURNING a.id INTO v_ata_id;

  INSERT INTO public.itens_ata AS i (
    ata_id, numero_item, descricao_item, fornecedor_cnpj_cpf, fornecedor_razao_social, quantidade_homologada,
    valor_unitario, valor_total, maximo_adesao, ultimo_sync_em, quantidade_senasp, quantidade_senasp_lida_em
  )
  SELECT v_ata_id, x.numero_item, x.descricao, x.cnpj, x.razao, x.homologada, x.vu, x.homologada * x.vu, x.maximo,
         NOW(), x.senasp, NOW()
    FROM (
      SELECT ip.numero_item,
             max(ip.descricao) AS descricao,
             max(ip.fornecedor_cnpj_cpf) AS cnpj,
             max(ip.fornecedor_razao_social) AS razao,
             COALESCE(max(ip.quantidade_homologada), 0) AS homologada,
             COALESCE(max(ip.valor_unitario), 0) AS vu,
             max(ip.maximo_adesao) AS maximo,
             -- Adesão: soma das adesões aprovadas da SENASP; a que vier sem quantidade da fonte usa a informada à
             -- mão (migration 114) e, sem nenhuma das duas, conta 0, nunca o total da ata.
             COALESCE(sum(CASE WHEN ip.papel = 'ADESAO'
                               THEN COALESCE(public.quantidade_senasp_da_adesao(
                                      p_numero_ata || '-' || p_uasg_gerenciadora || '-' || lpad(ip.numero_item::TEXT, 5, '0'),
                                      ip.adesoes), ip.quantidade_senasp)
                               ELSE ip.quantidade_senasp END), 0) AS senasp
        FROM public.itens_ata_participacao ip
        JOIN public.atas_participacao ap ON ap.id = ip.participacao_id
       WHERE ap.numero_ata = p_numero_ata AND ap.uasg_gerenciadora = p_uasg_gerenciadora
       GROUP BY ip.numero_item
    ) x
  ON CONFLICT (ata_id, numero_item) DO UPDATE
    SET descricao_item = EXCLUDED.descricao_item,
        fornecedor_cnpj_cpf = EXCLUDED.fornecedor_cnpj_cpf,
        fornecedor_razao_social = EXCLUDED.fornecedor_razao_social,
        quantidade_homologada = EXCLUDED.quantidade_homologada,
        valor_unitario = EXCLUDED.valor_unitario,
        valor_total = EXCLUDED.valor_total,
        maximo_adesao = EXCLUDED.maximo_adesao,
        ultimo_sync_em = EXCLUDED.ultimo_sync_em,
        quantidade_senasp = EXCLUDED.quantidade_senasp,
        quantidade_senasp_lida_em = EXCLUDED.quantidade_senasp_lida_em;

  -- Valor da ata para a SENASP (o registrado ou aprovado de cada item × preço).
  UPDATE public.atas_registro_preco a
     SET valor_total = COALESCE((SELECT sum(COALESCE(i.quantidade_senasp, 0) * i.valor_unitario)
                                   FROM public.itens_ata i WHERE i.ata_id = v_ata_id), 0)
   WHERE a.id = v_ata_id;
END;
$$;
REVOKE ALL ON FUNCTION public.espelhar_participacao_na_carteira(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.espelhar_participacao_na_carteira(TEXT, TEXT) TO service_role;
