-- ==============================================================================
-- MIGRATION 70: VÍNCULO — ATA SEM GESTOR ASSUME O GESTOR DO CONTRATO, E AVISO
--               AO COORDENADOR QUANDO O VÍNCULO REALINHA O GESTOR
-- Versão: 20261005000070_vinculo_ata_assume_gestor_e_avisos.sql
--
-- Regra da CGLIC (complementa a migration 69):
--  1) Contrato COM gestor vinculado a ata SEM gestor: a ata passa a ser do gestor do
--     contrato, e os demais contratos vinculados a ela acompanham (gatilho existente
--     de propagação da migration 69).
--  2) Contrato com gestor vinculado a ata com OUTRO gestor: a ata prevalece (como já
--     era); o contrato passa ao gestor da ata.
--  3) Em ambos os casos o coordenador é avisado na Central de Distribuição
--     (tabela distribuicao_avisos), sem bloquear o vínculo do servidor.
-- Contrato sem gestor vinculado a ata com gestor continua herdando em silêncio
-- (nada foi tirado de ninguém).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Avisos ao coordenador
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.distribuicao_avisos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CONTRATO_REALINHADO: o contrato mudou de gestor para seguir a ata.
  -- ATA_ASSUMIU_GESTOR: a ata não tinha gestor e passou ao gestor do contrato vinculado.
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('CONTRATO_REALINHADO', 'ATA_ASSUMIU_GESTOR')),
  ata_key VARCHAR(50) NOT NULL,
  contract_key VARCHAR(100),
  gestor_anterior VARCHAR(150),
  gestor_novo VARCHAR(150) NOT NULL,
  -- ON DELETE SET NULL: excluir o usuário não é bloqueado (mesma regra da migration 67); o nome fica.
  feito_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  feito_por_nome VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lido_em TIMESTAMPTZ,
  lido_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_distribuicao_avisos_nao_lidos
  ON public.distribuicao_avisos (created_at DESC) WHERE lido_em IS NULL;

ALTER TABLE public.distribuicao_avisos ENABLE ROW LEVEL SECURITY;

-- Só o coordenador lê; ninguém grava direto (só os gatilhos e a RPC abaixo).
DROP POLICY IF EXISTS "Admin Read: distribuicao_avisos" ON public.distribuicao_avisos;
CREATE POLICY "Admin Read: distribuicao_avisos"
  ON public.distribuicao_avisos FOR SELECT TO authenticated USING (public.has_role('admin'));

CREATE OR REPLACE FUNCTION public.marcar_avisos_distribuicao_lidos()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_qtd INTEGER;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador lê os avisos de distribuição.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.distribuicao_avisos
  SET lido_em = NOW(), lido_por_user_id = auth.uid()
  WHERE lido_em IS NULL;
  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'lidos', v_qtd);
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_avisos_distribuicao_lidos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_avisos_distribuicao_lidos() TO authenticated;

-- Nome de quem está logado (para o aviso).
CREATE OR REPLACE FUNCTION public.nome_do_usuario_logado()
RETURNS VARCHAR(150)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT LEFT(COALESCE(
    NULLIF(u.raw_user_meta_data->>'nome', ''),
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    split_part(u.email, '@', 1)
  ), 150)
  FROM auth.users u
  WHERE u.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.nome_do_usuario_logado() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- Herança ao vincular: a ata assume o gestor do contrato, ou o contrato segue a ata
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_vinculo_herda_gestor_da_ata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ata TEXT;
  v_manager RECORD;
  v_contrato RECORD;
  v_outro RECORD;
  v_nome VARCHAR(150);
BEGIN
  -- Vinculado a uma ata: deixa de ser "não pertence a ata".
  DELETE FROM public.contract_sem_ata_confirmacoes WHERE contract_key = NEW.contract_key;

  v_ata := public.ata_key_from_item_key(NEW.item_key);
  v_nome := public.nome_do_usuario_logado();

  SELECT am.gestor_nome, am.gestor_user_id INTO v_manager
  FROM public.ata_managers am
  WHERE am.ata_key = v_ata;

  SELECT cm.gestor_nome, cm.gestor_user_id INTO v_contrato
  FROM public.contract_managers cm
  WHERE cm.contract_key = NEW.contract_key;

  IF v_manager.gestor_nome IS NOT NULL THEN
    -- A ata tem gestor: o contrato passa a ser dele. Só avisa quando tirou o contrato de outra pessoa.
    IF public.herdar_gestor_da_ata(NEW.contract_key, v_manager.gestor_nome, v_manager.gestor_user_id)
       AND v_contrato.gestor_nome IS NOT NULL
       AND v_contrato.gestor_nome <> v_manager.gestor_nome THEN
      INSERT INTO public.distribuicao_avisos (tipo, ata_key, contract_key, gestor_anterior, gestor_novo, feito_por_user_id, feito_por_nome)
      VALUES ('CONTRATO_REALINHADO', v_ata, NEW.contract_key, v_contrato.gestor_nome, v_manager.gestor_nome, auth.uid(), v_nome);
    END IF;

  ELSIF v_contrato.gestor_nome IS NOT NULL AND v_ata IS NOT NULL THEN
    -- A ata não tem gestor e o contrato tem: a ata passa a ser do gestor do contrato.
    -- Os outros contratos já vinculados a ela vão acompanhar (gatilho de propagação, no INSERT abaixo);
    -- avisa antes, enquanto ainda mostram o gestor de antes.
    FOR v_outro IN
      SELECT DISTINCT l.contract_key, cm.gestor_nome
      FROM public.arp_item_contract_links l
      JOIN public.contract_managers cm ON cm.contract_key = l.contract_key
      WHERE public.ata_key_from_item_key(l.item_key) = v_ata
        AND l.contract_key <> NEW.contract_key
        AND cm.gestor_nome <> v_contrato.gestor_nome
    LOOP
      INSERT INTO public.distribuicao_avisos (tipo, ata_key, contract_key, gestor_anterior, gestor_novo, feito_por_user_id, feito_por_nome)
      VALUES ('CONTRATO_REALINHADO', v_ata, v_outro.contract_key, v_outro.gestor_nome, v_contrato.gestor_nome, auth.uid(), v_nome);
    END LOOP;

    INSERT INTO public.distribuicao_avisos (tipo, ata_key, contract_key, gestor_anterior, gestor_novo, feito_por_user_id, feito_por_nome)
    VALUES ('ATA_ASSUMIU_GESTOR', v_ata, NEW.contract_key, NULL, v_contrato.gestor_nome, auth.uid(), v_nome);

    INSERT INTO public.ata_managers (ata_key, gestor_nome, gestor_user_id, created_at, updated_at)
    VALUES (v_ata, v_contrato.gestor_nome, v_contrato.gestor_user_id, NOW(), NOW())
    ON CONFLICT (ata_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
