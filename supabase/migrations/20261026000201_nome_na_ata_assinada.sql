-- "Nome curto" do item da CAEP passa a ser o nome na ata assinada (26/10/2026): a CAEP copia o nome como está na
-- tabela de itens da ata, que pode ser uma especificação longa (a maior lida tem 372 letras). Sai o limite de 80
-- letras da coluna e da função. A view dos itens da CAEP lê a coluna, então sai e volta igual à da migration 178
-- (com o comentário e as permissões da 155); a função fica igual à da 165, sem o limite (CREATE OR REPLACE mantém
-- as permissões: só logados com emendas.manage).

DROP VIEW public.v_emendas_itens_caep;

ALTER TABLE public.emenda_itens_dados ALTER COLUMN nome_curto TYPE TEXT;

CREATE VIEW public.v_emendas_itens_caep
WITH (security_invoker = true) AS
SELECT a.item_key,
       r.numero_ata,
       r.codigo_uasg,
       i.numero_item,
       i.descricao_item,
       i.codigo_pdm,
       i.valor_unitario,
       r.data_vigencia_final,
       (r.data_vigencia_final IS NOT NULL
         AND r.data_vigencia_final < (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE) AS ata_encerrada,
       a.allocated_qty AS alocado,
       d.nome_curto,
       d.gnd,
       d.versao AS dados_versao,
       i.fornecedor_razao_social AS fornecedor
  FROM public.arp_allocations a
  JOIN public.atas_registro_preco r
    ON r.numero_ata = split_part(a.item_key, '-', 1)
   AND r.codigo_uasg = split_part(a.item_key, '-', 2)
  JOIN public.itens_ata i
    ON i.ata_id = r.id
   AND lpad(i.numero_item, 5, '0') = split_part(a.item_key, '-', 3)
  LEFT JOIN public.emenda_itens_dados d ON d.item_key = a.item_key
 WHERE a.unit_name = public.unidade_das_emendas()
   AND a.allocated_qty > 0;

COMMENT ON VIEW public.v_emendas_itens_caep IS
  'Itens com alocação para a unidade das emendas (CAEP). Saldo das emendas = alocado − pedidos (entrega 2).';
REVOKE ALL ON public.v_emendas_itens_caep FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_emendas_itens_caep TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.salvar_dados_item_emenda(p_item_key TEXT, p_nome_curto TEXT, p_gnd TEXT, p_versao INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome   TEXT;
  v_atual  INTEGER;
  v_versao INTEGER;
  v_curto  TEXT := NULLIF(btrim(COALESCE(p_nome_curto, '')), '');
  v_gnd    TEXT := NULLIF(upper(btrim(COALESCE(p_gnd, ''))), '');
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador alteram os dados do item.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.v_emendas_itens_caep WHERE item_key = p_item_key) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o item não tem alocação para a CAEP.' USING ERRCODE = '22023';
  END IF;
  IF v_gnd IS NOT NULL AND v_gnd NOT IN ('GND-3', 'GND-4') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: GND deve ser GND-3 (custeio) ou GND-4 (investimento).' USING ERRCODE = '22023';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);

  SELECT versao INTO v_atual FROM public.emenda_itens_dados WHERE item_key = p_item_key FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.emenda_itens_dados (item_key, nome_curto, gnd, atualizado_por, atualizado_por_nome)
    VALUES (p_item_key, v_curto, v_gnd, auth.uid(), v_nome)
    RETURNING versao INTO v_versao;
    RETURN jsonb_build_object('item_key', p_item_key, 'versao', v_versao);
  END IF;
  IF p_versao IS DISTINCT FROM v_atual THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou os dados deste item. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  UPDATE public.emenda_itens_dados
     SET nome_curto = v_curto, gnd = v_gnd, versao = versao + 1,
         atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE item_key = p_item_key
  RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('item_key', p_item_key, 'versao', v_versao);
END;
$$;
