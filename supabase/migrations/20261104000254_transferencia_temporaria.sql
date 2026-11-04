-- ==============================================================================
-- MIGRATION 254: TRANSFERÊNCIA TEMPORÁRIA DA CARTEIRA (férias, licença…)
-- Versão: 20261104000254_transferencia_temporaria.sql
--
-- Decisão de 04/11/2026 (protótipo aprovado): o coordenador passa as atas e os
-- contratos de quem vai se ausentar para um ou mais colegas e, no retorno,
-- desfaz. A troca é de verdade (ata_managers e contract_managers), para quem
-- assume ver e alterar tudo sem mudar permissões (migration 126) nem telas; o
-- gestor anterior fica guardado aqui para o Desfazer.
--
-- - Transferir: todas as atas do servidor (ata_managers) vão para o destino
--   escolhido; os contratos ligados a elas seguem pelo gatilho que já existe
--   (trg_ata_manager_propaga_contratos). Depois, os contratos que ainda estão
--   com ele (sem ata ou numa ata de outro gestor) vão direto.
--   Destino: `p_destinos` (por ata/contrato) e, para o que não estiver lá,
--   o destino padrão. Tarefas e ciclos de pagamento seguem o gestor da ata ou
--   do contrato (não têm responsável próprio), então vão e voltam junto.
-- - Desfazer: devolve só o que ainda está com quem assumiu. O que o
--   coordenador passou a outra pessoa no meio do período fica onde está
--   (devolvido = false). Atas novas dadas a quem assumiu não estão na lista e
--   ficam com ele. Atas voltam antes dos contratos, e os contratos ligados
--   voltam junto pelo mesmo gatilho.
-- - Uma transferência em curso por servidor; ninguém recebe a carteira de
--   outro estando ele mesmo ausente.
-- - Escrita só pelas RPCs, só admin (coordenador). Leitura de quem está logado
--   e ativo (o gestor vê o aviso na própria carteira).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.transferencias_temporarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ausente_user_id UUID NOT NULL REFERENCES auth.users(id),
  ausente_nome VARCHAR(150) NOT NULL,
  motivo VARCHAR(15) NOT NULL CHECK (motivo IN ('FERIAS', 'LICENCA', 'AFASTAMENTO', 'OUTRO')),
  inicio DATE NOT NULL,
  retorno_previsto DATE NOT NULL,
  sei_numero VARCHAR(40),
  criado_por_user_id UUID REFERENCES auth.users(id),
  criado_por_nome VARCHAR(150),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  desfeita_em TIMESTAMPTZ,
  desfeita_por_user_id UUID REFERENCES auth.users(id),
  desfeita_por_nome VARCHAR(150),
  CHECK (retorno_previsto >= inicio)
);

-- Uma em curso por servidor.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transferencia_temporaria_em_curso
  ON public.transferencias_temporarias (ausente_user_id) WHERE desfeita_em IS NULL;

CREATE TABLE IF NOT EXISTS public.transferencias_temporarias_itens (
  id BIGSERIAL PRIMARY KEY,
  transferencia_id UUID NOT NULL REFERENCES public.transferencias_temporarias(id) ON DELETE CASCADE,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('ATA', 'CONTRATO')),
  chave VARCHAR(150) NOT NULL,
  origem_nome VARCHAR(150) NOT NULL,
  origem_user_id UUID REFERENCES auth.users(id),
  destino_nome VARCHAR(150) NOT NULL,
  destino_user_id UUID NOT NULL REFERENCES auth.users(id),
  -- NULL até o Desfazer; true = voltou; false = mudou de mãos no período e ficou.
  devolvido BOOLEAN,
  UNIQUE (transferencia_id, tipo, chave)
);

CREATE INDEX IF NOT EXISTS idx_transferencias_temporarias_itens_destino
  ON public.transferencias_temporarias_itens (destino_user_id);
CREATE INDEX IF NOT EXISTS idx_transferencias_temporarias_criado_por
  ON public.transferencias_temporarias (criado_por_user_id);
CREATE INDEX IF NOT EXISTS idx_transferencias_temporarias_desfeita_por
  ON public.transferencias_temporarias (desfeita_por_user_id);
CREATE INDEX IF NOT EXISTS idx_transferencias_temporarias_itens_origem
  ON public.transferencias_temporarias_itens (origem_user_id);

