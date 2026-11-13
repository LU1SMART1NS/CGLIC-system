-- =============================================================================
-- Ata sem divisão entre as unidades internas, reservas de programas e remanejamento com SEI
-- (aprovado por protótipo em 13/11/2026).
--
-- Três camadas: quantitativo SENASP → unidades internas (alocação) → programas (reserva na área responsável).
--  1) ata_divisao_unidades: a ata assinada divide (DIVIDE) ou não (NAO_DIVIDE) o quantitativo SENASP entre as
--     unidades; sem linha = "a conferir" (a tela cobra a alocação como antes). Carga: as 142 atas vigentes da
--     CGLIC, pela leitura dos PDFs de 12/11/2026 (16 dividem). Marcam o coordenador e o gestor de saldo.
--  2) ata_item_divisao_assinada: a divisão por unidade que a ata assinada traz (para mostrar "difere da ata").
--  3) arp_item_reservas_programa: reserva de um programa (fisc_programas) dentro da cota da área responsável.
--     O ComprasSUSP não tem reserva digitada: na CAEP, o que não é contratado nem reserva de outro programa é
--     "emendas sem pedido", o limite dos pedidos de parlamentares.
--  4) contrato_item_divisao_unidades.programa_id: contrato ligado a um programa conta em Contratado e sai da
--     parte "sem contrato" da reserva.
--  5) arp_item_remanejamentos_unidades + remanejar_entre_unidades: passa quantidade de uma unidade a outra com o
--     nº SEI da autorização da unidade interna; a de origem só cede até o mínimo.
--  6) Travas (adiadas, no fim da transação): a cota da unidade não fica abaixo das reservas dos programas dela
--     (+ o reservado a parlamentares, na CAEP); a reserva não fica abaixo do contratado ligado ao programa.
--  7) Programas: a origem do recurso deixa de ser exigida (sai das telas); ComprasSUSP cadastrado (área CAEP).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Divisão na ata
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ata_divisao_unidades (
  ata_id           UUID        PRIMARY KEY REFERENCES public.atas_registro_preco(id) ON DELETE CASCADE,
  situacao         VARCHAR(12) NOT NULL CHECK (situacao IN ('DIVIDE', 'NAO_DIVIDE')),
  fonte            VARCHAR(8)  NOT NULL DEFAULT 'PESSOA' CHECK (fonte IN ('PDF', 'PESSOA')),
  marcado_por      UUID,
  marcado_por_nome TEXT,
  marcado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.ata_divisao_unidades IS
  'Se a ata assinada divide o quantitativo SENASP entre as unidades internas. Sem linha = a conferir. NAO_DIVIDE: alocar é opcional e o item sem unidade não é pendência.';
ALTER TABLE public.ata_divisao_unidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ata_divisao_unidades_leitura ON public.ata_divisao_unidades;
CREATE POLICY ata_divisao_unidades_leitura ON public.ata_divisao_unidades FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.ata_divisao_unidades FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ata_divisao_unidades TO authenticated;
GRANT ALL ON public.ata_divisao_unidades TO service_role;

CREATE TABLE IF NOT EXISTS public.ata_item_divisao_assinada (
  item_key   VARCHAR(100) NOT NULL,
  unit_name  VARCHAR(50)  NOT NULL REFERENCES public.internal_departments(sigla) ON UPDATE CASCADE,
  quantidade NUMERIC(18, 4) NOT NULL CHECK (quantidade > 0),
  PRIMARY KEY (item_key, unit_name)
);
COMMENT ON TABLE public.ata_item_divisao_assinada IS
  'Divisão por unidade interna que a ata assinada traz (leitura do PDF): a tela mostra "difere da ata" quando a alocação muda por remanejamento.';
ALTER TABLE public.ata_item_divisao_assinada ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ata_item_divisao_assinada_leitura ON public.ata_item_divisao_assinada;
CREATE POLICY ata_item_divisao_assinada_leitura ON public.ata_item_divisao_assinada FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.ata_item_divisao_assinada FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ata_item_divisao_assinada TO authenticated;
GRANT ALL ON public.ata_item_divisao_assinada TO service_role;

-- Carga: divisão das 16 atas que dividem (PDF de 12/11/2026; a 00052/2024 traz só os totais por unidade e
-- ficou como foi alocada em 12/11/2026, que bate com esses totais).
INSERT INTO public.ata_item_divisao_assinada (item_key, unit_name, quantidade)
SELECT v.item_key, v.unit_name, v.quantidade
  FROM (VALUES
  ('00002/2026-200331-00001', 'DFNSP', 6),
  ('00002/2026-200331-00001', 'DIOPI', 27),
  ('00006/2026-200331-00004', 'DFNSP', 15),
  ('00031/2025-200331-00001', 'CAEP', 3850),
  ('00031/2025-200331-00001', 'COLOG', 1742),
  ('00031/2025-200331-00001', 'DFNSP', 5000),
  ('00031/2025-200331-00002', 'CAEP', 3849),
  ('00042/2026-200331-00001', 'CAEP', 540),
  ('00042/2026-200331-00001', 'COLOG', 837),
  ('00042/2026-200331-00002', 'CAEP', 540),
  ('00042/2026-200331-00002', 'COLOG', 655),
  ('00042/2026-200331-00002', 'DFNSP', 1000),
  ('00043/2026-200331-00003', 'CAEP', 540),
  ('00043/2026-200331-00003', 'DFNSP', 1000),
  ('00044/2026-200331-00001', 'CAEP', 864),
  ('00044/2026-200331-00001', 'DFNSP', 15),
  ('00044/2026-200331-00001', 'DIOPI', 54),
  ('00044/2026-200331-00001', 'DSUSP', 963),
  ('00044/2026-200331-00002', 'DFNSP', 13),
  ('00044/2026-200331-00002', 'DIOPI', 56),
  ('00047/2024-200331-00006', 'DFNSP', 50000),
  ('00047/2024-200331-00018', 'DFNSP', 150000),
  ('00047/2024-200331-00018', 'DIOPI', 64000),
  ('00047/2024-200331-00027', 'DFNSP', 200000),
  ('00047/2024-200331-00062', 'DFNSP', 500000),
  ('00047/2024-200331-00062', 'DIOPI', 40000),
  ('00047/2024-200331-00074', 'DFNSP', 200000),
  ('00047/2024-200331-00074', 'DIOPI', 20000),
  ('00047/2024-200331-00087', 'DFNSP', 50000),
  ('00047/2024-200331-00100', 'DFNSP', 50000),
  ('00051/2024-200331-00001', 'CAEP', 4260),
  ('00051/2024-200331-00001', 'DFNSP', 400),
  ('00051/2024-200331-00001', 'DSUSP', 22736),
  ('00051/2024-200331-00002', 'CAEP', 53520),
  ('00051/2024-200331-00002', 'DFNSP', 2400),
  ('00051/2024-200331-00002', 'DSUSP', 227360),
  ('00051/2024-200331-00003', 'CAEP', 4260),
  ('00051/2024-200331-00003', 'DFNSP', 400),
  ('00051/2024-200331-00003', 'DSUSP', 22736),
  ('00051/2024-200331-00004', 'CAEP', 4260),
  ('00051/2024-200331-00004', 'DFNSP', 400),
  ('00051/2024-200331-00004', 'DSUSP', 22736),
  ('00051/2024-200331-00006', 'CAEP', 4260),
  ('00051/2024-200331-00006', 'DFNSP', 400),
  ('00051/2024-200331-00006', 'DSUSP', 22736),
  ('00051/2024-200331-00007', 'CAEP', 4260),
  ('00051/2024-200331-00007', 'DFNSP', 400),
  ('00051/2024-200331-00007', 'DSUSP', 22736),
  ('00051/2024-200331-00008', 'CAEP', 4260),
  ('00051/2024-200331-00008', 'DFNSP', 400),
  ('00051/2024-200331-00008', 'DSUSP', 22736),
  ('00051/2024-200331-00009', 'CAEP', 4260),
  ('00051/2024-200331-00009', 'DFNSP', 400),
  ('00051/2024-200331-00009', 'DSUSP', 22736),
  ('00053/2024-200331-00010', 'DSUSP', 8800),
  ('00053/2024-200331-00011', 'DSUSP', 249680),
  ('00060/2025-200331-00002', 'CAEP', 540),
  ('00060/2025-200331-00002', 'COLOG', 590),
  ('00062/2025-200331-00003', 'CAEP', 540),
  ('00062/2025-200331-00003', 'COLOG', 467),
  ('00063/2025-200331-00005', 'CAEP', 540),
  ('00063/2025-200331-00005', 'COLOG', 631),
  ('00064/2025-200331-00006', 'COLOG', 914),
  ('00069/2025-200331-00001', 'DFNSP', 10000),
  ('00069/2025-200331-00002', 'DFNSP', 15000),
  ('00069/2025-200331-00003', 'DFNSP', 10000),
  ('00069/2025-200331-00004', 'DFNSP', 15000),
  ('00069/2025-200331-00005', 'DFNSP', 350),
  ('00069/2025-200331-00006', 'DFNSP', 350),
  ('00077/2025-200331-00001', 'DIOPI', 30),
  ('00052/2024-200331-00001', 'DFNSP', 500),
  ('00052/2024-200331-00002', 'DGFNSP', 4048),
  ('00052/2024-200331-00003', 'DGFNSP', 1080),
  ('00052/2024-200331-00004', 'DFNSP', 100),
  ('00052/2024-200331-00005', 'DFNSP', 600),
  ('00052/2024-200331-00006', 'DFNSP', 1500),
  ('00052/2024-200331-00007', 'DFNSP', 6400),
  ('00052/2024-200331-00008', 'DFNSP', 50000),
  ('00052/2024-200331-00009', 'DFNSP', 10000)
  ) AS v(item_key, unit_name, quantidade)
ON CONFLICT (item_key, unit_name) DO NOTHING;

-- Carga da marcação: as atas vigentes da CGLIC (UASGs 200330/200331); dividem as 16 acima, as demais não.
INSERT INTO public.ata_divisao_unidades (ata_id, situacao, fonte, marcado_por_nome, marcado_em)
SELECT a.id,
       CASE WHEN EXISTS (SELECT 1 FROM public.ata_item_divisao_assinada d
                          WHERE split_part(d.item_key, '-', 1) = a.numero_ata AND split_part(d.item_key, '-', 2) = a.codigo_uasg)
            THEN 'DIVIDE' ELSE 'NAO_DIVIDE' END,
       'PDF', 'Leitura do PDF da ata assinada', TIMESTAMPTZ '2026-11-12 18:00:00-03'
  FROM public.atas_registro_preco a
 WHERE a.codigo_uasg IN ('200330', '200331')
   AND COALESCE(a.data_vigencia_final, CURRENT_DATE) >= CURRENT_DATE
ON CONFLICT (ata_id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_audit_ata_divisao_unidades ON public.ata_divisao_unidades;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    EXECUTE 'CREATE TRIGGER trg_audit_ata_divisao_unidades AFTER INSERT OR UPDATE OR DELETE ON public.ata_divisao_unidades
             FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture()';
  END IF;
END $$;

-- Marca (DIVIDE / NAO_DIVIDE) ou volta a "a conferir" (NULL).
CREATE OR REPLACE FUNCTION public.marcar_divisao_da_ata(p_numero_ata TEXT, p_codigo_uasg TEXT, p_situacao TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_ata UUID;
BEGIN
  IF NOT public.has_permission('allocations.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador e o gestor de saldo marcam a divisão da ata.' USING ERRCODE = '42501';
  END IF;
  IF p_situacao IS NOT NULL AND p_situacao NOT IN ('DIVIDE', 'NAO_DIVIDE') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Situação inválida.' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_ata FROM public.atas_registro_preco WHERE numero_ata = p_numero_ata AND codigo_uasg = p_codigo_uasg;
  IF v_ata IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Ata % (UASG %) não encontrada.', p_numero_ata, p_codigo_uasg USING ERRCODE = 'P0002';
  END IF;
  IF p_situacao IS NULL THEN
    DELETE FROM public.ata_divisao_unidades WHERE ata_id = v_ata;
  ELSE
    INSERT INTO public.ata_divisao_unidades (ata_id, situacao, fonte, marcado_por, marcado_por_nome, marcado_em)
    VALUES (v_ata, p_situacao, 'PESSOA', auth.uid(), left(public.nome_do_usuario_logado(), 200), NOW())
    ON CONFLICT (ata_id) DO UPDATE
      SET situacao = EXCLUDED.situacao, fonte = 'PESSOA', marcado_por = EXCLUDED.marcado_por,
          marcado_por_nome = EXCLUDED.marcado_por_nome, marcado_em = NOW();
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_divisao_da_ata(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_divisao_da_ata(TEXT, TEXT, TEXT) TO authenticated;

-- A ata do item não divide? (item_key = numero-uasg-item)
CREATE OR REPLACE FUNCTION public.item_sem_divisao_na_ata(p_item_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ata_divisao_unidades d
      JOIN public.atas_registro_preco a ON a.id = d.ata_id
     WHERE a.numero_ata = split_part(p_item_key, '-', 1) AND a.codigo_uasg = split_part(p_item_key, '-', 2)
       AND d.situacao = 'NAO_DIVIDE');
$$;
REVOKE ALL ON FUNCTION public.item_sem_divisao_na_ata(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.item_sem_divisao_na_ata(TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) Programas: origem do recurso opcional; ComprasSUSP (área CAEP)
-- -----------------------------------------------------------------------------
-- Mesma assinatura; a origem do recurso passa a ser opcional (saiu das telas).
CREATE OR REPLACE FUNCTION public.salvar_fisc_programa(p_id UUID, p_nome TEXT, p_unidade TEXT, p_origem TEXT DEFAULT NULL, p_ativo BOOLEAN DEFAULT TRUE)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome TEXT := left(public.nome_do_usuario_logado(), 200);
  v_id   UUID;
BEGIN
  IF NOT public.has_permission('fiscalizacao.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador e o gestor de fiscalização cadastram programas.' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_nome, ''))) < 3 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o nome do programa (pelo menos 3 letras).' USING ERRCODE = '22023';
  END IF;
  IF p_unidade IS NULL OR NOT EXISTS (SELECT 1 FROM public.internal_departments WHERE id = p_unidade) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha a área responsável entre as unidades internas.' USING ERRCODE = '22023';
  END IF;
  IF p_origem IS NOT NULL AND p_origem NOT IN ('EMENDA', 'FNSP', 'FUNDO', 'OUTRO') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Origem do recurso inválida.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fisc_programas WHERE lower(btrim(nome)) = lower(btrim(p_nome)) AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'CONFLICT: Já existe um programa com esse nome.' USING ERRCODE = '23505';
  END IF;
  -- Área do programa não muda se ele já tem reserva na Alocação (a reserva fica na cota da área).
  IF p_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.fisc_programas WHERE id = p_id AND unidade_id IS DISTINCT FROM p_unidade)
     AND EXISTS (SELECT 1 FROM public.arp_item_reservas_programa WHERE programa_id = p_id) THEN
    RAISE EXCEPTION 'CONFLICT: O programa tem reservas na Alocação: para trocar a área, retire as reservas antes.' USING ERRCODE = '23514';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.fisc_programas (nome, unidade_id, origem_recurso, ativo, criado_por, criado_por_nome, atualizado_por_nome)
    VALUES (btrim(p_nome), p_unidade, p_origem, COALESCE(p_ativo, TRUE), auth.uid(), v_nome, v_nome)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.fisc_programas
       SET nome = btrim(p_nome), unidade_id = p_unidade, origem_recurso = COALESCE(p_origem, origem_recurso),
           ativo = COALESCE(p_ativo, ativo), atualizado_por_nome = v_nome, atualizado_em = NOW()
     WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'NOT_FOUND: Programa não encontrado.' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN v_id;
END;
$$;

-- ComprasSUSP: programa das emendas parlamentares (área CAEP). Id fixo para as regras da Alocação.
INSERT INTO public.fisc_programas (id, nome, unidade_id, origem_recurso, ativo, criado_por_nome, atualizado_por_nome)
SELECT '00000000-0000-4000-8000-0000000c5000'::UUID, 'ComprasSUSP', d.id, NULL, TRUE, 'Cadastro inicial', 'Cadastro inicial'
  FROM public.internal_departments d
 WHERE d.sigla = 'CAEP'
   AND NOT EXISTS (SELECT 1 FROM public.fisc_programas WHERE lower(btrim(nome)) = 'comprassusp')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.programa_das_emendas()
RETURNS UUID
LANGUAGE sql
IMMUTABLE
AS $$ SELECT '00000000-0000-4000-8000-0000000c5000'::UUID $$;
GRANT EXECUTE ON FUNCTION public.programa_das_emendas() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) Reservas de programas e contrato ligado a programa
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.arp_item_reservas_programa (
  item_key            VARCHAR(100)   NOT NULL,
  programa_id         UUID           NOT NULL REFERENCES public.fisc_programas(id),
  quantidade          NUMERIC(18, 4) NOT NULL CHECK (quantidade > 0),
  atualizado_por      UUID,
  atualizado_por_nome TEXT,
  atualizado_em       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_key, programa_id),
  CONSTRAINT arp_item_reservas_programa_sem_comprassusp CHECK (programa_id <> '00000000-0000-4000-8000-0000000c5000'::UUID)
);
COMMENT ON TABLE public.arp_item_reservas_programa IS
  'Reserva de um programa num item, dentro da cota da área responsável do programa. O ComprasSUSP não tem reserva digitada (emendas sem pedido = o resto da CAEP).';
CREATE INDEX IF NOT EXISTS arp_item_reservas_programa_programa ON public.arp_item_reservas_programa (programa_id);
ALTER TABLE public.arp_item_reservas_programa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS arp_item_reservas_programa_leitura ON public.arp_item_reservas_programa;
CREATE POLICY arp_item_reservas_programa_leitura ON public.arp_item_reservas_programa FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.arp_item_reservas_programa FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.arp_item_reservas_programa TO authenticated;
GRANT ALL ON public.arp_item_reservas_programa TO service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_arp_item_reservas_programa ON public.arp_item_reservas_programa';
    EXECUTE 'CREATE TRIGGER trg_audit_arp_item_reservas_programa AFTER INSERT OR UPDATE OR DELETE ON public.arp_item_reservas_programa
             FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture()';
  END IF;
END $$;

ALTER TABLE public.contrato_item_divisao_unidades
  ADD COLUMN IF NOT EXISTS programa_id UUID REFERENCES public.fisc_programas(id);
COMMENT ON COLUMN public.contrato_item_divisao_unidades.programa_id IS
  'Programa do contrato nesta unidade (opcional): conta em Contratado do programa e sai da parte sem contrato da reserva.';

-- Sigla da área responsável de um programa.
CREATE OR REPLACE FUNCTION public.area_do_programa(p_programa UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT d.sigla FROM public.fisc_programas p JOIN public.internal_departments d ON d.id = p.unidade_id WHERE p.id = p_programa $$;
REVOKE ALL ON FUNCTION public.area_do_programa(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.area_do_programa(UUID) TO authenticated, service_role;

-- Por item e unidade: alocado, contratado (total, em programas, fora deles), reservado a programas,
-- reservado a parlamentares (CAEP), mínimo e livre (na CAEP, livre = emendas sem pedido).
CREATE OR REPLACE FUNCTION public.situacao_da_unidade_no_item(p_item_key TEXT, p_unit TEXT)
RETURNS TABLE (alocado NUMERIC, contratado NUMERIC, contratado_programas NUMERIC, reservado_programas NUMERIC, reservado_emendas NUMERIC, minimo NUMERIC, livre NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_aloc NUMERIC; v_ctr NUMERIC; v_ctr_prog NUMERIC; v_res NUMERIC; v_emd NUMERIC := 0; v_min NUMERIC;
BEGIN
  SELECT COALESCE(SUM(allocated_qty), 0) INTO v_aloc FROM public.arp_allocations WHERE item_key = p_item_key AND unit_name = p_unit;
  SELECT COALESCE(SUM(quantidade), 0), COALESCE(SUM(quantidade) FILTER (WHERE programa_id IS NOT NULL), 0)
    INTO v_ctr, v_ctr_prog
    FROM public.contrato_item_divisao_unidades WHERE item_key = p_item_key AND unit_name = p_unit;
  SELECT COALESCE(SUM(r.quantidade), 0) INTO v_res
    FROM public.arp_item_reservas_programa r WHERE r.item_key = p_item_key AND public.area_do_programa(r.programa_id) = p_unit;
  IF p_unit = public.unidade_das_emendas() THEN
    v_emd := public.emendas_reservado_do_item(p_item_key);
  END IF;
  -- Contratos das emendas estão dentro do reservado a parlamentares; os de programa, dentro da reserva do programa.
  v_min := v_res + v_emd + GREATEST(0, v_ctr - v_ctr_prog - v_emd);
  RETURN QUERY SELECT v_aloc, v_ctr, v_ctr_prog, v_res, v_emd, v_min, v_aloc - v_min;
END;
$$;
REVOKE ALL ON FUNCTION public.situacao_da_unidade_no_item(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.situacao_da_unidade_no_item(TEXT, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) Travas adiadas
-- -----------------------------------------------------------------------------
-- A cota da unidade cobre as reservas dos programas dela (+ o reservado a parlamentares, na CAEP).
CREATE OR REPLACE FUNCTION public.conferir_reservas_da_unidade(p_item_key TEXT, p_unit TEXT, p_origem TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_aloc NUMERIC; v_res NUMERIC; v_emd NUMERIC := 0;
BEGIN
  IF p_unit IS NULL THEN RETURN; END IF;
  SELECT COALESCE(SUM(r.quantidade), 0) INTO v_res
    FROM public.arp_item_reservas_programa r WHERE r.item_key = p_item_key AND public.area_do_programa(r.programa_id) = p_unit;
  IF p_unit = public.unidade_das_emendas() THEN v_emd := public.emendas_reservado_do_item(p_item_key); END IF;
  IF v_res + v_emd = 0 THEN RETURN; END IF;
  SELECT COALESCE(SUM(allocated_qty), 0) INTO v_aloc FROM public.arp_allocations WHERE item_key = p_item_key AND unit_name = p_unit;
  IF v_res + v_emd > v_aloc THEN
    IF p_origem = 'PEDIDO' THEN
      RAISE EXCEPTION 'SALDO_INSUFICIENTE: O item % ficaria com % reservados a parlamentares, mas as emendas sem pedido da % só comportam %. Diminua a quantidade ou peça mais alocação ao gestor de saldo.',
        p_item_key, trim_scale(v_emd), p_unit, trim_scale(GREATEST(0, v_aloc - v_res)) USING ERRCODE = '23514';
    ELSIF p_unit = public.unidade_das_emendas() AND v_emd > 0 THEN
      RAISE EXCEPTION 'EMENDAS_RESERVADAS: A % não pode ficar com menos de %: % reservados a parlamentares no menu Emendas e % a programas.',
        p_unit, trim_scale(v_res + v_emd), trim_scale(v_emd), trim_scale(v_res) USING ERRCODE = '23514';
    ELSE
      RAISE EXCEPTION 'RESERVAS_DE_PROGRAMAS: A % não pode ficar com menos de %: essa quantidade está reservada a programas da unidade.',
        p_unit, trim_scale(v_res) USING ERRCODE = '23514';
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.conferir_reservas_da_unidade(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- A trava das emendas passa a contar também as reservas dos programas da CAEP (pedido só usa as emendas sem pedido).
CREATE OR REPLACE FUNCTION public.emendas_conferir_saldo_do_item(p_item_key TEXT, p_origem TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.conferir_reservas_da_unidade(p_item_key, public.unidade_das_emendas(), p_origem);
END;
$$;
REVOKE ALL ON FUNCTION public.emendas_conferir_saldo_do_item(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Alocação de qualquer unidade (a da CAEP continua no trg_emendas_trava_alocacao, que agora conta os programas).
CREATE OR REPLACE FUNCTION public.trg_reservas_trava_alocacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_item TEXT := COALESCE(OLD.item_key, NEW.item_key);
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.unit_name <> public.unidade_das_emendas() THEN
    PERFORM public.conferir_reservas_da_unidade(v_item, OLD.unit_name, 'ALOCACAO');
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.unit_name <> public.unidade_das_emendas() THEN
    PERFORM public.conferir_reservas_da_unidade(v_item, NEW.unit_name, 'ALOCACAO');
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_reservas_trava_alocacao ON public.arp_allocations;
CREATE CONSTRAINT TRIGGER trg_reservas_trava_alocacao
  AFTER INSERT OR UPDATE OR DELETE ON public.arp_allocations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_reservas_trava_alocacao();

-- Reserva: cabe na cota da área e não fica abaixo do contratado ligado ao programa.
CREATE OR REPLACE FUNCTION public.trg_reservas_trava_reserva()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_item TEXT := COALESCE(NEW.item_key, OLD.item_key); v_prog UUID := COALESCE(NEW.programa_id, OLD.programa_id); v_ctr NUMERIC; v_res NUMERIC;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.conferir_reservas_da_unidade(v_item, public.area_do_programa(v_prog), 'RESERVA');
  END IF;
  SELECT COALESCE(SUM(quantidade), 0) INTO v_ctr FROM public.contrato_item_divisao_unidades WHERE item_key = v_item AND programa_id = v_prog;
  SELECT COALESCE(SUM(quantidade), 0) INTO v_res FROM public.arp_item_reservas_programa WHERE item_key = v_item AND programa_id = v_prog;
  IF v_ctr > v_res THEN
    RAISE EXCEPTION 'RESERVA_ABAIXO_DO_CONTRATADO: A reserva do programa não pode ficar abaixo do já contratado para ele neste item (%).', trim_scale(v_ctr) USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_reservas_trava_reserva ON public.arp_item_reservas_programa;
CREATE CONSTRAINT TRIGGER trg_reservas_trava_reserva
  AFTER INSERT OR UPDATE OR DELETE ON public.arp_item_reservas_programa
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_reservas_trava_reserva();

-- Contrato ligado a programa: o programa é da unidade da divisão e a reserva comporta o contratado.
CREATE OR REPLACE FUNCTION public.trg_divisao_programa_trava()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_ctr NUMERIC; v_res NUMERIC;
BEGIN
  IF NEW.programa_id IS NULL THEN RETURN NULL; END IF;
  IF NEW.programa_id = public.programa_das_emendas() THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Contrato de emenda se liga ao pedido no menu Emendas, não ao ComprasSUSP aqui.' USING ERRCODE = '22023';
  END IF;
  IF public.area_do_programa(NEW.programa_id) IS DISTINCT FROM NEW.unit_name THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O programa é de outra área responsável (%).', public.area_do_programa(NEW.programa_id) USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(SUM(quantidade), 0) INTO v_ctr FROM public.contrato_item_divisao_unidades WHERE item_key = NEW.item_key AND programa_id = NEW.programa_id;
  SELECT COALESCE(SUM(quantidade), 0) INTO v_res FROM public.arp_item_reservas_programa WHERE item_key = NEW.item_key AND programa_id = NEW.programa_id;
  IF v_ctr > v_res THEN
    RAISE EXCEPTION 'RESERVA_INSUFICIENTE: Os contratos ligados ao programa neste item (%) passam da reserva dele (%). Aumente a reserva na Alocação antes.', trim_scale(v_ctr), trim_scale(v_res) USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_divisao_programa_trava ON public.contrato_item_divisao_unidades;
CREATE CONSTRAINT TRIGGER trg_divisao_programa_trava
  AFTER INSERT OR UPDATE ON public.contrato_item_divisao_unidades
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_divisao_programa_trava();

-- -----------------------------------------------------------------------------
-- 5) RPCs: reservar para programa, ligar contrato a programa, remanejar com SEI
-- -----------------------------------------------------------------------------
-- Trava e versão do item (as mesmas do save_allocations_atomic).
CREATE OR REPLACE FUNCTION public.travar_versao_do_item(p_item_key TEXT, p_expected_version INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_ver INTEGER;
BEGIN
  INSERT INTO public.item_allocation_state (item_key, version) VALUES (p_item_key, 1) ON CONFLICT (item_key) DO NOTHING;
  SELECT version INTO v_ver FROM public.item_allocation_state WHERE item_key = p_item_key FOR UPDATE;
  IF p_expected_version IS NOT NULL AND p_expected_version <> v_ver THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION_ERROR: O item foi alterado por outra pessoa. Feche e abra de novo.' USING ERRCODE = '40001';
  END IF;
  UPDATE public.item_allocation_state SET version = v_ver + 1, updated_at = NOW() WHERE item_key = p_item_key;
  RETURN v_ver + 1;
END;
$$;
REVOKE ALL ON FUNCTION public.travar_versao_do_item(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;

-- Define a reserva do programa no item (0 retira). Na ata sem divisão, se a área não tiver cota livre, a cota
-- dela cresce com o que falta (do livre da SENASP). Na ata que divide, precisa caber no livre da área.
CREATE OR REPLACE FUNCTION public.reservar_para_programa(p_item_key TEXT, p_programa UUID, p_quantidade NUMERIC, p_expected_version INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_area TEXT; v_ant NUMERIC; v_livre NUMERIC; v_falta NUMERIC; v_base NUMERIC; v_soma NUMERIC; v_ver INTEGER;
  v_user UUID := auth.uid(); v_nome TEXT := left(public.nome_do_usuario_logado(), 200);
BEGIN
  IF NOT public.has_permission('allocations.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador e o gestor de saldo reservam para programas.' USING ERRCODE = '42501';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade < 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Quantidade inválida.' USING ERRCODE = '22023';
  END IF;
  IF p_programa = public.programa_das_emendas() THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O ComprasSUSP não tem reserva própria: aloque à CAEP (vira emendas sem pedido).' USING ERRCODE = '22023';
  END IF;
  v_area := public.area_do_programa(p_programa);
  IF v_area IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Programa não encontrado ou sem área responsável.' USING ERRCODE = 'P0002';
  END IF;
  IF p_quantidade > 0 AND NOT EXISTS (SELECT 1 FROM public.fisc_programas WHERE id = p_programa AND ativo) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Programa inativo.' USING ERRCODE = '22023';
  END IF;
  v_ver := public.travar_versao_do_item(p_item_key, p_expected_version);

  SELECT COALESCE(SUM(quantidade), 0) INTO v_ant FROM public.arp_item_reservas_programa WHERE item_key = p_item_key AND programa_id = p_programa;
  SELECT s.livre INTO v_livre FROM public.situacao_da_unidade_no_item(p_item_key, v_area) s;
  v_falta := (p_quantidade - v_ant) - v_livre;

  IF v_falta > 0 THEN
    IF NOT public.item_sem_divisao_na_ata(p_item_key) THEN
      RAISE EXCEPTION 'NAO_CABE: A % tem % livres neste item. Para reservar mais, remaneje para a % (com SEI) ou aloque do livre da SENASP.',
        v_area, trim_scale(GREATEST(v_livre, 0)), v_area USING ERRCODE = '23514';
    END IF;
    -- Ata sem divisão: a cota da área cresce com o que falta, dentro do quantitativo SENASP.
    SELECT s.quantidade_base_senasp INTO v_base FROM public.v_arp_item_saldo_detalhado s WHERE s.item_key = p_item_key;
    SELECT COALESCE(SUM(allocated_qty), 0) INTO v_soma FROM public.arp_allocations WHERE item_key = p_item_key;
    IF v_base IS NOT NULL AND v_soma + v_falta > v_base THEN
      RAISE EXCEPTION 'ACIMA_DA_COTA: Não há livre da SENASP suficiente (% livres).', trim_scale(GREATEST(v_base - v_soma, 0)) USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.arp_allocations (id, item_key, unit_name, allocated_qty, empenhada_qty)
    VALUES ('alloc_' || p_item_key || '_' || v_area || '_' || gen_random_uuid()::TEXT, p_item_key, v_area, v_falta, 0)
    ON CONFLICT (item_key, unit_name) DO UPDATE SET allocated_qty = public.arp_allocations.allocated_qty + EXCLUDED.allocated_qty;
  END IF;

  IF p_quantidade = 0 THEN
    DELETE FROM public.arp_item_reservas_programa WHERE item_key = p_item_key AND programa_id = p_programa;
  ELSE
    INSERT INTO public.arp_item_reservas_programa (item_key, programa_id, quantidade, atualizado_por, atualizado_por_nome, atualizado_em)
    VALUES (p_item_key, p_programa, p_quantidade, v_user, v_nome, NOW())
    ON CONFLICT (item_key, programa_id) DO UPDATE
      SET quantidade = EXCLUDED.quantidade, atualizado_por = v_user, atualizado_por_nome = v_nome, atualizado_em = NOW();
  END IF;
  RETURN jsonb_build_object('version', v_ver, 'cota_lancada', GREATEST(v_falta, 0));
END;
$$;
REVOKE ALL ON FUNCTION public.reservar_para_programa(TEXT, UUID, NUMERIC, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_para_programa(TEXT, UUID, NUMERIC, INTEGER) TO authenticated;

-- Liga (ou desliga, com NULL) a parte de uma unidade num contrato a um programa da unidade.
CREATE OR REPLACE FUNCTION public.ligar_contrato_ao_programa(p_item_key TEXT, p_contract_key TEXT, p_unit TEXT, p_programa UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (public.has_permission('allocations.link_empenho') OR public.has_permission('allocations.manage')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem permissão para ligar contratos a programas.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.contrato_item_divisao_unidades
     SET programa_id = p_programa
   WHERE item_key = p_item_key AND contract_key = p_contract_key AND unit_name = p_unit;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: O contrato ainda não tem a parte da % neste item: divida o contrato pelas unidades antes.', p_unit USING ERRCODE = 'P0002';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.ligar_contrato_ao_programa(TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ligar_contrato_ao_programa(TEXT, TEXT, TEXT, UUID) TO authenticated;

CREATE TABLE IF NOT EXISTS public.arp_item_remanejamentos_unidades (
  id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key      VARCHAR(100)   NOT NULL,
  de_unidade    VARCHAR(50)    NOT NULL REFERENCES public.internal_departments(sigla) ON UPDATE CASCADE,
  para_unidade  VARCHAR(50)    NOT NULL REFERENCES public.internal_departments(sigla) ON UPDATE CASCADE,
  quantidade    NUMERIC(18, 4) NOT NULL CHECK (quantidade > 0),
  sei_numero    VARCHAR(25)    NOT NULL CHECK (sei_numero ~ '^(\d{7,10}|\d{5}\.\d{6}/\d{4}-\d{2})$'),
  observacao    TEXT           CHECK (observacao IS NULL OR length(observacao) <= 500),
  feito_por     UUID,
  feito_por_nome TEXT,
  feito_em      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CHECK (de_unidade <> para_unidade)
);
COMMENT ON TABLE public.arp_item_remanejamentos_unidades IS
  'Remanejamentos de quantidade entre unidades internas num item, com o nº SEI da autorização da unidade interna.';
CREATE INDEX IF NOT EXISTS arp_item_remanejamentos_unidades_item ON public.arp_item_remanejamentos_unidades (item_key, feito_em DESC);
ALTER TABLE public.arp_item_remanejamentos_unidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS arp_item_remanejamentos_unidades_leitura ON public.arp_item_remanejamentos_unidades;
CREATE POLICY arp_item_remanejamentos_unidades_leitura ON public.arp_item_remanejamentos_unidades FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.arp_item_remanejamentos_unidades FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.arp_item_remanejamentos_unidades TO authenticated;
GRANT ALL ON public.arp_item_remanejamentos_unidades TO service_role;

CREATE OR REPLACE FUNCTION public.remanejar_entre_unidades(
  p_item_key TEXT, p_de TEXT, p_para TEXT, p_quantidade NUMERIC, p_sei TEXT, p_observacao TEXT DEFAULT NULL, p_expected_version INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_sei TEXT; v_livre NUMERIC; v_ver INTEGER; v_ativo BOOLEAN;
BEGIN
  IF NOT public.has_permission('allocations.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador e o gestor de saldo remanejam entre unidades.' USING ERRCODE = '42501';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a quantidade (maior que zero).' USING ERRCODE = '22023';
  END IF;
  IF p_de IS NULL OR p_para IS NULL OR p_de = p_para THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha unidades diferentes.' USING ERRCODE = '22023';
  END IF;
  SELECT ativo INTO v_ativo FROM public.internal_departments WHERE sigla = p_para;
  IF NOT COALESCE(v_ativo, FALSE) THEN
    RAISE EXCEPTION 'INACTIVE_DEPARTMENT: A unidade % não existe ou está desativada.', p_para USING ERRCODE = '22023';
  END IF;
  v_sei := public.normalizar_numero_sei(p_sei);
  IF v_sei IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o nº SEI da autorização da unidade interna.' USING ERRCODE = '22023';
  END IF;
  IF p_observacao IS NOT NULL AND length(p_observacao) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Observação com mais de 500 caracteres.' USING ERRCODE = '22023';
  END IF;
  v_ver := public.travar_versao_do_item(p_item_key, p_expected_version);

  SELECT s.livre INTO v_livre FROM public.situacao_da_unidade_no_item(p_item_key, p_de) s;
  IF p_quantidade > v_livre THEN
    RAISE EXCEPTION 'NAO_CABE: A % só pode ceder % (o resto está contratado ou reservado).', p_de, trim_scale(GREATEST(v_livre, 0)) USING ERRCODE = '23514';
  END IF;

  UPDATE public.arp_allocations SET allocated_qty = allocated_qty - p_quantidade WHERE item_key = p_item_key AND unit_name = p_de;
  INSERT INTO public.arp_allocations (id, item_key, unit_name, allocated_qty, empenhada_qty)
  VALUES ('alloc_' || p_item_key || '_' || p_para || '_' || gen_random_uuid()::TEXT, p_item_key, p_para, p_quantidade, 0)
  ON CONFLICT (item_key, unit_name) DO UPDATE SET allocated_qty = public.arp_allocations.allocated_qty + EXCLUDED.allocated_qty;

  INSERT INTO public.arp_item_remanejamentos_unidades (item_key, de_unidade, para_unidade, quantidade, sei_numero, observacao, feito_por, feito_por_nome)
  VALUES (p_item_key, p_de, p_para, p_quantidade, v_sei, NULLIF(btrim(p_observacao), ''), auth.uid(), left(public.nome_do_usuario_logado(), 200));
  RETURN jsonb_build_object('version', v_ver);
END;
$$;
REVOKE ALL ON FUNCTION public.remanejar_entre_unidades(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remanejar_entre_unidades(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, INTEGER) TO authenticated;
