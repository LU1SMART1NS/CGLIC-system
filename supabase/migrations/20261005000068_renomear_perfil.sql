-- ==============================================================================
-- MIGRATION 68: RENOMEAR PERFIL (public.roles.label) PELO COORDENADOR
-- Versão: 20261005000068_renomear_perfil.sql
--
-- Contexto: o nome de exibição dos perfis vinha fixo no código. Passa a vir de
-- public.roles.label, editável na tela Perfis. O id (admin, gestor, ...) nunca
-- muda — só o rótulo. Escrita só pela RPC, só para admin (coordenador); a
-- tabela segue sem policy de escrita para clientes. Leitura continua pública
-- (policy "Public Read: roles").
--
-- Os rótulos iniciais passam a ser os nomes que a interface já exibe, para o
-- banco e a tela começarem iguais.
-- ==============================================================================

UPDATE public.roles SET label = 'Coordenador / Diretor'      WHERE id = 'admin'         AND label = 'Administrador';
UPDATE public.roles SET label = 'Gestor / Fiscal de Contrato' WHERE id = 'gestor'        AND label = 'Gestor';
UPDATE public.roles SET label = 'Consulta / Auditoria'        WHERE id = 'leitor'        AND label = 'Leitor';

DROP TRIGGER IF EXISTS trg_audit_roles ON public.roles;
CREATE TRIGGER trg_audit_roles
AFTER INSERT OR UPDATE OR DELETE ON public.roles
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

CREATE OR REPLACE FUNCTION public.rename_role(
  p_role_id VARCHAR(50),
  p_label VARCHAR(100)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_label VARCHAR(100);
  v_record RECORD;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador renomeia perfis.'
      USING ERRCODE = '42501';
  END IF;

  v_label := TRIM(COALESCE(p_label, ''));

  IF LENGTH(v_label) < 3 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome do perfil deve ter ao menos 3 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF LENGTH(v_label) > 60 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome do perfil não pode exceder 60 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.roles
     WHERE id <> p_role_id AND LOWER(label) = LOWER(v_label)
  ) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Já existe um perfil com esse nome.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.roles SET label = v_label WHERE id = p_role_id
  RETURNING id, label INTO v_record;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Perfil não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('id', v_record.id, 'label', v_record.label);
END;
$$;

REVOKE ALL ON FUNCTION public.rename_role(VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_role(VARCHAR, VARCHAR) TO authenticated;
