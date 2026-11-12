-- ==============================================================================
-- MIGRATION 218: EMENDAS — GRUPO DE CADA BENEFICIÁRIO (CAPTAÇÃO PRINCIPAL)
-- Versão: 20261027000218_emendas_grupo_dos_beneficiarios.sql
--
-- Protótipo aprovado em 27/10/2026: cada beneficiário das emendas pertence a um grupo, e Pedidos, Por parlamentar e
-- Por emenda mostram a coluna "Captação principal" (a fatia de cada grupo no valor das linhas), como a coluna
-- "Interesse principal" das carteiras de Atas e Itens (migration 139).
-- Grupos: LIGABOM (Bombeiros), CNCG (Polícias Militares), CNPC (Polícias Civis), CONDPCI (Polícias Científicas),
-- CONSESP (Secretarias de Segurança Pública dos estados), CNGM (guardas e secretarias municipais de segurança) e
-- OUTROS (Polícia Penal e o que não é dos conselhos). Sem grupo "Distrital": PMDF, PCDF e CBMDF ficam na força.
-- O sistema sugere pelo nome, pela sigla e pela natureza jurídica (no navegador); vale só o grupo confirmado.
--
-- 1) emenda_beneficiario_grupo: o grupo confirmado de cada beneficiário, com quem confirmou e quando.
--    Some junto com o beneficiário (juntar_beneficiarios_emenda apaga o repetido).
-- 2) definir_grupos_beneficiarios_emenda(p_itens): grava ou tira o grupo; gestor de emendas e coordenador
--    (emendas.manage), os mesmos que cadastram beneficiários.
--
-- Leitura como as outras tabelas de Emendas (emendas.view). Só acrescenta: nenhuma regra existente muda.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.emenda_beneficiario_grupo (
  beneficiario_id      UUID         PRIMARY KEY REFERENCES public.emenda_beneficiarios(id) ON DELETE CASCADE,
  grupo                VARCHAR(10)  NOT NULL,
  confirmado_por       UUID,
  confirmado_por_nome  VARCHAR(200),
  confirmado_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT emenda_beneficiario_grupo_grupo CHECK (grupo IN ('LIGABOM', 'CNCG', 'CNPC', 'CONDPCI', 'CONSESP', 'CNGM', 'OUTROS'))
);
COMMENT ON TABLE public.emenda_beneficiario_grupo IS
  'Grupo (conselho da força) de cada beneficiário das emendas, confirmado pela CAEP ou pelo coordenador. '
  'Base da coluna Captação principal. Grava só definir_grupos_beneficiarios_emenda.';

ALTER TABLE public.emenda_beneficiario_grupo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura das emendas: emenda_beneficiario_grupo" ON public.emenda_beneficiario_grupo;
CREATE POLICY "Leitura das emendas: emenda_beneficiario_grupo" ON public.emenda_beneficiario_grupo FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('emendas.view')));
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.emenda_beneficiario_grupo;
CREATE POLICY "Somente usuario ativo" ON public.emenda_beneficiario_grupo AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
REVOKE ALL ON public.emenda_beneficiario_grupo FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.emenda_beneficiario_grupo TO authenticated;
GRANT ALL ON public.emenda_beneficiario_grupo TO service_role;

-- Auditoria: quem confirmou, trocou ou tirou o grupo fica em audit_logs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_emenda_beneficiario_grupo ON public.emenda_beneficiario_grupo;
    CREATE TRIGGER trg_audit_emenda_beneficiario_grupo
      AFTER INSERT OR UPDATE OR DELETE ON public.emenda_beneficiario_grupo
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- p_itens: array JSON (no máximo 1000) de { "beneficiario_id": "<uuid>", "grupo": "CNCG" }.
-- "grupo" nulo tira a confirmação. Devolve quantos beneficiários mudaram.
CREATE OR REPLACE FUNCTION public.definir_grupos_beneficiarios_emenda(p_itens JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item  JSONB;
  v_id    UUID;
  v_grupo TEXT;
  v_nome  TEXT;
  v_total INTEGER := 0;
  v_n     INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador definem o grupo dos beneficiários.' USING ERRCODE = '42501';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: p_itens deve ser um array JSON.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_itens) > 1000 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 1000 beneficiários por chamada.' USING ERRCODE = '22023';
  END IF;

  v_nome := left(public.nome_do_usuario_logado(), 200);

  FOR v_item IN SELECT valor FROM jsonb_array_elements(p_itens) AS e(valor) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: cada item deve ser um objeto.' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_id := NULLIF(btrim(COALESCE(v_item->>'beneficiario_id', '')), '')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: beneficiário inválido: %', v_item->>'beneficiario_id' USING ERRCODE = '22023';
    END;
    IF v_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.emenda_beneficiarios WHERE id = v_id) THEN
      RAISE EXCEPTION 'NAO_ENCONTRADO: beneficiário não encontrado: %', v_item->>'beneficiario_id' USING ERRCODE = 'P0002';
    END IF;
    v_grupo := NULLIF(upper(btrim(COALESCE(v_item->>'grupo', ''))), '');

    IF v_grupo IS NULL THEN
      DELETE FROM public.emenda_beneficiario_grupo WHERE beneficiario_id = v_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    ELSE
      IF v_grupo NOT IN ('LIGABOM', 'CNCG', 'CNPC', 'CONDPCI', 'CONSESP', 'CNGM', 'OUTROS') THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: grupo inválido: %', v_grupo USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.emenda_beneficiario_grupo (beneficiario_id, grupo, confirmado_por, confirmado_por_nome, confirmado_em)
      VALUES (v_id, v_grupo, auth.uid(), v_nome, NOW())
      ON CONFLICT (beneficiario_id) DO UPDATE
        SET grupo = EXCLUDED.grupo, confirmado_por = EXCLUDED.confirmado_por,
            confirmado_por_nome = EXCLUDED.confirmado_por_nome, confirmado_em = EXCLUDED.confirmado_em
        WHERE public.emenda_beneficiario_grupo.grupo IS DISTINCT FROM EXCLUDED.grupo;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;
    v_total := v_total + v_n;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.definir_grupos_beneficiarios_emenda(JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.definir_grupos_beneficiarios_emenda(JSONB) TO authenticated;
