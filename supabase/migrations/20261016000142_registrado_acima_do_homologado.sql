-- Registrado acima do homologado (protótipo aprovado em 16/10/2026).
--
-- Fato: em parte dos itens das atas da CGLIC, a soma do registrado por órgão no Compras.gov.br (cópia em
-- itens_ata_unidades_copia) é maior do que a quantidade homologada do item. Remanejamento nunca muda essa soma; o que
-- passa do homologado é quantidade sem lastro na licitação (em geral lançada a mais na criação da ata).
--
-- 1) v_item_registrado_acima: um registro por item da CGLIC (UASG 200330/200331) com excedente = soma do registrado −
--    homologado, a chave do aviso e se ele foi resolvido. Parte do excedente que está na SENASP (calculada em
--    v_arp_item_saldo_detalhado, que já lê os quantitativos do item):
--      - com a ata assinada informada: o que o registrado líquido da SENASP (registrado − gerenciado para os
--        participantes) passa da ata assinada dela, limitado ao excedente (assim, a cota própria fica no menor entre o
--        registrado líquido e a ata assinada);
--      - sem a ata assinada: todo o excedente, limitado ao registrado da SENASP (provisório: em geral o excedente está
--        na SENASP; a ata assinada informada corrige).
--    O excedente dos participantes não mexe no saldo da SENASP; só aparece no aviso.
--    Chave do aviso (tipo SALDO, tabela avisos_resolvidos): SALDO::<ata>-<uasg>::<item>::REGISTRADO-ACIMA-<soma>-<homologado>.
--    Se a soma ou o homologado mudarem, a chave muda e o aviso volta.
-- 2) v_arp_item_saldo_detalhado: com o aviso aberto, a base do saldo (quantidade_base_senasp) desconta a parte da
--    SENASP; resolvido, volta a contar. Saldo, percentual, alerta de saldo e limite da alocação (save_allocations_atomic
--    lê esta base) seguem sozinhos. Colunas novas no fim; o resto igual à migration 116.
-- 3) resolver_aviso / reexibir_aviso: este aviso só o gestor da ata e o coordenador resolvem (o gestor de saldo não).

CREATE OR REPLACE VIEW public.v_item_registrado_acima
WITH (security_invoker = true)
AS
WITH itens AS (
  SELECT (((a.numero_ata::text || '-'::text) || a.codigo_uasg::text) || '-'::text) || lpad(i.numero_item::text, 5, '0'::text) AS item_key,
         a.numero_ata,
         a.codigo_uasg,
         i.numero_item,
         CASE WHEN btrim(i.numero_item::text) ~ '^\d+$' THEN (btrim(i.numero_item::text)::bigint)::text ELSE btrim(i.numero_item::text) END AS item_canonico,
         COALESCE(i.quantidade_homologada, 0::numeric) AS homologado,
         COALESCE(i.quantidade_senasp, i.quantidade_homologada, 0::numeric) AS registrado_senasp
    FROM itens_ata i
    JOIN atas_registro_preco a ON a.id = i.ata_id
   WHERE a.codigo_uasg::text = ANY (ARRAY['200330'::text, '200331'::text])
), fim AS (
  SELECT it.*,
         s.soma_registrado,
         s.soma_registrado - it.homologado AS excedente,
         'SALDO::' || it.numero_ata || '-' || it.codigo_uasg || '::' || it.item_canonico || '::REGISTRADO-ACIMA-'
           || round(s.soma_registrado, 2)::text || '-' || round(it.homologado, 2)::text AS chave_aviso
    FROM itens it
    -- Mesma conta de registrado_por_uasg (UASG de 6 dígitos, linha não excluída), só a soma: item a item, para a
    -- consulta de um item (alocação, Item 360) não somar a cópia inteira.
    CROSS JOIN LATERAL (
      SELECT sum(CASE WHEN btrim(u->>'quantidadeRegistrada') ~ '^[0-9]+(\.[0-9]+)?$'
                      THEN btrim(u->>'quantidadeRegistrada')::numeric ELSE 0::numeric END) AS soma_registrado
        FROM itens_ata_unidades_copia c
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(c.unidades) = 'array' THEN c.unidades ELSE '[]'::jsonb END) AS u
       WHERE c.item_key::text = it.item_key
         AND jsonb_typeof(u) = 'object'
         AND COALESCE(u->>'dataHoraExclusao', '') = ''
         AND regexp_replace(COALESCE(u->>'codigoUnidade', ''), '\D', '', 'g') ~ '^[0-9]{6}$'
    ) s
   WHERE it.homologado > 0::numeric
     AND s.soma_registrado - it.homologado >= 0.01
)
SELECT f.item_key,
       f.numero_ata,
       f.codigo_uasg,
       f.numero_item,
       f.homologado,
       f.soma_registrado,
       f.excedente,
       f.registrado_senasp,
       f.chave_aviso,
       r.resolvido_em,
       r.resolvido_por_nome,
       r.justificativa AS resolvido_justificativa
  FROM fim f
  LEFT JOIN avisos_resolvidos r ON r.chave::text = f.chave_aviso;

