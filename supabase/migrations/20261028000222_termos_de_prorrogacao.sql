-- ==============================================================================
-- Versão: 20261028000222_termos_de_prorrogacao.sql
-- O aviso "registrado acima do homologado" passa a mostrar o que o termo aditivo de prorrogação publicado no PNCP
-- diz sobre o saldo. Em 27/10/2026, 182 dos 185 avisos abertos eram de atas prorrogadas, e os termos lidos dizem
-- que a prorrogação cobre só o saldo não contratado ("abrange apenas o saldo remanescente"): o aumento que o
-- Compras.gov.br mostra depois da prorrogação não tem lastro.
--
-- 1) ata_termos_prorrogacao: um termo por linha (ata, documento do PNCP, título, data, cobertura e a frase).
--    Leitura para usuários ativos; só o servidor grava (gravar_reajuste_fontes).
-- 2) gravar_reajuste_fontes grava os termos que a leitura do reajuste já baixa (sem download a mais).
-- 3) v_ata_termos_prorrogacao: com o número da ata e a UASG, para a tela.
-- 4) Carga dos 94 termos já publicados (86 atas), lidos do PNCP em 27/10/2026: os documentos já lidos pelo reajuste
--    não são lidos de novo.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.ata_termos_prorrogacao (
  ata_id                    UUID         NOT NULL REFERENCES public.atas_registro_preco(id) ON DELETE CASCADE,
  documento_pncp_sequencial INTEGER      NOT NULL,
  documento_titulo          VARCHAR(300),
  documento_publicado_em    DATE,
  cobertura                 VARCHAR(10)  NOT NULL CHECK (cobertura IN ('SALDO', 'RENOVA', 'A_CONFERIR')),
  trecho                    VARCHAR(300),
  lido_em                   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ata_id, documento_pncp_sequencial)
);
COMMENT ON TABLE public.ata_termos_prorrogacao IS
  'Termos aditivos de prorrogação das atas no PNCP e o que dizem sobre o saldo (SALDO = só o saldo não contratado; RENOVA = renova os quantitativos; A_CONFERIR). Grava só gravar_reajuste_fontes (migration 222).';

ALTER TABLE public.ata_termos_prorrogacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated Read: ata_termos_prorrogacao" ON public.ata_termos_prorrogacao;
CREATE POLICY "Authenticated Read: ata_termos_prorrogacao" ON public.ata_termos_prorrogacao FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.ata_termos_prorrogacao;
CREATE POLICY "Somente usuario ativo" ON public.ata_termos_prorrogacao AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
REVOKE ALL ON public.ata_termos_prorrogacao FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ata_termos_prorrogacao TO authenticated;
GRANT ALL ON public.ata_termos_prorrogacao TO service_role;

CREATE OR REPLACE VIEW public.v_ata_termos_prorrogacao
WITH (security_invoker = true)
AS
SELECT a.numero_ata, a.codigo_uasg, a.numero_controle_pncp, a.data_vigencia_final,
       t.documento_pncp_sequencial, t.documento_titulo, t.documento_publicado_em, t.cobertura, t.trecho, t.lido_em
  FROM public.ata_termos_prorrogacao t
  JOIN public.atas_registro_preco a ON a.id = t.ata_id;
REVOKE ALL ON public.v_ata_termos_prorrogacao FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_ata_termos_prorrogacao TO authenticated;
GRANT ALL ON public.v_ata_termos_prorrogacao TO service_role;

