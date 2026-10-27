-- =====================================================================
-- Versão: 20261027000212_emendas_beneficiario_uf_obrigatoria.sql
--
-- Pedido de 27/10/2026: no pedido do parlamentar, a busca de órgãos mostra só os da UF dele (com "Mostrar todas as
-- UFs"). Para o filtro valer, todo beneficiário tem UF de entrega: a tela do cadastro já exige, e esta regra garante
-- o mesmo para qualquer gravação (cadastro, junção, cargas).
--
-- Medição de 27/10/2026: 549 beneficiários, todos com entrega_uf válida (20 UFs); nenhum fica de fora. Se algum
-- estiver sem UF na hora de aplicar, a migration para sozinha com a contagem, sem gravar nada.
-- =====================================================================

DO $$
DECLARE
  v_sem integer;
BEGIN
  SELECT count(*) INTO v_sem
  FROM public.emenda_beneficiarios
  WHERE entrega_uf IS NULL
     OR entrega_uf NOT IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO');
  IF v_sem > 0 THEN
    RAISE EXCEPTION '% beneficiário(s) sem UF de entrega válida: completar o cadastro antes de aplicar.', v_sem;
  END IF;
END $$;

ALTER TABLE public.emenda_beneficiarios
  ALTER COLUMN entrega_uf SET NOT NULL,
  ADD CONSTRAINT emenda_beneficiarios_entrega_uf_valida
    CHECK (entrega_uf IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'));

COMMENT ON COLUMN public.emenda_beneficiarios.entrega_uf IS
  'UF de entrega, obrigatória (migration 212): filtra os órgãos no pedido do parlamentar.';