REVOKE ALL ON public.v_item_registrado_acima FROM PUBLIC, anon;
GRANT SELECT ON public.v_item_registrado_acima TO authenticated;
GRANT ALL ON public.v_item_registrado_acima TO service_role;

COMMENT ON VIEW public.v_item_registrado_acima IS
  'Itens da CGLIC com a soma do registrado no Compras.gov.br acima do homologado (migration 142). A parte da SENASP e o desconto no saldo ficam em v_arp_item_saldo_detalhado.';

-- 2) Base do saldo com o desconto do excedente da SENASP enquanto o aviso estiver aberto.
CREATE OR REPLACE VIEW public.v_arp_item_saldo_detalhado
WITH (security_invoker = true)
AS
 WITH empenhado_agg AS (
         SELECT v_arp_item_contrato_empenhado.item_key,
            sum(v_arp_item_contrato_empenhado.notas)::bigint AS total_empenhos_vinculados
           FROM v_arp_item_contrato_empenhado
          GROUP BY v_arp_item_contrato_empenhado.item_key
        ), contratos_agg AS (
         SELECT v_arp_item_contrato_quantidade.item_key,
            COALESCE(sum(v_arp_item_contrato_quantidade.quantidade_contratada), 0::numeric) AS total_contratado,
            count(*) AS total_contratos_vinculados,
            count(*) FILTER (WHERE v_arp_item_contrato_quantidade.quantidade_contratada IS NULL) AS total_contratos_sem_quantidade,
            count(*) FILTER (WHERE v_arp_item_contrato_quantidade.ajustada) AS total_contratos_ajustados,
            COALESCE(sum(v_arp_item_contrato_quantidade.quantidade_sem_unidade), 0::numeric) AS quantidade_contratada_sem_unidade,
            count(*) FILTER (WHERE v_arp_item_contrato_quantidade.situacao_divisao = 'CONFERIR'::text OR v_arp_item_contrato_quantidade.fonte_mudou_apos_ajuste) AS total_contratos_a_conferir
           FROM v_arp_item_contrato_quantidade
          GROUP BY v_arp_item_contrato_quantidade.item_key
        ), senasp_participante AS (
         -- Ata de outro órgão em que a SENASP é participante, com a ata assinada informada (migration 114): a base
         -- do saldo continua o registrado da SENASP; o que a ata assinada dá a mais fica com a gerenciadora.
         SELECT o.item_key,
            min(o.situacao) AS situacao,
            sum(o.quantidade_assinada) AS assinada,
            sum(o.gerenciado) AS gerenciado
           FROM v_item_quantitativos_orgaos o
          WHERE o.eh_senasp AND NOT o.ata_da_senasp
          GROUP BY o.item_key
        ), alocado_agg AS (
         -- Soma alocada às unidades internas (migration 116): a tela e os avisos comparam com a base do saldo.
         SELECT al.item_key,
            sum(al.allocated_qty) AS total_alocado
           FROM arp_allocations al
          GROUP BY al.item_key
        ), outros_orgaos AS (
         -- Órgãos que não são a SENASP com quantidade registrada no item (migration 116): sem eles, a ata assinada
         -- não muda o limite da alocação.
         SELECT c.item_key,
            count(*) AS outros
           FROM itens_ata_unidades_copia c
             CROSS JOIN LATERAL registrado_por_uasg(c.unidades) x(uasg, nome_orgao, tipo_unidade, quantidade, incluido_em, atualizado_em)
          WHERE x.uasg::text <> ALL (ARRAY['200330'::text, '200331'::text]) AND x.quantidade > 0::numeric
          GROUP BY c.item_key
        ), itens_canonical AS (
         SELECT i.id AS item_ata_id,
            i.ata_id,
            a.numero_ata,
            a.codigo_uasg,
            a.uasg_carteira,
            a.papel_senasp,
            i.numero_item,
            (((a.numero_ata::text || '-'::text) || a.codigo_uasg::text) || '-'::text) || lpad(i.numero_item::text, 5, '0'::text) AS canonical_item_key,
            i.descricao_item,
            i.fornecedor_razao_social,
            i.fornecedor_cnpj_cpf,
            COALESCE(i.quantidade_homologada, 0::numeric) AS quantidade_homologada,
            i.quantidade_senasp,
            i.valor_unitario
           FROM itens_ata i
             JOIN atas_registro_preco a ON a.id = i.ata_id
        ), base AS (
         SELECT COALESCE(ic.canonical_item_key, ca.item_key::text) AS item_key,
            ic.item_ata_id,
            ic.ata_id,
            COALESCE(ic.numero_ata, split_part(ca.item_key::text, '-'::text, 1)::character varying) AS numero_ata,
            COALESCE(ic.codigo_uasg, split_part(ca.item_key::text, '-'::text, 2)::character varying) AS codigo_uasg,
            COALESCE(ic.numero_item, split_part(ca.item_key::text, '-'::text, 3)::character varying) AS numero_item,
            COALESCE(ic.uasg_carteira, split_part(ca.item_key::text, '-'::text, 2)::character varying) AS uasg_carteira,
            COALESCE(ic.papel_senasp, 'GERENCIADORA'::character varying) AS papel_senasp,
            ic.descricao_item,
            ic.fornecedor_razao_social,
            ic.fornecedor_cnpj_cpf,
            ic.valor_unitario,
            COALESCE(ic.quantidade_homologada, 0::numeric) AS quantidade_homologada,
            ic.quantidade_senasp,
            CASE
                    WHEN vq.item_key IS NOT NULL THEN vq.cota_propria
                    ELSE COALESCE(ic.quantidade_senasp, ic.quantidade_homologada, 0::numeric)
                END - COALESCE(px.desconto, 0::numeric) AS quantidade_base_senasp,
            COALESCE(ic.quantidade_senasp, ic.quantidade_homologada, 0::numeric) AS quantidade_registrada_senasp,
            COALESCE(vq.gerenciado_participantes, 0::numeric) AS gerenciado_participantes,
            vq.item_key IS NOT NULL AS ata_assinada_informada,
            vq.total_assinada,
            vq.total_registrado,
            COALESCE(vq.orgaos_fora_da_ata, 0::bigint) AS orgaos_fora_da_ata,
            COALESCE(vq.orgaos_contratado_acima, 0::bigint) AS orgaos_contratado_acima,
            COALESCE(ca.total_contratado, 0::numeric) AS quantidade_consumida,
            COALESCE(ca.total_contratos_vinculados, 0::bigint) AS total_contratos_vinculados,
            COALESCE(ca.total_contratos_sem_quantidade, 0::bigint) AS total_contratos_sem_quantidade,
            COALESCE(ca.total_contratos_ajustados, 0::bigint) AS total_contratos_ajustados,
            COALESCE(ca.quantidade_contratada_sem_unidade, 0::numeric) AS quantidade_contratada_sem_unidade,
            COALESCE(ca.total_contratos_a_conferir, 0::bigint) AS total_contratos_a_conferir,
            ra.soma_registrado,
            COALESCE(ra.excedente, 0::numeric) AS excedente_registrado,
            COALESCE(px.excedente_senasp, 0::numeric) AS excedente_registrado_senasp,
            COALESCE(px.desconto, 0::numeric) AS desconto_registrado_acima,
            ra.chave_aviso AS registrado_acima_chave,
            ra.resolvido_em IS NOT NULL AS registrado_acima_resolvido
           FROM itens_canonical ic
             FULL JOIN contratos_agg ca ON ca.item_key::text = ic.canonical_item_key
             LEFT JOIN v_item_quantitativos vq ON vq.item_key = ic.canonical_item_key
             LEFT JOIN v_item_registrado_acima ra ON ra.item_key = ic.canonical_item_key
             -- Parte do excedente que está na SENASP (com a ata assinada: o registrado líquido acima dela, até o
             -- excedente; sem ela: todo o excedente, até o registrado) e o desconto enquanto o aviso estiver aberto.
             LEFT JOIN LATERAL (
               SELECT e.excedente_senasp,
                      CASE WHEN ra.resolvido_em IS NULL THEN e.excedente_senasp ELSE 0::numeric END AS desconto
                 FROM (SELECT CASE
                                WHEN vq.item_key IS NOT NULL THEN LEAST(GREATEST(vq.cota_propria - vq.assinada_senasp, 0::numeric), ra.excedente)
                                ELSE LEAST(ra.excedente, GREATEST(COALESCE(ic.quantidade_senasp, ic.quantidade_homologada, 0::numeric), 0::numeric))
                              END AS excedente_senasp) e
                WHERE ra.item_key IS NOT NULL
             ) px ON true
        )
 SELECT b.item_key,
    b.item_ata_id,
    b.ata_id,
    b.numero_ata,
    b.codigo_uasg,
    b.numero_item,
    b.descricao_item,
    b.fornecedor_razao_social,
    b.fornecedor_cnpj_cpf,
    b.valor_unitario,
    b.quantidade_homologada,
    b.quantidade_consumida,
    b.quantidade_base_senasp - b.quantidade_consumida AS saldo_disponivel,
        CASE
            WHEN b.quantidade_base_senasp > 0::numeric THEN round(b.quantidade_consumida / b.quantidade_base_senasp * 100::numeric, 2)
            ELSE 0::numeric
        END AS percentual_consumido,
    COALESCE(e.total_empenhos_vinculados, 0::bigint) AS total_empenhos_vinculados,
    b.total_contratos_vinculados,
    b.total_contratos_sem_quantidade,
    b.quantidade_senasp,
    b.quantidade_base_senasp,
    b.total_contratos_ajustados,
    b.quantidade_contratada_sem_unidade,
    b.total_contratos_a_conferir,
    b.uasg_carteira,
    b.papel_senasp,
    b.quantidade_registrada_senasp,
    b.gerenciado_participantes,
    b.ata_assinada_informada,
    b.total_assinada,
    b.total_registrado,
    b.orgaos_fora_da_ata,
    b.orgaos_contratado_acima,
    sp.situacao AS situacao_senasp_participante,
    sp.assinada AS assinada_senasp_participante,
    COALESCE(sp.gerenciado, 0::numeric) AS gerenciado_pela_gerenciadora,
    COALESCE(al.total_alocado, 0::numeric) AS total_alocado_unidades,
    COALESCE(oo.outros, 0::bigint) AS outros_orgaos_registrados,
    b.soma_registrado,
    b.excedente_registrado,
    b.excedente_registrado_senasp,
    b.desconto_registrado_acima,
    b.registrado_acima_chave,
    b.registrado_acima_resolvido
   FROM base b
     LEFT JOIN empenhado_agg e ON e.item_key::text = b.item_key
     LEFT JOIN senasp_participante sp ON sp.item_key = b.item_key
     LEFT JOIN alocado_agg al ON al.item_key::text = b.item_key
     LEFT JOIN outros_orgaos oo ON oo.item_key::text = b.item_key;