CREATE OR REPLACE FUNCTION public.gravar_reajuste_fontes(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ind  INTEGER := 0;
  v_par  INTEGER := 0;
  v_hom  INTEGER := 0;
  v_rea  INTEGER := 0;
  v_a    JSONB;
  v_ata  UUID;
  v_n    INTEGER;
  v_pri  RECORD;
BEGIN
  IF NOT public.eh_service_role() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o servidor grava as fontes do reajuste.' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_payload -> 'projetados_substituir') = 'array' THEN
    DELETE FROM public.indices_precos_mensais
     WHERE tipo = 'PROJETADO'
       AND indice IN (SELECT jsonb_array_elements_text(p_payload -> 'projetados_substituir'));
  END IF;

  INSERT INTO public.indices_precos_mensais (indice, mes, tipo, variacao, fonte, referencia, lido_em)
  SELECT x ->> 'indice', (x ->> 'mes')::DATE, x ->> 'tipo', (x ->> 'variacao')::NUMERIC, x ->> 'fonte',
         NULLIF(x ->> 'referencia', '')::DATE, NOW()
    FROM jsonb_array_elements(COALESCE(p_payload -> 'indices', '[]'::JSONB)) x
  ON CONFLICT (indice, mes, tipo) DO UPDATE
     SET variacao = EXCLUDED.variacao, fonte = EXCLUDED.fonte, referencia = EXCLUDED.referencia, lido_em = NOW();
  GET DIAGNOSTICS v_ind = ROW_COUNT;

  -- Um mês com OFICIAL não precisa mais do PROJETADO.
  DELETE FROM public.indices_precos_mensais p
   WHERE p.tipo = 'PROJETADO'
     AND EXISTS (SELECT 1 FROM public.indices_precos_mensais o WHERE o.indice = p.indice AND o.mes = p.mes AND o.tipo = 'OFICIAL');

  FOR v_a IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload -> 'atas', '[]'::JSONB)) LOOP
    v_ata := (v_a ->> 'ata_id')::UUID;
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.atas_registro_preco WHERE id = v_ata);

    INSERT INTO public.ata_reajuste_parametros (ata_id, indice, clausula, data_orcamento_edital, edital_lido_em,
                                                termo_mes_apostilamento, termo_sei_apostilamento)
    VALUES (v_ata, NULLIF(v_a ->> 'indice', ''), COALESCE(NULLIF(v_a ->> 'clausula', ''), 'A_CONFERIR'),
            NULLIF(v_a ->> 'data_orcamento_edital', '')::DATE,
            CASE WHEN v_a ? 'clausula' THEN NOW() END,
            NULLIF(v_a ->> 'termo_mes_apostilamento', '')::DATE, NULLIF(v_a ->> 'termo_sei_apostilamento', ''))
    ON CONFLICT (ata_id) DO UPDATE
       SET indice = COALESCE(EXCLUDED.indice, ata_reajuste_parametros.indice),
           clausula = CASE WHEN v_a ? 'clausula' THEN EXCLUDED.clausula ELSE ata_reajuste_parametros.clausula END,
           data_orcamento_edital = COALESCE(EXCLUDED.data_orcamento_edital, ata_reajuste_parametros.data_orcamento_edital),
           edital_lido_em = COALESCE(EXCLUDED.edital_lido_em, ata_reajuste_parametros.edital_lido_em),
           termo_mes_apostilamento = COALESCE(EXCLUDED.termo_mes_apostilamento, ata_reajuste_parametros.termo_mes_apostilamento),
           termo_sei_apostilamento = COALESCE(EXCLUDED.termo_sei_apostilamento, ata_reajuste_parametros.termo_sei_apostilamento),
           atualizado_em = NOW();
    v_par := v_par + 1;

    -- Antes de ler o edital, o servidor marca a tentativa: se a leitura derrubar a função, a ata vai para o fim
    -- da fila e, depois de 2 tentativas, o edital fica "a conferir" (ver reajusteAtasSyncService).
    IF COALESCE((v_a ->> 'edital_tentativa')::BOOLEAN, FALSE) THEN
      UPDATE public.ata_reajuste_parametros SET edital_tentativas = edital_tentativas + 1 WHERE ata_id = v_ata;
    END IF;

    INSERT INTO public.itens_ata_preco_homologado (ata_id, numero_item, valor, lido_em)
    SELECT v_ata, h ->> 'numero_item', (h ->> 'valor')::NUMERIC, NOW()
      FROM jsonb_array_elements(COALESCE(v_a -> 'homologados', '[]'::JSONB)) h
     WHERE (h ->> 'valor') IS NOT NULL
    ON CONFLICT (ata_id, numero_item) DO UPDATE SET valor = EXCLUDED.valor, lido_em = NOW();
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hom := v_hom + v_n;

    INSERT INTO public.ata_reajustes (ata_id, origem, efeito_inicio, percentual, periodo_inicio, periodo_fim, indice,
                                      documento_pncp_sequencial, documento_titulo, documento_publicado_em, sei_citado,
                                      sei_citado_conformidade, lido_em)
    SELECT v_ata, 'PNCP', (r ->> 'efeito_inicio')::DATE, NULLIF(r ->> 'percentual', '')::NUMERIC,
           NULLIF(r ->> 'periodo_inicio', '')::DATE, NULLIF(r ->> 'periodo_fim', '')::DATE, NULLIF(r ->> 'indice', ''),
           (r ->> 'documento_pncp_sequencial')::INTEGER, r ->> 'documento_titulo', NULLIF(r ->> 'documento_publicado_em', '')::DATE,
           NULLIF(r ->> 'sei_citado', ''), COALESCE((r ->> 'sei_citado_conformidade')::BOOLEAN, FALSE), NOW()
      FROM jsonb_array_elements(COALESCE(v_a -> 'reajustes', '[]'::JSONB)) r
     -- O mesmo reajuste já gravado a partir de outro documento da ata não entra de novo.
     WHERE NOT EXISTS (
       SELECT 1 FROM public.ata_reajustes x
        WHERE x.ata_id = v_ata
          AND x.documento_pncp_sequencial IS DISTINCT FROM (r ->> 'documento_pncp_sequencial')::INTEGER
          AND x.percentual IS NOT DISTINCT FROM NULLIF(r ->> 'percentual', '')::NUMERIC
          AND x.periodo_inicio IS NOT DISTINCT FROM NULLIF(r ->> 'periodo_inicio', '')::DATE
          AND x.periodo_fim IS NOT DISTINCT FROM NULLIF(r ->> 'periodo_fim', '')::DATE
          AND (x.periodo_inicio IS NOT NULL OR x.efeito_inicio = (r ->> 'efeito_inicio')::DATE))
    ON CONFLICT (ata_id, documento_pncp_sequencial) WHERE documento_pncp_sequencial IS NOT NULL DO UPDATE
       SET documento_titulo = EXCLUDED.documento_titulo,
           documento_publicado_em = EXCLUDED.documento_publicado_em,
           sei_citado = COALESCE(EXCLUDED.sei_citado, ata_reajustes.sei_citado),
           sei_citado_conformidade = EXCLUDED.sei_citado_conformidade OR ata_reajustes.sei_citado_conformidade,
           indice = COALESCE(EXCLUDED.indice, ata_reajustes.indice),
           -- O que o gestor informou fica.
           percentual = CASE WHEN ata_reajustes.informado_por IS NULL THEN EXCLUDED.percentual ELSE ata_reajustes.percentual END,
           periodo_inicio = CASE WHEN ata_reajustes.informado_por IS NULL THEN EXCLUDED.periodo_inicio ELSE ata_reajustes.periodo_inicio END,
           periodo_fim = CASE WHEN ata_reajustes.informado_por IS NULL THEN EXCLUDED.periodo_fim ELSE ata_reajustes.periodo_fim END,
           efeito_inicio = CASE WHEN ata_reajustes.informado_por IS NULL THEN EXCLUDED.efeito_inicio ELSE ata_reajustes.efeito_inicio END,
           lido_em = NOW();
    GET DIAGNOSTICS v_n = ROW_COUNT; v_rea := v_rea + v_n;

    -- Migration 222: termos aditivos de prorrogação (o que dizem sobre o saldo).
    INSERT INTO public.ata_termos_prorrogacao (ata_id, documento_pncp_sequencial, documento_titulo, documento_publicado_em,
                                               cobertura, trecho, lido_em)
    SELECT v_ata, (t ->> 'documento_pncp_sequencial')::INTEGER, left(t ->> 'documento_titulo', 300),
           NULLIF(t ->> 'documento_publicado_em', '')::DATE,
           CASE WHEN t ->> 'cobertura' IN ('SALDO', 'RENOVA') THEN t ->> 'cobertura' ELSE 'A_CONFERIR' END,
           left(NULLIF(t ->> 'trecho', ''), 300), NOW()
      FROM jsonb_array_elements(COALESCE(v_a -> 'termos_prorrogacao', '[]'::JSONB)) t
     WHERE (t ->> 'documento_pncp_sequencial') IS NOT NULL
    ON CONFLICT (ata_id, documento_pncp_sequencial) DO UPDATE
       SET documento_titulo = EXCLUDED.documento_titulo, documento_publicado_em = EXCLUDED.documento_publicado_em,
           cobertura = EXCLUDED.cobertura, trecho = EXCLUDED.trecho, lido_em = NOW();

    -- Documentos lidos e preços homologados lidos.
    IF jsonb_typeof(v_a -> 'documentos_lidos') = 'array' THEN
      UPDATE public.ata_reajuste_parametros p
         SET documentos_pncp_lidos = ARRAY(
               SELECT DISTINCT s FROM unnest(p.documentos_pncp_lidos || ARRAY(SELECT (jsonb_array_elements_text(v_a -> 'documentos_lidos'))::INTEGER)) s
                ORDER BY s),
             documentos_lidos_em = NOW()
       WHERE p.ata_id = v_ata;
    END IF;
    IF COALESCE((v_a ->> 'homologados_completos')::BOOLEAN, FALSE) THEN
      UPDATE public.ata_reajuste_parametros SET homologados_lidos_em = NOW() WHERE ata_id = v_ata;
    END IF;

    -- Mês do Termo de Conformidade: o período do primeiro reajuste começa no mês do termo.
    SELECT r.periodo_inicio, r.sei_citado, r.sei_citado_conformidade INTO v_pri
      FROM public.ata_reajustes r
     WHERE r.ata_id = v_ata AND r.periodo_inicio IS NOT NULL
     ORDER BY r.efeito_inicio, r.periodo_inicio
     LIMIT 1;
    IF FOUND THEN
      UPDATE public.ata_reajuste_parametros
         SET termo_mes_apostilamento = v_pri.periodo_inicio,
             termo_sei_apostilamento = CASE WHEN v_pri.sei_citado_conformidade THEN v_pri.sei_citado ELSE termo_sei_apostilamento END
       WHERE ata_id = v_ata;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'indices', v_ind, 'atas', v_par, 'homologados', v_hom, 'reajustes', v_rea);