ALTER TABLE public.transferencias_temporarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transferencias_temporarias_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Logados leem: transferencias_temporarias" ON public.transferencias_temporarias;
CREATE POLICY "Logados leem: transferencias_temporarias"
  ON public.transferencias_temporarias FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Logados leem: transferencias_temporarias_itens" ON public.transferencias_temporarias_itens;
CREATE POLICY "Logados leem: transferencias_temporarias_itens"
  ON public.transferencias_temporarias_itens FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Somente usuario ativo" ON public.transferencias_temporarias;
CREATE POLICY "Somente usuario ativo" ON public.transferencias_temporarias AS RESTRICTIVE
  FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));

DROP POLICY IF EXISTS "Somente usuario ativo" ON public.transferencias_temporarias_itens;
CREATE POLICY "Somente usuario ativo" ON public.transferencias_temporarias_itens AS RESTRICTIVE
  FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));

REVOKE ALL ON public.transferencias_temporarias, public.transferencias_temporarias_itens FROM anon;
GRANT SELECT ON public.transferencias_temporarias, public.transferencias_temporarias_itens TO authenticated;

DROP TRIGGER IF EXISTS trg_audit_transferencias_temporarias ON public.transferencias_temporarias;
CREATE TRIGGER trg_audit_transferencias_temporarias
AFTER INSERT OR UPDATE OR DELETE ON public.transferencias_temporarias
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

