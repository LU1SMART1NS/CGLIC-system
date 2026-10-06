-- ==============================================================================
-- MIGRATION 73: IDENTIFICADOR COMPLETO DO FORNECEDOR NOS ITENS DA ATA
-- Versão: 20261006000073_itens_ata_fornecedor_identificador_longo.sql
--
-- Contexto: itens_ata.fornecedor_cnpj_cpf era VARCHAR(20). Fornecedor estrangeiro
-- chega do Compras.gov.br/PNCP como texto ("ESTRANGEIRO_CESKÁ_ZBROJOVKA_AS",
-- "ESTRANGEIRO_HAIX__SCHUHE__PRODUKTIONS_UND_VERTRIEBS_GMBH"), que não cabia: a
-- gravação de TODOS os itens da ata falhava (22001) e 4 atas ficaram sem itens no
-- banco. Provisoriamente o app passou a gravar vazio nesse caso; esta migration
-- amplia a coluna para o identificador ser guardado inteiro, como a API entrega.
--
-- Por que recriar a view: v_arp_item_saldo_detalhado seleciona a coluna, e o Postgres
-- não deixa mudar o tipo de uma coluna usada por view. Nada depende da view (conferido
-- em pg_depend). Para não reescrever a definição (que já mudou em várias migrations),
-- ela é lida do próprio banco, a view é derrubada, a coluna é ampliada e a view é
-- recriada IGUAL, com as mesmas opções (security_invoker), comentário e permissões.
-- Tudo na mesma transação: se qualquer passo falhar, nada muda.
--
-- Não muda dado nenhum. Quem já lê a view continua lendo; a coluna da view passa a
-- ter o tipo VARCHAR(255) (o mesmo da razão social).
-- ==============================================================================

DO $$
DECLARE
  v_view        CONSTANT regclass := 'public.v_arp_item_saldo_detalhado'::regclass;
  v_def         TEXT;
  v_opcoes      TEXT[];
  v_comentario  TEXT;
  v_dono        TEXT;
  v_dependentes INTEGER;
  v_acl         RECORD;
  v_tamanho     INTEGER;
BEGIN
  -- Já ampliada (migration rodando de novo): nada a fazer.
  SELECT character_maximum_length INTO v_tamanho
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'itens_ata' AND column_name = 'fornecedor_cnpj_cpf';
  IF v_tamanho IS NULL OR v_tamanho >= 255 THEN
    RAISE NOTICE 'itens_ata.fornecedor_cnpj_cpf já suporta % caracteres; nada a fazer.', v_tamanho;
    RETURN;
  END IF;

  -- Trava: ninguém pode depender da view (senão o DROP quebraria silenciosamente o dependente).
  SELECT count(DISTINCT r.ev_class) INTO v_dependentes
    FROM pg_depend d
    JOIN pg_rewrite r ON r.oid = d.objid
   WHERE d.refobjid = v_view AND r.ev_class <> v_view;
  IF v_dependentes > 0 THEN
    RAISE EXCEPTION 'Há % objeto(s) dependendo de v_arp_item_saldo_detalhado; migration revertida.', v_dependentes;
  END IF;

  -- 1) Guarda tudo o que a view tem hoje.
  v_def := pg_get_viewdef(v_view, true);
  SELECT c.reloptions, pg_get_userbyid(c.relowner) INTO v_opcoes, v_dono FROM pg_class c WHERE c.oid = v_view;
  v_comentario := obj_description(v_view, 'pg_class');

  CREATE TEMP TABLE _acl_view_saldo ON COMMIT DROP AS
    SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS papel,
           a.privilege_type
      FROM pg_class c, LATERAL aclexplode(c.relacl) a
     WHERE c.oid = v_view AND a.grantee <> c.relowner;

  -- 2) Derruba a view, amplia a coluna e recria a view igual.
  DROP VIEW public.v_arp_item_saldo_detalhado;

  ALTER TABLE public.itens_ata ALTER COLUMN fornecedor_cnpj_cpf TYPE VARCHAR(255);

  EXECUTE 'CREATE VIEW public.v_arp_item_saldo_detalhado AS ' || v_def;

  IF v_opcoes IS NOT NULL THEN
    EXECUTE format('ALTER VIEW public.v_arp_item_saldo_detalhado SET (%s)', array_to_string(v_opcoes, ', '));
  END IF;
  EXECUTE format('ALTER VIEW public.v_arp_item_saldo_detalhado OWNER TO %I', v_dono);
  IF v_comentario IS NOT NULL THEN
    EXECUTE format('COMMENT ON VIEW public.v_arp_item_saldo_detalhado IS %L', v_comentario);
  END IF;

  -- 3) Permissões: parte do zero e devolve exatamente as que existiam.
  EXECUTE 'REVOKE ALL ON public.v_arp_item_saldo_detalhado FROM PUBLIC, anon, authenticated, service_role';
  FOR v_acl IN SELECT papel, privilege_type FROM _acl_view_saldo LOOP
    EXECUTE format('GRANT %s ON public.v_arp_item_saldo_detalhado TO %s',
                   v_acl.privilege_type,
                   CASE WHEN v_acl.papel = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(v_acl.papel) END);
  END LOOP;

  RAISE NOTICE 'itens_ata.fornecedor_cnpj_cpf ampliada para VARCHAR(255) e v_arp_item_saldo_detalhado recriada.';
END;
$$;