END;
$function$;

-- Carga dos termos já publicados (lidos do PNCP em 27/10/2026).
INSERT INTO public.ata_termos_prorrogacao (ata_id, documento_pncp_sequencial, documento_titulo, documento_publicado_em, cobertura, trecho)
SELECT a.id, v.seq, v.titulo, v.pub::DATE, v.cobertura, v.trecho
  FROM (VALUES
  ('00394494000136-1-001197/2024-000008', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 01/2025, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA MIGUEL HERNANDEZ INDÚSTRIA...', '2026-01-06', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001197/2024-000005', 2, 'RIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 02/2025, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA ARBJI COMÉRCIO DE ELETRÔNIC...', '2026-01-06', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001197/2024-000009', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 03/2025, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA LWS TENDAS INDÚSTRIA E COM...', '2026-01-06', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001197/2024-000006', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 04/2025, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA VERTICE COMERCIO DE ROUPAS...', '2026-01-06', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001400/2024-000001', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 05/2025, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA WATERS TECHNOLOGIES DO BRA...', '2025-12-24', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001385/2024-000001', 2, 'Termo Aditivo - prorrogação e reajuste', '2026-02-13', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001410/2024-000002', 2, 'A prorrogação do prazo de validade da Ata, por mais 1 (um) ano, contado a partir do dia 25/3/2026 a 24/3/2027, com lastro no art. 84 da Lei nº 14.133, de 2021 e nos artigos 15, inc. IX, e 22 do Decreto nº 11.462, de 2023;', '2026-03-18', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001410/2024-000001', 2, 'Prorrogação de Vigência', '2026-03-18', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001410/2024-000003', 2, 'Prorrogação de Vigência', '2026-03-18', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000947/2024-000004', 2, 'Termo Aditivo - 1º TA - ARP Nº 11/2025 (34748259)', '2026-03-13', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000947/2024-000006', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS Nº 12/2025, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA EQUILÍBRIO EQUIPAMENTOS DE...', '2026-04-24', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001398/2024-000003', 2, 'Prorrogação de Vigência - ARP nº 13/2025', '2026-03-25', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001398/2024-000004', 2, 'Prorrogação de Vigência - ARP nº 14/2025', '2026-03-25', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001413/2024-000002', 2, 'Termo Aditivo - Prorrogação de vigência e reajuste.', '2026-04-07', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001436/2024-000002', 2, 'Termo Aditivo ARP 18/2025', '2026-04-10', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001436/2024-000001', 2, 'A prorrogação do prazo de validade da Ata, por mais 1 (um) ano, contado a partir do dia 05/04/2026 a 04/04/2027, com lastro no art. 84 da Lei nº 14.133, de 2021 e nos artigos 15, inc. IX, e 22 do Decreto nº 11.462, de 2023; Segue a tabela atualizada...', '2026-04-03', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000947/2024-000007', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS Nº 21/2025, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA PROPARTS COMÉRCIO DE ARTIG...', '2026-04-24', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000947/2024-000008', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS Nº 22/2025, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA DIMORVAN DAVI MENEGUSSO LT...', '2026-08-18', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000709/2024-000001', 2, '1º Termo aditivo ARP 24/2024', '2025-10-09', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000709/2024-000002', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS Nº 25/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA BECATH  SOLUÇÕES INTEGRADA...', '2025-09-03', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001130/2024-000015', 2, 'Prorrogação de Vigência da ARP nº 29/2025', '2026-04-16', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000291/2024-000002', 2, 'TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 31/2025, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA SIG SAUER INC.', '2026-06-24', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000304/2025-000001', 2, 'Prorrogação do prazo de vigência', '2026-06-30', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000304/2025-000002', 3, 'Prorrogação de Vigência ARP nº 33/2025 - Renault', '2026-06-26', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000304/2025-000003', 2, 'Prorrogação de Vigência - ARP nº 34/2025', '2026-06-30', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001436/2024-000004', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS Nº 35/2025 QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA STELLANTIS AUTOMOVEIS BRASI...', '2026-07-15', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000839/2024-000001', 2, 'A prorrogação do prazo de validade da Ata de Registro de Preços n.º 36/2024 (29182920), por mais 1 (um) ano, contado a partir do dia 23/10/2025 a 22/10/2026, com lastro no art. 84 da Lei nº 14.133, de 2021 e nos artigos 15, inc. IX, e 22 do Decreto n...', '2025-10-22', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000839/2024-000001', 3, 'A prorrogação do prazo de validade da Ata de Registro de Preços n.º 36/2024 (29182920), por mais 1 (um) ano, contado a partir do dia 23/10/2025 a 22/10/2026, com lastro no art. 84 da Lei nº 14.133, de 2021 e nos artigos 15, inc. IX, e 22 do Decreto n...', '2025-10-22', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001023/2023-000001', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 37/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA CONDOR S/A INDÚSTRIA QUÍMI...', '2025-12-09', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001023/2023-000001', 3, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 37/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA CONDOR S/A INDÚSTRIA QUÍMI...', '2025-12-12', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000827/2024-000001', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 39/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA MITREN - SISTEMAS E MONTAG...', '2025-10-29', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000827/2024-000002', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 40/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA TRIEL-HT INDUSTRIAL E PART...', '2025-10-29', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000571/2025-000001', 2, 'Prorrogação de Vigência da ARP nº 40/2025', '2026-07-15', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000813/2024-000001', 2, 'TERMO ADITIVO - ARP Nº 41/2024', '2025-11-24', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000450/2025-000005', 2, 'TERMO ADITIVO DE PRORROGAÇÃO E REAJUSTE DA ARP Nº 41/2025.', '2026-08-19', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000820/2024-000001', 2, 'Primeiro Termo Aditivo a ARP nº 0044/2024', '2025-11-07', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000450/2025-000004', 2, 'TERMO ADITIVO DE PRORROGAÇÃO DE VIGÊNCIA E REAJUSTE DA ARP Nº 45/2025.', '2026-08-19', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001398/2024-000005', 2, 'Prorrogação de Vigência da Ata de Registro de Preço nº 46/2025', '2026-07-22', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001233/2024-000001', 2, 'TERMO ADITIVO  - PRORROGAÇÃO DE VIGÊNCIA', '2025-12-29', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001398/2024-000006', 2, 'Prorrogação de Vigência da Ata de Registro de Preços nº 47/2025', '2026-07-22', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000820/2024-000005', 2, 'Primeiro Termo Aditivo a Ata de Registro de Preço nº 48/2024', '2025-11-11', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001115/2024-000001', 2, 'TERMO ADITIVO DE PRORROGAÇÃO DE VIGÊNCIA E REAJUSTE DA ARP 48/2025.', '2026-08-19', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001157/2024-000001', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 49/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA MITREN - SISTEMAS E MONTAG...', '2025-12-09', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000670/2025-000001', 2, 'TERMO ADITIVO DE PRORROGAÇÃO DE VIGÊNCIA E REAJUSTE DA ARP Nº 49/2025.', '2026-08-19', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001157/2024-000002', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 50/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA TRIEL-HT INDUSTRIAL E PART...', '2025-12-09', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001077/2024-000001', 2, 'Termo Aditivo e Apostilamento', '2025-12-16', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001077/2024-000002', 2, 'TERMO ADITIVO - PRORROGAÇÃO DE VIGÊNCIA', '2025-12-12', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000839/2024-000003', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 55/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA MARINE METALÚRGICA LTDA', '2025-12-09', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000839/2024-000003', 3, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 55/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA MARINE METALÚRGICA LTDA Se...', '2026-04-15', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000641/2025-000001', 2, 'A prorrogação do prazo de validade da Ata, por mais 1 (um) ano, contado a partir do dia 23/09/2026 a 22/09/2027, com lastro no art. 84 da Lei nº 14.133, de 2021 e nos artigos 15, inc. IX, e 22 do Decreto nº 11.462, de 2023; Segue a tabela atualizada...', '2026-09-22', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001407/2024-000001', 2, 'Primeiro Termo Aditivo a ARP nº 56/2024', '2025-12-17', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000704/2025-000001', 2, 'Termo Aditivo de Prorrogação de vigência.', '2026-09-14', 'SALDO', 'A presente prorrogação restabelece o saldo remanescente dos itens registrados, com 2.'),
  ('00394494000136-1-001407/2024-000002', 2, 'Primeiro termo Aditivo a Ata de Registro de preços 58/2024.', '2025-12-23', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001407/2024-000002', 3, 'A retificação do prazo de validade da Ata de Registro de Preços nº 58/2024 (30194582), para que passe a ser considerada, nos termos do art. 22 do Decreto nº 11.462, de 2023, do dia 24/12/2024 ao dia 24/12/2025; A prorrogação do prazo de validade da A...', '2026-06-19', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000916/2025-000001', 3, 'Termo Aditivo da ARP', '2026-10-09', 'SALDO', 'A presente prorrogação restabelece o saldo remanescente dos itens registrados, com fulcro nas regras editalícias.'),
  ('00394494000136-1-001544/2024-000001', 2, 'Termo Aditivo _ ARP 60/2024 (33963503)', '2025-12-23', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000291/2024-000001', 3, 'Termo Aditivo - prorrogação de vigência e valores unitários reajustados pelo IPCA.', '2025-12-30', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000839/2024-000002', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 62/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA RC - FOREVER COMÉRCIO DE V...', '2025-12-24', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000839/2024-000004', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 63/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA FORT CAR REBOQUES LTDA-EPP...', '2025-12-24', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001130/2024-000010', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS Nº 64/2024', '2025-12-29', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001130/2024-000010', 3, 'Prorrogação de Vigência', '2026-03-19', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001130/2024-000010', 4, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS Nº 64/2024', '2026-05-20', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001130/2024-000001', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 65/2024', '2025-12-29', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000835/2025-000001', 2, 'Prorrogação de Vigência da ARP nº 65/2025', '2026-10-06', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001130/2024-000003', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 66/2024', '2025-12-29', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001130/2024-000004', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS Nº 67/2024', '2025-12-29', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000835/2025-000002', 2, 'Prorrogar Vigência da ARP nº 67/2025', '2026-10-06', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001130/2024-000017', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 68/2024', '2025-12-29', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001130/2024-000008', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 69/2024', '2025-12-29', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001130/2024-000009', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS Nº 70/2024', '2025-12-29', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001130/2024-000002', 2, 'Prorrogação de Vigência', '2026-03-19', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001130/2024-000005', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 73/2024', '2025-12-29', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000947/2024-000003', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 75/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA DIMORVAN DAVI MENEGUSSO LT...', '2026-01-22', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-000947/2024-000001', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 76/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA RESGATÉCNICA COMÉRCIO DE E...', '2026-08-13', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001265/2024-000001', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 78/2024', '2025-12-23', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001102/2024-000001', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 79/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA 3M GLOBAL CHANNEL SERVICES...', '2025-12-29', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001197/2024-000001', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 81/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA CENTRO DE DISTRIBUIÇÃO E L...', '2025-12-29', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001197/2024-000003', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 82/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA GRIFO QAP COMERCIO VAREJIS...', '2025-12-17', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001197/2024-000004', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 83/2024, QUE FAZEM  ENTRE  SI  A  UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA AMM CORREA.', '2026-04-15', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001407/2024-000003', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 89/2024', '2025-12-23', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001407/2024-000003', 3, 'A retificação do prazo de validade da Ata de Registro de Preços nº 89/2024 (30194603), para que passe a ser considerada, nos termos do art. 22 do Decreto nº 11.462, de 2023, do dia 24/12/2024 ao dia 24/12/2025; A prorrogação do prazo de validade da A...', '2026-06-19', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001132/2024-000006', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 90/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA SIGMETAL INDÚSTRIA DE EQUI...', '2026-01-08', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001132/2024-000001', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 91/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA STAR COMERCIO LTDA.', '2026-01-08', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001132/2024-000003', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 93/2024', '2026-01-15', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001132/2024-000008', 2, 'A prorrogação do prazo de validade da Ata de Registro de Preços 94/2024 (30203768), por mais 1 (um) ano, contado a partir do dia 10/01/2026 à 09/01/2027, com lastro no art. 84 da Lei n.º 14.133, de 2021 e nos artigos 15, inc. IX, e 22 do Decreto n.º...', '2026-01-15', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001132/2024-000010', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 96/2024', '2026-01-15', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001132/2024-000005', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 99/2024', '2026-01-15', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001132/2024-000011', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 100/2024', '2026-01-15', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001169/2024-000005', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 102/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA KADOSHI COMERCIO E REPRES...', '2026-01-19', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001169/2024-000005', 3, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRODE PREÇOS N° 102/2024, QUE FAZEM ENTRE SI AUNIÃO, REPRESENTADA PELO MINISTÉRIO DAJUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIODA SECRETARIA NACIONAL DE SEGURANÇAPÚBLICA E A EMPRESA KADOSHI COMERCIO EREPRESENTACO...', '2026-04-15', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001169/2024-000004', 3, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 103/2024, QUEFAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA ESEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇAPÚBLICA E A EMPRESA ROAL INDÚSTRIA METALÚRGICA L...', '2026-01-21', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001169/2024-000002', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 104/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA GIGANTE RECEM NASCIDO LTD...', '2026-01-16', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001169/2024-000001', 2, 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS N° 105/2024, QUE FAZEM ENTRE SI A UNIÃO, REPRESENTADA PELO MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA, POR INTERMÉDIO DA SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA E A EMPRESA SOLAB CIENTÍFICA EQUIPAME...', '2026-01-16', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.'),
  ('00394494000136-1-001096/2024-000001', 2, 'Termo Aditivo Renovação ARP 108/2024 (34161610)', '2026-01-07', 'SALDO', 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.')
  ) AS v(controle, seq, titulo, pub, cobertura, trecho)
  JOIN public.atas_registro_preco a ON a.numero_controle_pncp = v.controle
ON CONFLICT (ata_id, documento_pncp_sequencial) DO NOTHING;