-- ------------------------------------------------------------------------------
-- transferir_carteira_temporaria
--   p_destinos: [{ "tipo": "ATA"|"CONTRATO", "chave": "...", "user_id": "...", "nome": "..." }]
--   (exceções ao destino padrão; o resto vai para p_padrao_user_id/p_padrao_nome)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transferir_carteira_temporaria(
  p_ausente_user_id UUID,
  p_motivo VARCHAR(15),
  p_inicio DATE,
  p_retorno_previsto DATE,
  p_sei_numero VARCHAR(40),
  p_padrao_user_id UUID,
  p_padrao_nome VARCHAR(150),
  p_destinos JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_motivo VARCHAR(15);
  v_padrao_nome VARCHAR(150);
  v_ausente_nome VARCHAR(150);
  v_id UUID;
  v_dest RECORD;
  v_row RECORD;
  v_destino_user UUID;
  v_destino_nome VARCHAR(150);
  v_atas INTEGER := 0;
  v_contratos INTEGER := 0;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador transfere a carteira.' USING ERRCODE = '42501';
  END IF;

  v_motivo := UPPER(TRIM(COALESCE(p_motivo, '')));
  v_padrao_nome := TRIM(COALESCE(p_padrao_nome, ''));

  IF p_ausente_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe quem vai se ausentar.' USING ERRCODE = '22023';
  END IF;
  IF v_motivo NOT IN ('FERIAS', 'LICENCA', 'AFASTAMENTO', 'OUTRO') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Motivo deve ser FERIAS, LICENCA, AFASTAMENTO ou OUTRO.' USING ERRCODE = '22023';
  END IF;
  IF p_inicio IS NULL OR p_retorno_previsto IS NULL OR p_retorno_previsto < p_inicio THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O retorno previsto deve ser igual ou depois da saída.' USING ERRCODE = '22023';
  END IF;
  IF p_padrao_user_id IS NULL OR v_padrao_nome = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe quem assume.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_destinos, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Destinos devem ser uma lista.' USING ERRCODE = '22023';
  END IF;

  -- Trava o servidor (duas transferências ao mesmo tempo para a mesma pessoa).
  PERFORM pg_advisory_xact_lock(hashtext('transferencia_temporaria:' || p_ausente_user_id::text));

  IF EXISTS (SELECT 1 FROM public.transferencias_temporarias WHERE ausente_user_id = p_ausente_user_id AND desfeita_em IS NULL) THEN
    RAISE EXCEPTION 'JA_AUSENTE: Este servidor já tem uma transferência em curso. Desfaça ou mude o retorno.' USING ERRCODE = '22023';
  END IF;

  -- Destinos: existem, não são o próprio ausente e não estão ausentes.
  FOR v_dest IN
    SELECT p_padrao_user_id AS user_id
    UNION
    SELECT (d->>'user_id')::uuid FROM jsonb_array_elements(COALESCE(p_destinos, '[]'::jsonb)) d
  LOOP
    IF v_dest.user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_dest.user_id) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Servidor de destino não encontrado.' USING ERRCODE = '22023';
    END IF;
    IF v_dest.user_id = p_ausente_user_id THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: A carteira não pode ir para quem está saindo.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.transferencias_temporarias WHERE ausente_user_id = v_dest.user_id AND desfeita_em IS NULL) THEN
      RAISE EXCEPTION 'DESTINO_AUSENTE: Quem vai assumir também está ausente.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT gestor_nome INTO v_ausente_nome FROM (
    SELECT gestor_nome FROM public.ata_managers WHERE gestor_user_id = p_ausente_user_id
    UNION ALL
    SELECT gestor_nome FROM public.contract_managers WHERE gestor_user_id = p_ausente_user_id
  ) g LIMIT 1;

  IF v_ausente_nome IS NULL THEN
    RAISE EXCEPTION 'NADA_A_TRANSFERIR: Este servidor não tem atas nem contratos.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.transferencias_temporarias
    (ausente_user_id, ausente_nome, motivo, inicio, retorno_previsto, sei_numero, criado_por_user_id, criado_por_nome)
  VALUES (p_ausente_user_id, v_ausente_nome, v_motivo, p_inicio, p_retorno_previsto,
          NULLIF(TRIM(COALESCE(p_sei_numero, '')), ''), auth.uid(), public.nome_do_usuario_logado())
  RETURNING id INTO v_id;

  -- 1. Atas (os contratos ligados seguem pelo gatilho de propagação).
  FOR v_row IN
    SELECT ata_key, gestor_nome FROM public.ata_managers WHERE gestor_user_id = p_ausente_user_id ORDER BY ata_key FOR UPDATE
  LOOP
    SELECT (d->>'user_id')::uuid, TRIM(d->>'nome') INTO v_destino_user, v_destino_nome
    FROM jsonb_array_elements(COALESCE(p_destinos, '[]'::jsonb)) d
    WHERE d->>'tipo' = 'ATA' AND d->>'chave' = v_row.ata_key
    LIMIT 1;
    IF v_destino_user IS NULL OR COALESCE(v_destino_nome, '') = '' THEN
      v_destino_user := p_padrao_user_id;
      v_destino_nome := v_padrao_nome;
    END IF;

    INSERT INTO public.transferencias_temporarias_itens
      (transferencia_id, tipo, chave, origem_nome, origem_user_id, destino_nome, destino_user_id)
    VALUES (v_id, 'ATA', v_row.ata_key, v_row.gestor_nome, p_ausente_user_id, v_destino_nome, v_destino_user);

    UPDATE public.ata_managers
    SET gestor_nome = v_destino_nome, gestor_user_id = v_destino_user, updated_at = NOW()
    WHERE ata_key = v_row.ata_key;
    v_atas := v_atas + 1;
  END LOOP;

  -- 2. Contratos que ainda estão com ele (sem ata, ou numa ata de outro gestor).
  FOR v_row IN
    SELECT contract_key, gestor_nome FROM public.contract_managers WHERE gestor_user_id = p_ausente_user_id ORDER BY contract_key FOR UPDATE
  LOOP
    SELECT (d->>'user_id')::uuid, TRIM(d->>'nome') INTO v_destino_user, v_destino_nome
    FROM jsonb_array_elements(COALESCE(p_destinos, '[]'::jsonb)) d
    WHERE d->>'tipo' = 'CONTRATO' AND d->>'chave' = v_row.contract_key
    LIMIT 1;
    IF v_destino_user IS NULL OR COALESCE(v_destino_nome, '') = '' THEN
      v_destino_user := p_padrao_user_id;
      v_destino_nome := v_padrao_nome;
    END IF;

    INSERT INTO public.transferencias_temporarias_itens
      (transferencia_id, tipo, chave, origem_nome, origem_user_id, destino_nome, destino_user_id)
    VALUES (v_id, 'CONTRATO', v_row.contract_key, v_row.gestor_nome, p_ausente_user_id, v_destino_nome, v_destino_user);

    UPDATE public.contract_managers
    SET gestor_nome = v_destino_nome, gestor_user_id = v_destino_user, updated_at = NOW()
    WHERE contract_key = v_row.contract_key;
    v_contratos := v_contratos + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'atas', v_atas, 'contratos', v_contratos);
END;
$$;