-- 3) Quem resolve: o aviso "Registrado acima do homologado" é do gestor da ata (e do coordenador).
CREATE OR REPLACE FUNCTION public.resolver_aviso(p_chave text, p_tipo text, p_justificativa text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_chave TEXT := btrim(COALESCE(p_chave, ''));
  v_tipo TEXT := upper(btrim(COALESCE(p_tipo, '')));
  v_just TEXT := btrim(COALESCE(p_justificativa, ''));
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin') OR public.has_role('gestor_saldos')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor, coordenador ou gestor de saldo marcam aviso como resolvido.'
      USING ERRCODE = '42501';
  END IF;
  -- Migration 142: registrado acima do homologado é conferido e corrigido pelo gestor da ata.
  IF v_chave LIKE '%::REGISTRADO-ACIMA-%' AND NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Este aviso é resolvido pelo gestor da ata ou pelo coordenador.'
      USING ERRCODE = '42501';
  END IF;

  IF v_tipo NOT IN ('SALDO', 'REAJUSTE', 'LEMBRETE', 'FONTE') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Este tipo de aviso não pode ser marcado como resolvido.' USING ERRCODE = '22023';
  END IF;
  IF v_chave = '' OR length(v_chave) > 300 OR v_chave NOT LIKE v_tipo || '::%' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Aviso não identificado.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_just) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escreva a justificativa com pelo menos 10 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_just) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A justificativa pode ter no máximo 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.avisos_resolvidos (chave, tipo, justificativa, resolvido_por, resolvido_por_nome, resolvido_em)
  VALUES (v_chave, v_tipo, v_just, auth.uid(), public.nome_do_usuario_logado(), NOW())
  ON CONFLICT (chave) DO UPDATE
    SET justificativa = EXCLUDED.justificativa,
        resolvido_por = EXCLUDED.resolvido_por,
        resolvido_por_nome = EXCLUDED.resolvido_por_nome,
        resolvido_em = EXCLUDED.resolvido_em;

  RETURN jsonb_build_object('success', true, 'chave', v_chave);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reexibir_aviso(p_chave text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_chave TEXT := btrim(COALESCE(p_chave, ''));
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin') OR public.has_role('gestor_saldos')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor, coordenador ou gestor de saldo reexibem aviso.'
      USING ERRCODE = '42501';
  END IF;
  IF v_chave LIKE '%::REGISTRADO-ACIMA-%' AND NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Este aviso é reexibido pelo gestor da ata ou pelo coordenador.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.avisos_resolvidos WHERE chave = v_chave;

  RETURN jsonb_build_object('success', true, 'chave', v_chave);
END;
$function$;