REVOKE ALL ON FUNCTION public.transferir_carteira_temporaria(UUID, VARCHAR, DATE, DATE, VARCHAR, UUID, VARCHAR, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferir_carteira_temporaria(UUID, VARCHAR, DATE, DATE, VARCHAR, UUID, VARCHAR, JSONB) TO authenticated;

-- ------------------------------------------------------------------------------
-- desfazer_transferencia_temporaria
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.desfazer_transferencia_temporaria(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_transf RECORD;
  v_item RECORD;
  v_atual UUID;
  v_devolvidos INTEGER := 0;
  v_ficaram INTEGER := 0;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador desfaz a transferência.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_transf FROM public.transferencias_temporarias WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Transferência não encontrada.' USING ERRCODE = '22023';
  END IF;
  IF v_transf.desfeita_em IS NOT NULL THEN
    RAISE EXCEPTION 'JA_DESFEITA: Esta transferência já foi desfeita.' USING ERRCODE = '22023';
  END IF;

  -- Atas primeiro: os contratos ligados voltam junto pelo gatilho.
  FOR v_item IN
    SELECT * FROM public.transferencias_temporarias_itens
    WHERE transferencia_id = p_id
    ORDER BY CASE tipo WHEN 'ATA' THEN 0 ELSE 1 END, chave
  LOOP
    IF v_item.tipo = 'ATA' THEN
      SELECT gestor_user_id INTO v_atual FROM public.ata_managers WHERE ata_key = v_item.chave FOR UPDATE;
    ELSE
      SELECT gestor_user_id INTO v_atual FROM public.contract_managers WHERE contract_key = v_item.chave FOR UPDATE;
    END IF;

    IF v_atual IS NOT DISTINCT FROM v_item.origem_user_id THEN
      -- Já voltou (ex.: contrato que acompanhou a ata).
      UPDATE public.transferencias_temporarias_itens SET devolvido = true WHERE id = v_item.id;
      v_devolvidos := v_devolvidos + 1;
    ELSIF v_atual IS NOT DISTINCT FROM v_item.destino_user_id THEN
      IF v_item.tipo = 'ATA' THEN
        UPDATE public.ata_managers
        SET gestor_nome = v_item.origem_nome, gestor_user_id = v_item.origem_user_id, updated_at = NOW()
        WHERE ata_key = v_item.chave;
      ELSE
        UPDATE public.contract_managers
        SET gestor_nome = v_item.origem_nome, gestor_user_id = v_item.origem_user_id, updated_at = NOW()
        WHERE contract_key = v_item.chave;
      END IF;
      UPDATE public.transferencias_temporarias_itens SET devolvido = true WHERE id = v_item.id;
      v_devolvidos := v_devolvidos + 1;
    ELSE
      -- Mudou de mãos no período (ou saiu do cadastro): fica onde está.
      UPDATE public.transferencias_temporarias_itens SET devolvido = false WHERE id = v_item.id;
      v_ficaram := v_ficaram + 1;
    END IF;
  END LOOP;

  UPDATE public.transferencias_temporarias
  SET desfeita_em = NOW(), desfeita_por_user_id = auth.uid(), desfeita_por_nome = public.nome_do_usuario_logado()
  WHERE id = p_id;

  RETURN jsonb_build_object('success', true, 'devolvidos', v_devolvidos, 'ficaram', v_ficaram);
END;
$$;

REVOKE ALL ON FUNCTION public.desfazer_transferencia_temporaria(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desfazer_transferencia_temporaria(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- mudar_retorno_transferencia_temporaria — férias prorrogadas ou antecipadas.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mudar_retorno_transferencia_temporaria(p_id UUID, p_retorno_previsto DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_transf RECORD;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador muda o retorno.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_transf FROM public.transferencias_temporarias WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Transferência não encontrada.' USING ERRCODE = '22023';
  END IF;
  IF v_transf.desfeita_em IS NOT NULL THEN
    RAISE EXCEPTION 'JA_DESFEITA: Esta transferência já foi desfeita.' USING ERRCODE = '22023';
  END IF;
  IF p_retorno_previsto IS NULL OR p_retorno_previsto < v_transf.inicio THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O retorno previsto deve ser igual ou depois da saída.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.transferencias_temporarias SET retorno_previsto = p_retorno_previsto WHERE id = p_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.mudar_retorno_transferencia_temporaria(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mudar_retorno_transferencia_temporaria(UUID, DATE) TO authenticated;
