-- ==============================================================================
-- Versão: 20261113000301_prazo_de_entrega_da_ata.sql
-- Prazo de entrega pelo Termo de Referência da ata (protótipo aprovado em 13/11/2026).
--
-- O prazo de entrega nasce na ata: lido do TR publicado no PNCP (sugestão) e confirmado pelo gestor da ata ou pelo
-- coordenador na Ata 360. Os contratos da ata herdam o prazo confirmado; o prazo informado no contrato (migration 295,
-- origem CONTRATO) continua valendo acima do da ata.
--
-- 1) ata_prazo_entrega: sugestão lida do TR (leitura CLARO/CONFERIR/SEM_CLAUSULA, trechos, documento, link) e o prazo
--    confirmado (dias, contagem, a partir de, prazo por item, ou "sem prazo de entrega").
-- 2) Carga: 74 compras lidas no PNCP em 12-13/11/2026 (Edital/TR, inclusive zips dentro de zips), para as atas
--    gerenciadas (não as de participante).
-- 3) fisc_regra_do_contrato(contrato) e fisc_dias_do_item(regra, item): regra que vale para o contrato (a dele ou a
--    das atas, quando as confirmadas concordam; senão "conflito").
-- 4) Gatilho e RPCs do prazo (migration 295) passam a usar a regra herdada.
-- 5) confirmar_prazo_entrega_ata: gestor da ata ou coordenador; aplica a data aos itens que já podem tê-la (assinatura
--    do contrato; emissão da Ordem para itens na Ordem).
-- 6) Leituras: fisc_contratos_para_distribuicao e fisc_entregas_lista com a regra herdada.
-- ==============================================================================

-- 1) Prazo de entrega da ata ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ata_prazo_entrega (
  ata_key             VARCHAR(50) PRIMARY KEY,
  numero_ata          VARCHAR(20) NOT NULL,
  uasg                VARCHAR(6),
  leitura             VARCHAR(12) CHECK (leitura IS NULL OR leitura IN ('CLARO', 'CONFERIR', 'SEM_CLAUSULA')),
  leitura_motivo      TEXT,
  sugerido_dias       INTEGER,
  sugerido_contagem   VARCHAR(8),
  contagem_dita       BOOLEAN NOT NULL DEFAULT FALSE,
  sugerido_inicio     VARCHAR(15),
  trechos             TEXT[] NOT NULL DEFAULT '{}',
  documento           TEXT,
  url                 TEXT,
  lido_em             TIMESTAMPTZ,
  sem_prazo           BOOLEAN NOT NULL DEFAULT FALSE,
  dias                INTEGER,
  contagem            VARCHAR(8),
  inicio              VARCHAR(15),
  por_item            JSONB NOT NULL DEFAULT '{}'::JSONB,
  motivo              TEXT,
  confirmado_por      UUID,
  confirmado_por_nome VARCHAR(200),
  confirmado_em       TIMESTAMPTZ,
  CONSTRAINT ata_prazo_entrega_regra CHECK (
    confirmado_em IS NULL OR sem_prazo
    OR (dias BETWEEN 1 AND 730 AND contagem IN ('CORRIDOS', 'UTEIS') AND inicio IN ('OF_RECEBIMENTO', 'OF_EMISSAO', 'ASSINATURA', 'EXERCITO')))
);
COMMENT ON TABLE public.ata_prazo_entrega IS
  'Prazo de entrega da ata (migration 301): sugestão lida do Termo de Referência no PNCP e o prazo confirmado pelo gestor da ata. Os contratos da ata herdam. Grava só pela RPC confirmar_prazo_entrega_ata.';

ALTER TABLE public.ata_prazo_entrega ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated Read: ata_prazo_entrega" ON public.ata_prazo_entrega;
CREATE POLICY "Authenticated Read: ata_prazo_entrega" ON public.ata_prazo_entrega FOR SELECT TO authenticated USING (TRUE);
REVOKE ALL ON public.ata_prazo_entrega FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ata_prazo_entrega TO authenticated;
DROP TRIGGER IF EXISTS trg_audit_ata_prazo_entrega ON public.ata_prazo_entrega;
CREATE TRIGGER trg_audit_ata_prazo_entrega AFTER INSERT OR UPDATE OR DELETE ON public.ata_prazo_entrega
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

-- 2) Carga da leitura do TR (cnpj, ano, sequencial da compra, leitura, motivo, dias, contagem, contagem dita, a partir de,
--    trechos, documento, link) ----------------------------------------------------------------------------------------
WITH lido (cnpj, ano, seq, leitura, motivo, dias, contagem, dita, inicio, trechos, documento, url) AS (VALUES
  ('00489828000155', '2023', '000108', 'CONFERIR', 'o mesmo trecho tem mais de um prazo (por destino ou por item)', 60, 'CORRIDOS', TRUE, 'OF_RECEBIMENTO', ARRAY['A Entrega dos equipamentos deverá ser efetivada no prazo máximo de 60 dias corridos para as capitais dos estados e de 75 dias corridos para as demais localidades, a contar do recebimento da Ordem de Fornecimento de Bens (OFB), emitida pelo CONTRATANTE, podendo ser prorrogada, exc']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00489828000155/2023/108'),
  ('00394494000136', '2023', '001023', 'CLARO', NULL, 30, 'CORRIDOS', FALSE, 'ASSINATURA', ARRAY['O prazo de entrega dos bens é de 30 (trinta) dias, contados da assinatura do contrato, em remessa única']::TEXT[], 'Termo de Referência (30/2024.pdf)', 'https://pncp.gov.br/app/editais/00394494000136/2023/1023'),
  ('00394494000136', '2024', '000291', 'SEM_CLAUSULA', 'cláusula de entrega não encontrada', NULL, NULL, FALSE, NULL, ARRAY[]::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/291'),
  ('00394494010441', '2024', '000347', 'SEM_CLAUSULA', 'cláusula de entrega não encontrada', NULL, NULL, FALSE, NULL, ARRAY[]::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494010441/2024/347'),
  ('00394494000136', '2024', '000390', 'CLARO', NULL, 90, 'CORRIDOS', FALSE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens é de 90 (noventa) dias, contados do(a) ordem do fornecimento dos bens, em remessa única, com instalação']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/390'),
  ('00394494000136', '2024', '000434', 'SEM_CLAUSULA', 'cláusula de entrega não encontrada', NULL, NULL, FALSE, NULL, ARRAY[]::TEXT[], 'Termo de Referência (Termo de Referencia 16-2024.pdf)', 'https://pncp.gov.br/app/editais/00394494000136/2024/434'),
  ('00394494000136', '2024', '000709', 'CONFERIR', 'trechos contam de pontos diferentes', 60, 'CORRIDOS', TRUE, 'OF_RECEBIMENTO', ARRAY['O prazo de entrega dos bens é de até 60 (sessenta) dias, contados do recebimento da ordem de fornecimento, em remessa única','O prazo de entrega dos aparelhos será de 60 (sessenta) dias corridos, contados da assinatura do contrato, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/709'),
  ('00394494000136', '2024', '000808', 'CONFERIR', 'o mesmo trecho tem mais de um prazo (por destino ou por item)', 180, 'CORRIDOS', FALSE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens serão de 140 (cento e quarenta) para espingarda e 180 (cento e oitenta) dias para fuzil, contados da emissão da ordem de autorização, em remessa única, podendo ser fracionada em lotes de 100 (cem) armas, com intervalo máximo de até 30 (trinta) dias e']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/808'),
  ('00394494000136', '2024', '000813', 'CONFERIR', 'não diz a partir de quando conta', 3, 'UTEIS', TRUE, NULL, ARRAY['O prazo máximo para entrega do QAV, será imediato no momento da solicitação pelo contratante, quando na boca do tanque da aeronave (BTA) ou boca do tanque (BT), e quando a granel, 3 (três) dias a contar da emissão da nota de pedido, para entregas em dias úteis durante o horário c']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/813'),
  ('00394494000136', '2024', '000820', 'CLARO', NULL, 60, 'CORRIDOS', FALSE, 'ASSINATURA', ARRAY['O prazo de entrega dos bens é de 60 (sessenta) dias, contados da assinatura do contrato, em remessa única','O prazo de entrega será de 60 (sessenta) dias, contados da assinatura do contrato, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/820'),
  ('00394494000136', '2024', '000827', 'CONFERIR', 'trechos com prazos diferentes: 8 dias, 10 dias, 280 dias', 280, 'UTEIS', TRUE, 'OF_RECEBIMENTO', ARRAY['O prazo de entrega dos bens é de 280 (duzentos e oitenta) dias, contados do recebimento da ordem de fornecimento, em remessa única','A CONTRATADA deverá comunicar ao Contratante, no prazo máximo de 48 (quarenta e oito) horas antecedentes à data da entrega, os motivos que impossibilitem o cumprimento do prazo previsto, com a devida comprovação, se for caso, sendo o prazo prorrogado por no máximo 8 dias úteis']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/827'),
  ('00394494000136', '2024', '000839', 'CONFERIR', 'trechos com prazos diferentes: 5 dias, 60 dias, 180 dias', 180, 'CORRIDOS', TRUE, 'ASSINATURA', ARRAY['O prazo de entrega para as lanchas, equipamentos e acessório (inclusive carreta) - itens 01 e 02 - será de 180 (cento e oitenta) dias corridos, contados da assinatura do contrato, em remessa única','O prazo de entrega para as lanchas, equipamentos e acessórios - item 01 e 02 - será de 180 (cento e oitenta) dias corridos, contados da assinatura do contrato, em remessa única','Já o prazo de entrega da moto aquática com equipamentos e acessórios - item 03 - e carreta de transporte rodoviário - itens 04 e 05 - será de 60 (sessenta) dias corridos, contados da assinatura do contrato, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/839'),
  ('00394494000136', '2024', '000905', 'CONFERIR', 'o mesmo trecho tem mais de um prazo (por destino ou por item)', 90, 'CORRIDOS', FALSE, 'OF_EMISSAO', ARRAY['Dessa forma, considerando que há um prazo de entrega previsto de 90 dias (Itens 1 e 2) e 45 dias (Item 3), a ser contado a partir da emissão da Ordem de Fornecimento de Bens e a certeza que a empresa fornecerá a solução, é possível requerer e obter a autorização oportunamente','O prazo de entrega contados do(a) recebimento dado Grupo 1 é de 90 (noventa) dias, ordem de de fornecimento de bens , em remessa única','O prazo de entrega contados do(a) recebimento dado Item 3 (Fuzil Jammer Anti-Drone) é de 45 (quarenta e cinco) dias, , em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/905'),
  ('00394494000136', '2024', '000947', 'CONFERIR', 'trechos contam de pontos diferentes', 60, 'UTEIS', TRUE, 'OF_RECEBIMENTO', ARRAY['O prazo de entrega dos bens é de 60 (sessenta) dias úteis, contados do recebimento da Ordem de Fornecimento de Material, emitida pela contratante, podendo ser prorrogada, excepcionalmente, por até igual período, desde que justificado previamente pelo contratado e autorizado pel','O prazo de entrega dos bens será de 60 (noventa) dias, contados da assinatura do contrato, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/947'),
  ('00394494000136', '2024', '001048', 'CLARO', NULL, 90, 'CORRIDOS', FALSE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens serão de 90 (noventa) dias, contados da emissão da ordem de autorização, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/1048'),
  ('00394494000136', '2024', '001077', 'CONFERIR', 'trechos contam de pontos diferentes', 90, 'CORRIDOS', FALSE, 'OF_RECEBIMENTO', ARRAY['O prazo de entrega dos bens é de 90 (noventa) dias, contados do recebimento da ordem de fornecimento, em remessa única','Local de Entrega UASG 200331 Estudo Técnico Preliminar 41/2024 4 de 26 O prazo de entrega dos bens será de 90 (noventa) dias, contados a partir da assinatura do contrato, recebimento da nota de empenho, da ordem de fornecimento e da Autorização do Exército Brasileiro, o que ocorr']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/1077'),
  ('00394494000136', '2024', '001096', 'SEM_CLAUSULA', 'cláusula de entrega não encontrada', NULL, NULL, FALSE, NULL, ARRAY[]::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/1096'),
  ('00394494000136', '2024', '001097', 'CLARO', NULL, 180, 'CORRIDOS', FALSE, 'OF_RECEBIMENTO', ARRAY['O prazo de entrega será de 180 (cento e oitenta) dias, contados do recebimento da Ordem de Fornecimento de Bens-OFB, em remessa única conforme o quantitativo a ser empenhado por ocasião da emissão da referida ordem, nos seguintes endereços: Depósito de Suprimentos da Força Naci']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/1097'),
  ('00394494000136', '2024', '001102', 'CONFERIR', 'trechos com prazos diferentes: 120 dias, 180 dias', 180, 'CORRIDOS', FALSE, 'OF_RECEBIMENTO', ARRAY['O prazo de entrega dos bens é de , contados do recebimento da ordem de fornecimento ou da180 (cento e oitenta) dias licença de exportação do país de origem do equipamento, o que ocorrer por último, em remessa única, nos endereços que serão fornecidos pelo órgão contratante','O prazo de entrega dos bens serão de 120 (cento e vinte) dias, contados da emissão da ordem de autorização, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/1102'),
  ('00394494000136', '2024', '001112', 'SEM_CLAUSULA', 'cláusula de entrega não encontrada', NULL, NULL, FALSE, NULL, ARRAY[]::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/1112'),
  ('00394494000136', '2024', '001115', 'SEM_CLAUSULA', 'cláusula de entrega não encontrada', NULL, NULL, FALSE, NULL, ARRAY[]::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/1115'),
  ('00394494000136', '2024', '001130', 'CLARO', NULL, 90, 'CORRIDOS', FALSE, 'OF_EMISSAO', ARRAY['realizar a entrega dos equipamentos de mergulho, busca e salvamento, no prazo de 90 (noventa) dias, contados da assinatura do contrato ou da emissão da nota de empenho, podendo ser prorrogado por igual período, essa prorrogação poderá ser solicitada pelo licitante e será concedid']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/1130'),
  ('00394494000136', '2024', '001132', 'CONFERIR', 'trechos com prazos diferentes: 120 dias, 150 dias', 120, 'CORRIDOS', TRUE, 'ASSINATURA', ARRAY['O prazo de entrega dos bens é de 120 (cento e vinte) dias corridos, contados do recebimento da assinatura do contrato, em remessa única','O prazo de entrega dos bens serão de 120 (cento e vinte) dias, contados da emissão da ordem de autorização, em remessa única','O prazo de entrega dos bens é de até 150 (cento de cinquenta) dias, contados da assinatura do contrato, em remessa única ou parcelada, nas demandas do órgão gerenciador e órgãos par cipantes do registro de preços, nos endereços listados de cada par cipante/gerenciador, conforme']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/1132'),
  ('00394494000136', '2024', '001157', 'CONFERIR', 'trechos com prazos diferentes: 8 dias, 10 dias, 280 dias', 280, 'UTEIS', TRUE, 'OF_RECEBIMENTO', ARRAY['O prazo de entrega dos bens é de 280 (duzentos e oitenta) dias, contados do recebimento da ordem de fornecimento, em remessa única','A CONTRATADA deverá comunicar ao Contratante, no prazo máximo de 48 (quarenta e oito) horas antecedentes à data da entrega, os motivos que impossibilitem o cumprimento do prazo previsto, com a devida comprovação, se for o caso, sendo o prazo prorrogado por no máximo 8 dias úteis']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/1157'),
  ('00394494000136', '2024', '001169', 'CLARO', NULL, 30, 'CORRIDOS', FALSE, 'ASSINATURA', ARRAY['O prazo de entrega dos bens é de 30 (trinta) dias, contados da assinatura do contrato, em remessa única','O prazo de entrega dos itens será de 30 (trinta) dias, contados da assinatura do contrato, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/1169'),
  ('00394494000136', '2024', '001197', 'CLARO', NULL, 30, 'CORRIDOS', TRUE, 'OF_RECEBIMENTO', ARRAY['O prazo de entrega dos bens é de até 30 (trinta) dias, contados do recebimento da ordem de fornecimento, em remessa única','O(trinta) dias corridos prazo de entrega poderá ser prorrogável por mais 30 (trinta) dias corridos por meio de manifestação por escrito da licitante, justificando os motivos de caso fortuito ou de força maior, comprovando que não houve culpa no descumprimento do prazo estabelecid']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/1197'),
  ('00394494000136', '2024', '001233', 'CONFERIR', 'o mesmo trecho tem mais de um prazo (por destino ou por item)', 180, 'CORRIDOS', FALSE, 'ASSINATURA', ARRAY['O prazo de entrega dos bens é de até 180 (oitenta) dias, devendo a entrega parcial ou de pequeno volume ser em até 90 dias, contados da assinatura do contrato, em remessa única']::TEXT[], 'Termo de Referência (87/2024.pdf)', 'https://pncp.gov.br/app/editais/00394494000136/2024/1233'),
  ('00394494000136', '2024', '001264', 'CONFERIR', 'o mesmo trecho tem mais de um prazo (por destino ou por item)', 120, 'CORRIDOS', TRUE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens será de até 120 (cento e vinte) dias corridos, prorrogáveis por mais 30 (trinta) dias corridos, se em caso de manifestação por escrito da licitante, justificando os motivos de caso fortuito ou de força maior, antes de seu vencimento, comprovando que','O prazo de entrega dos bens é de até 120 dias, contados do(a) emissão da Ordem de Serviço, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/1264'),
  ('00394494000136', '2024', '001265', 'CONFERIR', 'trechos contam de pontos diferentes', 30, 'UTEIS', TRUE, 'ASSINATURA', ARRAY['A entrega dos equipamentos deverá ser efetivada no prazo máximo de 30 (trinta) dias úteis, a contar da assinatura do contrato, que tem força de ordem de fornecimento de bens, podendo ser prorrogada, excepcionalmente, por até igual período, desde que justificado previamente pelo c','O prazo de entrega dos bens é de 30 (trinta) dias úteis, contados da assinatura do contrato, que tem força de ordem de fornecimento de bens, em remessa única','A Entrega dos equipamentos deverá ser efetivada no prazo máximo de 30 (trinta) dias úteis, a contar do recebimento da Ordem de Fornecimento de Bens (OFB), emitida pela contratante, podendo ser prorrogada, excepcionalmente, por até igual período, desde que justificado previamente']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/1265'),
  ('00394494000136', '2024', '001385', 'CONFERIR', 'um trecho diz dias corridos e outro dias úteis', 30, 'CORRIDOS', TRUE, 'OF_RECEBIMENTO', ARRAY['A Entrega do objeto deverá ser efetivada no prazo máximo de 30 (trinta) dias corridos, a contar do recebimento da Solicitação de Fornecimento Ordem de Material/Serviço, emitida pela contratante, podendo ser prorrogada, excepcionalmente, por até igual período, desde que justifica','O prazo de entrega dos objetos é de 30 (trinta) dias úteis, contados do(a) do recebimento da Ordem de Serviço, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/1385'),
  ('00394494000136', '2024', '001398', 'CLARO', NULL, 90, 'CORRIDOS', TRUE, 'EXERCITO', ARRAY['O prazo de entrega dos bens é de até 90 (noventa) dias corridos, contados da solicitação feita por meio da ordem de fornecimento, em remessa única','Ademais, no caso em que se tratar de material controlado pelo Exército Brasileiro, a contagem do prazo de 90 (noventa) dias para entrega terá contagem iniciada após a emissão da autorização do Exército Brasileiro','Prazo e Local de Entrega O prazo de entrega dos bens será de 90 (noventa) dias, contados da solicitação feita por meio da ordem de fornecimento, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/1398'),
  ('00394494000136', '2024', '001400', 'CONFERIR', 'trechos contam de pontos diferentes', 120, 'CORRIDOS', TRUE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens é de 120 dias, contados do(a) ordem de fornecimento, em remessa única','O prazo de entrega dos bens é de 120 (cento e vinte) dias corridos contados do recebimento da ordem de fornecimento']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/1400'),
  ('00394494000136', '2024', '001407', 'CLARO', NULL, 90, 'CORRIDOS', FALSE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens é de 90 (noventa) dias, contados da emissão da ordem de serviço, em remessa única']::TEXT[], 'Termo de Referência (95/2024.pdf)', 'https://pncp.gov.br/app/editais/00394494000136/2024/1407'),
  ('00394494000136', '2024', '001408', 'CLARO', NULL, 90, 'CORRIDOS', FALSE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens é de 90 (noventa) dias, contados da emissão da ordem de serviço, em remessa única']::TEXT[], 'Termo de Referência (93/2024.pdf)', 'https://pncp.gov.br/app/editais/00394494000136/2024/1408'),
  ('00394494000136', '2024', '001410', 'CONFERIR', 'trechos contam de pontos diferentes', 90, 'CORRIDOS', TRUE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens é de 90 (noventa) dias, contados da emissão da ordem de serviço, em remessa única','O prazo de entrega dos bens é de 90 (noventa) dias corridos contados do recebimento da ordem de fornecimento']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/1410'),
  ('00394494000136', '2024', '001413', 'CLARO', NULL, 180, 'CORRIDOS', FALSE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens é de 180 (cento e oitenta) dias, contados da 5','O prazo de entrega dos bens serão de 180 (cento e oitenta) dias, contados da emissão da ordem de fornecimento']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/1413'),
  ('00394494000136', '2024', '001431', 'CLARO', NULL, 90, 'CORRIDOS', FALSE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens é de 90 (noventa) dias, contados da emissão da ordem de serviço, em remessa única']::TEXT[], 'Termo de Referência (94/2024.pdf)', 'https://pncp.gov.br/app/editais/00394494000136/2024/1431'),
  ('00394494000136', '2024', '001436', 'CONFERIR', 'o mesmo trecho tem mais de um prazo (por destino ou por item)', 180, 'CORRIDOS', FALSE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens será de 180 dias para lotes de até 100 unidades, e 220 dias para lotes em quantidades superiores, contados da emissão da ordem de autorização, em remessa única','O prazo de entrega dos bens é de 180 (cento e oitenta) dias para lotes de até 100 unidades e, 220 (duzentos e vinte) dias para lotes acima 100 unidades, contados da assinatura do contrato, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2024/1436'),
  ('00394494000136', '2024', '001544', 'SEM_CLAUSULA', 'cláusula de entrega não encontrada', NULL, NULL, FALSE, NULL, ARRAY[]::TEXT[], 'Termo de Referência (TR200331_000063_2024.pdf)', 'https://pncp.gov.br/app/editais/00394494000136/2024/1544'),
  ('00394494000136', '2025', '000219', 'CLARO', NULL, 120, 'CORRIDOS', TRUE, 'OF_RECEBIMENTO', ARRAY['O prazo de entrega dos bens é de 120 dias, contados do recebimento da ordem de fornecimento, nos endereços que serão fornecidos pelo órgão contratante','O prazo de entrega dos bens é de 120 (cento e vinte) dias corridos contados do recebimento da ordem de fornecimento']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/219'),
  ('00394494000136', '2025', '000220', 'CONFERIR', 'trechos com prazos diferentes: 120 dias, 150 dias', 120, 'CORRIDOS', TRUE, 'ASSINATURA', ARRAY['O prazo de entrega dos bens é de 120 (cento e vinte) dias corridos, contados do recebimento da assinatura do contrato, em remessa única','O prazo de entrega dos bens serão de 120 (cento e vinte) dias, contados da emissão da ordem de autorização, em remessa única','O prazo de entrega dos bens é de até 150 (cento de cinquenta) dias, contados da assinatura do contrato, em remessa única ou parcelada, nas demandas do órgão gerenciador e órgãos participantes do registro de preços, nos endereços listados de cada participante/gerenciador, confor']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/220'),
  ('00394494000136', '2025', '000304', 'CONFERIR', 'prazo escalonado pela quantidade', 180, 'CORRIDOS', FALSE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens será de 180 dias para lotes de até 50 unidades, acrescidos de 30 dias a cada 20 unidades, contados da emissão da ordem de autorização, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/304'),
  ('00394494000136', '2025', '000322', 'CONFERIR', 'trechos com prazos diferentes: 15 dias, 120 dias', 120, 'CORRIDOS', TRUE, 'OF_RECEBIMENTO', ARRAY['Embalagem O prazo de entrega dos bens é de 120 (cento e vinte) dias corridos, contados do recebimento da Ordem de Fornecimento de Bens (OFB), em remessa única, conforme o quantitativo a ser empenhado por ocasião da emissão da referida ordem, nos seguintes endereços: DFNSP: Depósi','O prazo de entrega dos bens é de 120 (cento e vinte) dias corridos, contados do recebimento da Ordem de Fornecimento de Bens-OFB, em remessa única','O prazo de entrega poderá ser prorrogado, a critério da Administração (Comissão de Fiscalização do Contrato), desde que solicitada no mínimo com 15 (quinze) dias antes do término do prazo de entrega original']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/322'),
  ('00394494000136', '2025', '000450', 'CLARO', NULL, 30, 'CORRIDOS', TRUE, 'OF_RECEBIMENTO', ARRAY['O prazo de entrega dos bens é de até 30 (trinta) dias, contados do recebimento da ordem de fornecimento, em remessa única','O(trinta) dias corridos prazo de entrega poderá ser prorrogável por mais 30 (trinta) dias corridos por meio de manifestação por escrito da licitante, justificando os motivos de caso fortuito ou de força maior, comprovando que não houve culpa no descumprimento do prazo estabelecid']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/450'),
  ('00394494000136', '2025', '000571', 'CONFERIR', 'trechos contam de pontos diferentes', 30, 'CORRIDOS', FALSE, 'ASSINATURA', ARRAY['A Entrega dos equipamentos deverá ser efetivada no prazo máximo de 30 (trinta dias) dias, a contar da assinatura do contrato, que tem força de ordem de fornecimento de bens, podendo ser prorrogada, excepcionalmente, por até igual período, desde que justificado previamente pelo co','O prazo de entrega dos bens é de 30 (trinta) dias, contados da assinatura do contrato ou instrumento equivalente, em remessa única','O prazo de entrega dos bens serão de 30 (trinta) dias, contados da emissão da ordem de autorização, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/571'),
  ('00394494000136', '2025', '000641', 'CONFERIR', 'trechos com prazos diferentes: 120 dias, 180 dias', 180, 'CORRIDOS', FALSE, 'OF_RECEBIMENTO', ARRAY['O prazo de entrega dos bens é de , contados do recebimento da ordem de fornecimento ou da180 (cento e oitenta) dias licença de exportação do país de origem do equipamento, o que ocorrer por último, em remessa única, nos endereços que serão fornecidos pelo órgão contratante','O prazo de entrega dos bens serão de 120 (cento e vinte) dias, contados da emissão da ordem de autorização, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/641'),
  ('00394494000136', '2025', '000669', 'CLARO', NULL, 30, 'CORRIDOS', TRUE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens é de , contados do(a) assinatura do30 (trinta) dias corridos Contrato e/ou da emissão da nota de empenho, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/669'),
  ('00394494000136', '2025', '000670', 'CLARO', NULL, 60, 'CORRIDOS', FALSE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens serão de 60 (sessenta) dias, contados da emissão da ordem de autorização, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/670'),
  ('00394494000136', '2025', '000675', 'CONFERIR', 'um trecho diz dias corridos e outro dias úteis', 30, 'UTEIS', TRUE, 'OF_RECEBIMENTO', ARRAY['A entrega dos objetos deverá ser efetivada no prazo máximo de 30 (trinta) dias corridos, em remessa única, a contar do recebimento da Ordem de Fornecimento de Bens ou Serviço, emitida pela contratante, podendo ser prorrogada, excepcionalmente, por até igual período, desde que jus','A entrega dos serviços deverá ser efetivada no prazo máximo de 30 (trinta) dias úteis, a contar do recebimento da Ordem de Fornecimento de Bens ou Serviço, emitida pela contratante, podendo ser prorrogada, excepcionalmente, por até igual período, desde que justificado previamente','A Entrega do objeto deverá ser efetivada no prazo máximo de , a contar30 (trinta) dias úteis do recebimento da Solicitação de Fornecimento Ordem de Material/Serviço, emitida pela contratante, podendo ser prorrogada, excepcionalmente, por até igual período, desde que justificado']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/675'),
  ('00394494000136', '2025', '000704', 'CONFERIR', 'prazo escalonado pela quantidade', 180, 'CORRIDOS', FALSE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens será de 180 dias para lotes de até 50 unidades, acrescidos de 30 dias a cada 20 unidades, contados da emissão da ordem de autorização, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/704'),
  ('00394494000136', '2025', '000724', 'CONFERIR', 'prazo escalonado pela quantidade', 180, 'CORRIDOS', FALSE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens será de 180 dias para lotes de até 50 unidades, acrescidos de 30 dias a cada 20 unidades, contados da emissão da ordem de autorização, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/724'),
  ('00394494000136', '2025', '000835', 'CONFERIR', 'prazo escalonado pela quantidade', 180, 'CORRIDOS', FALSE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens será de 180 dias para lotes de até 50 unidades, acrescidos de 30 dias a cada 20 unidades, contados da emissão da ordem de autorização, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/835'),
  ('00394494000136', '2025', '000916', 'CONFERIR', 'trechos com prazos diferentes: 30 dias, 60 dias', 60, 'CORRIDOS', TRUE, 'OF_RECEBIMENTO', ARRAY['A entrega dos equipamentos deverá ser efetivada no prazo máximo de 60 (sessenta) dias corridos, a contar do recebimento da Ordem de Fornecimento de Bens, emitida pela contratante, podendo ser prorrogada, excepcionalmente, por até igual período, desde que justificado previamente p','A Entrega dos equipamentos deverá ser efetivada no prazo máximo de 60 (sessenta) dias corridos, a contar do recebimento da Ordem de Fornecimento de Bens (OFB), emitida pela contratante, podendo ser prorrogada, excepcionalmente, por até igual período, desde que justificado previam','A entrega dos equipamentos deverá ser efetivada no prazo máximo de 30 (trinta) dias úteis, a contar do recebimento da Ordem de Fornecimento de Bens ou Serviço, emitida pela contratante, podendo ser prorrogada, excepcionalmente, por até igual período, desde que justificado previam']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/916'),
  ('00394494000136', '2025', '000996', 'SEM_CLAUSULA', 'cláusula de entrega não encontrada', NULL, NULL, FALSE, NULL, ARRAY[]::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/996'),
  ('00394494000136', '2025', '001038', 'CLARO', NULL, 90, 'CORRIDOS', FALSE, 'EXERCITO', ARRAY['Prazo e Local de Entrega O prazo de entrega dos bens será de 90 (noventa) dias, contados da solicitação feita por meio da ordem de fornecimento, em remessa única','Ademais, no caso em que se tratar de material controlado pelo Exército Brasileiro, a contagem do prazo de 90 (noventa) dias para entrega terá contagem iniciada após a emissão da autorização do Exército Brasileiro']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/1038'),
  ('00394494000136', '2025', '001102', 'CLARO', NULL, 15, 'CORRIDOS', TRUE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens é de 15 (quinze) dias corridos, contados do(a) assinatura do contrato e/ou emissão da nota de empenho, em remessa única','Prazo de entrega é de 15 (quinze) dias corridos a partir da assinatura do contrato ou emissão da nota de empenho']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/1102'),
  ('00394494000136', '2025', '001176', 'CONFERIR', 'trechos com prazos diferentes: 5 dias, 30 dias', 30, 'CORRIDOS', TRUE, 'OF_RECEBIMENTO', ARRAY['A Entrega do objeto deverá ser efetivada no prazo máximo de , a contar do30 (trinta) dias corridos recebimento da Solicitação de Fornecimento Ordem de Material/Serviço conforme anexo II deste TR, emitida pela contratante, podendo ser prorrogada, excepcionalmente, por até igual p','O prazo de entrega dos objetos é de , contados do recebimento da Ordem de30 (trinta) dias corridos Serviço (anexo II), podendo ser prorrogada, excepcionalmente, por até igual período, desde que justificado previamente pela Contratada e autorizado pela Contratante','A Entrega do objeto deverá ser efetivada no prazo máximo de corridos, a contar30 (trinta) dias do recebimento da Solicitação de Fornecimento Ordem de Material/Serviço, emitida pela contratante, podendo ser prorrogada, excepcionalmente, por até igual período, desde que justificad']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/1176'),
  ('00394494000136', '2025', '001264', 'SEM_CLAUSULA', 'cláusula de entrega não encontrada', NULL, NULL, FALSE, NULL, ARRAY[]::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/1264'),
  ('00394494000136', '2025', '001276', 'CONFERIR', 'trechos com prazos diferentes: 5 dias, 30 dias', 30, 'CORRIDOS', TRUE, 'OF_RECEBIMENTO', ARRAY['A Entrega dos equipamentos deverá ser efetivada no prazo máximo de 30 (trinta) dias corridos para as capitais dos estados dos órgãos participes, a contar do recebimento da Ordem de Fornecimento de Bens (OFB), emitida pela Contratante, podendo ser prorrogada, excepcionalmente, por','O prazo de entrega dos bens é de 30 (trinta) dias corridos, a contar do recebimento da Solicitação de Fornecimento Ordem de Material/Serviço, emitida pela contratante, podendo ser prorrogada, excepcionalmente, por até igual período, desde que justificado previamente pela Contra','A Entrega do objeto deverá ser efetivada no prazo máximo de 30 (trinta) dias corridos, a contar do recebimento da Solicitação de Fornecimento Ordem de Material/Serviço, emitida pela contratante, podendo ser prorrogada, excepcionalmente, por até igual período, desde que justifica']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/1276'),
  ('00394494000136', '2025', '001313', 'CONFERIR', 'trechos contam de pontos diferentes', 30, 'UTEIS', TRUE, 'OF_RECEBIMENTO', ARRAY['O prazo de entrega dos bens é de , contados do recebimento da ordem de serviço, em30 (trinta) dias úteis remessa única','O prazo de entrega será de 30 (trinta) dias úteis, contados da ordem de fornecimento']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/1313'),
  ('00394494000136', '2025', '001331', 'CONFERIR', 'prazo escalonado pela quantidade', 250, 'CORRIDOS', TRUE, 'OF_RECEBIMENTO', ARRAY['O prazo de entrega dos bens é de corridos, contados do recebimento da ordem de250 (duzentos e cinquenta) dias fornecimento pela empresa contratada, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/1331'),
  ('00394494000136', '2025', '001384', 'CONFERIR', 'trechos com prazos diferentes: 5 dias, 30 dias', 30, 'CORRIDOS', TRUE, 'OF_RECEBIMENTO', ARRAY['A Entrega do objeto deverá ser efetivada no prazo máximo de , a contar do30 (trinta) dias corridos recebimento da Solicitação de Fornecimento Ordem de Material/Serviço, emitida pela contratante, podendo ser prorrogada, excepcionalmente, por até igual período, desde que justifica','A Entrega do objeto deverá ser efetivada no prazo máximo de 30 (trinta) dias corridos, a contar do recebimento da Solicitação de Fornecimento Ordem de Material/Serviço conforme anexo II deste TR, emitida pela contratante, podendo ser prorrogada, excepcionalmente, por até igual p','A Entrega do objeto deverá ser efetivada no prazo máximo de 30 (trinta) dias corridos, a contar do recebimento da Solicitação de Fornecimento Ordem de Material/Serviço, emitida pela contratante, podendo ser prorrogada, excepcionalmente, por até igual período, desde que justifica']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/1384'),
  ('00394494000136', '2025', '001431', 'SEM_CLAUSULA', 'cláusula de entrega não encontrada', NULL, NULL, FALSE, NULL, ARRAY[]::TEXT[], 'Termo de Referência (79/2025.pdf)', 'https://pncp.gov.br/app/editais/00394494000136/2025/1431'),
  ('00394494000136', '2025', '001447', 'CLARO', NULL, 60, 'UTEIS', TRUE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens é de 60 (sessenta) dias úteis, contados do(a) ordem do fornecimento, em remessa única','O prazo de entrega dos bens será de 60 (sessenta) dias úteis, contados da solicitação de fornecimento do material, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/1447'),
  ('00394494000136', '2025', '001524', 'CLARO', NULL, 90, 'CORRIDOS', FALSE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens é de 90 (noventa) dias, contados da emissão da ordem de serviço/fornecimento, em remessa única']::TEXT[], 'Termo de Referência (81/2025.pdf)', 'https://pncp.gov.br/app/editais/00394494000136/2025/1524'),
  ('00394494000136', '2025', '001576', 'SEM_CLAUSULA', 'cláusula de entrega não encontrada', NULL, NULL, FALSE, NULL, ARRAY[]::TEXT[], 'Termo de Referência (51/2025.pdf)', 'https://pncp.gov.br/app/editais/00394494000136/2025/1576'),
  ('00394494000136', '2025', '001620', 'SEM_CLAUSULA', 'cláusula de entrega não encontrada', NULL, NULL, FALSE, NULL, ARRAY[]::TEXT[], 'Termo de Referência (Termo de Referencia 54_2025.pdf)', 'https://pncp.gov.br/app/editais/00394494000136/2025/1620'),
  ('00394494000136', '2025', '001637', 'SEM_CLAUSULA', 'cláusula de entrega não encontrada', NULL, NULL, FALSE, NULL, ARRAY[]::TEXT[], 'Termo de Referência (80/2025.pdf)', 'https://pncp.gov.br/app/editais/00394494000136/2025/1637'),
  ('00394494000136', '2025', '001651', 'CLARO', NULL, 150, 'CORRIDOS', FALSE, 'OF_RECEBIMENTO', ARRAY['A contratada deverá realizar a entrega dos coletores de projétil, no prazo de até 150 (cento e cinquenta) dias, contados do recebimento da ordem de fornecimento, podendo ser prorrogado por até mais 150 (cento e cinquenta dias), essa prorrogação poderá ser solicitada pelo licitant']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/1651'),
  ('00394494000136', '2025', '001664', 'CONFERIR', 'trechos com prazos diferentes: 60 dias, 90 dias', 60, 'CORRIDOS', FALSE, 'OF_RECEBIMENTO', ARRAY['O prazo de entrega será de 60 (sessenta) dias, contados do recebimento da Ordem de Fornecimento (OF) ou Nota de Empenho, em remessa única','O prazo de entrega será de 60 (sessenta) dias, contados do recebimento da ou NotaOrdem de Fornecimento (OF) de Empenho, em remessa única','Os bens serão entregues em , no prazo de contados da assinatura do• Da entrega remessa única 60 (sessenta) dias contrato, o que reduz significativamente o risco de inadimplemento ou descumprimento contratual']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/1664'),
  ('00394494000136', '2025', '001665', 'SEM_CLAUSULA', 'cláusula de entrega não encontrada', NULL, NULL, FALSE, NULL, ARRAY[]::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/1665'),
  ('00394494000136', '2025', '001667', 'CLARO', NULL, 240, 'CORRIDOS', FALSE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens serão de 240 (duzentos e quarenta) dias, contados da emissão da ordem de fornecimento, em remessa única']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2025/1667'),
  ('00394494000136', '2026', '000275', 'CONFERIR', 'trechos com prazos diferentes: 90 dias, 120 dias', 120, 'CORRIDOS', FALSE, 'OF_EMISSAO', ARRAY['O prazo de entrega dos bens é de 120 (cento e vinte) dias, contados da emissão da ordem de fornecimento, em remessa única','O prazo de entrega dos bens é de 120 (cento e vinte) dias, contados da recebimento da ordem de fornecimento, da emissão da Carta de Crédito ou da Licença de Exportação do país de origem do equipamento, o que ocorrer por último, em remessa única','A contratada deverá realizar a entrega do Sonar, no prazo de 90 (noventa) dias, contados da assinatura do contrato ou da emissão da nota de empenho, podendo ser prorrogado por igual período, essa prorrogação poderá ser solicitada pelo licitante e será concedida mediante justifica']::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2026/275'),
  ('00394494000136', '2026', '000366', 'SEM_CLAUSULA', 'cláusula de entrega não encontrada', NULL, NULL, FALSE, NULL, ARRAY[]::TEXT[], 'Edital e anexos', 'https://pncp.gov.br/app/editais/00394494000136/2026/366')
),
atas AS (
  SELECT DISTINCT ON (public.chave_gestao_ata(a.numero_ata || '-' || a.codigo_uasg))
         public.chave_gestao_ata(a.numero_ata || '-' || a.codigo_uasg) AS ata_key, a.numero_ata, a.codigo_uasg,
         split_part(a.numero_controle_pncp, '-', 1) AS cnpj,
         split_part(split_part(a.numero_controle_pncp, '-', 3), '/', 2) AS ano,
         split_part(split_part(a.numero_controle_pncp, '-', 3), '/', 1) AS seq
    FROM public.atas_registro_preco a
   WHERE a.numero_controle_pncp IS NOT NULL AND COALESCE(a.papel_senasp, 'GERENCIADORA') <> 'PARTICIPANTE'
   ORDER BY public.chave_gestao_ata(a.numero_ata || '-' || a.codigo_uasg), a.ultimo_sync_em DESC NULLS LAST
)
INSERT INTO public.ata_prazo_entrega (ata_key, numero_ata, uasg, leitura, leitura_motivo, sugerido_dias, sugerido_contagem, contagem_dita,
                                      sugerido_inicio, trechos, documento, url, lido_em)
SELECT a.ata_key, a.numero_ata, a.codigo_uasg, l.leitura, l.motivo, l.dias, l.contagem, l.dita, l.inicio, l.trechos, l.documento, l.url, '2026-11-13 12:00:00-03'
  FROM atas a JOIN lido l ON l.cnpj = a.cnpj AND l.ano = a.ano AND l.seq = a.seq
ON CONFLICT (ata_key) DO NOTHING;

-- 3) A regra que vale para o contrato --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fisc_regra_do_contrato(p_contrato TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  f        public.fisc_contratos%ROWTYPE;
  a        public.ata_prazo_entrega%ROWTYPE;
  v_atas   TEXT[];
  v_regras INTEGER;
  v_item   JSONB;
BEGIN
  SELECT * INTO f FROM public.fisc_contratos WHERE contract_key = p_contrato;
  IF FOUND AND f.prazo_dias IS NOT NULL THEN
    RETURN jsonb_build_object('dias', f.prazo_dias, 'contagem', f.prazo_contagem, 'inicio', f.prazo_inicio, 'origem', f.prazo_origem,
                              'ata', f.prazo_ata, 'trecho', f.prazo_trecho, 'documento', f.prazo_documento, 'motivo', f.prazo_motivo,
                              'definidoPor', f.prazo_definido_por_nome, 'definidoEm', f.prazo_definido_em);
  END IF;
  SELECT array_agg(DISTINCT public.ata_key_from_item_key(l.item_key)) INTO v_atas
    FROM public.arp_item_contract_links l WHERE l.contract_key = p_contrato;
  IF v_atas IS NULL THEN RETURN NULL; END IF;
  SELECT count(DISTINCT (p.dias, p.contagem, p.inicio)) INTO v_regras
    FROM public.ata_prazo_entrega p WHERE p.ata_key = ANY (v_atas) AND p.confirmado_em IS NOT NULL AND NOT p.sem_prazo;
  IF v_regras = 0 THEN RETURN NULL; END IF;
  IF v_regras > 1 THEN
    RETURN jsonb_build_object('conflito', TRUE, 'atas', to_jsonb(v_atas));
  END IF;
  SELECT * INTO a FROM public.ata_prazo_entrega p
   WHERE p.ata_key = ANY (v_atas) AND p.confirmado_em IS NOT NULL AND NOT p.sem_prazo ORDER BY p.ata_key LIMIT 1;
  -- Prazo por item, com a chave "ata|item" (o item vem da chave do item da ata: ata-UASG-item).
  SELECT COALESCE(jsonb_object_agg(p.ata_key || '|' || x.key, x.value), '{}'::JSONB) INTO v_item
    FROM public.ata_prazo_entrega p, jsonb_each(p.por_item) x
   WHERE p.ata_key = ANY (v_atas) AND p.confirmado_em IS NOT NULL AND NOT p.sem_prazo;
  RETURN jsonb_build_object('dias', a.dias, 'contagem', a.contagem, 'inicio', a.inicio, 'origem', 'TR', 'ata', a.numero_ata,
                            'trecho', array_to_string(a.trechos, ' '), 'documento', a.documento,
                            'confirmadoPor', a.confirmado_por_nome, 'confirmadoEm', a.confirmado_em, 'porItem', v_item);
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_regra_do_contrato(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fisc_regra_do_contrato(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fisc_dias_do_item(p_regra JSONB, p_item_key TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((p_regra->'porItem'->>(public.ata_key_from_item_key(p_item_key) || '|' || split_part(p_item_key, '-', 3)))::INTEGER,
                  (p_regra->>'dias')::INTEGER);
$$;
REVOKE ALL ON FUNCTION public.fisc_dias_do_item(JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fisc_dias_do_item(JSONB, TEXT) TO authenticated, service_role;

-- 4) Gatilho e RPCs do prazo com a regra herdada ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fisc_prazo_na_etapa()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_r      JSONB;
  v_ini    TEXT;
  v_cont   TEXT;
  v_dias   INTEGER;
  v_ex     INTEGER := public.fisc_ordem_da_etapa('CONTROLADO');
  v_ordem  INTEGER := public.fisc_ordem_da_etapa('ORDEM');
  v_de     INTEGER := public.fisc_ordem_da_etapa(OLD.etapa);
  v_para   INTEGER := public.fisc_ordem_da_etapa(NEW.etapa);
  v_d      INTEGER;
  v_inicio DATE;
BEGIN
  IF NEW.etapa IS NOT DISTINCT FROM OLD.etapa OR NEW.responsavel = 'AREA' THEN RETURN NEW; END IF;
  v_r := public.fisc_regra_do_contrato(NEW.contract_key);
  IF v_r ? 'conflito' THEN v_r := NULL; END IF;
  v_ini := v_r->>'inicio';
  v_cont := v_r->>'contagem';
  v_dias := public.fisc_dias_do_item(v_r, NEW.item_key);

  -- Saída do Exército para a frente: o prazo que conta da autorização começa; o que já corria anda os dias da espera.
  IF OLD.etapa = 'CONTROLADO' AND v_para > v_ex THEN
    IF v_ini = 'EXERCITO' AND NEW.prevista IS NULL THEN
      NEW.prevista := public.fisc_prevista_pela_regra(NEW.etapa_em, v_dias, v_cont);
      NEW.prevista_original := NEW.prevista;
      NEW.prevista_origem := 'EXERCITO';
      NEW.prazo_dias := v_dias;
      NEW.ultima_suspensao := 0;
      INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, data, observacao, criado_por, criado_por_nome)
      VALUES (NEW.id, 'PRAZO', NEW.prevista,
              format('Autorização do Exército em %s: %s %s, entrega até %s', to_char(NEW.etapa_em, 'DD/MM/YYYY'), v_dias,
                     CASE WHEN v_cont = 'UTEIS' THEN 'dias úteis' ELSE 'dias corridos' END, to_char(NEW.prevista, 'DD/MM/YYYY')),
              auth.uid(), NEW.atualizado_por_nome);
    ELSIF NEW.prevista IS NOT NULL AND OLD.etapa_em IS NOT NULL AND NEW.etapa_em IS NOT NULL THEN
      v_d := GREATEST(0, NEW.etapa_em - OLD.etapa_em);
      IF v_d > 0 THEN
        INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, data, observacao, criado_por, criado_por_nome)
        VALUES (NEW.id, 'SUSPENSAO', NEW.etapa_em,
                format('Aguardando o Exército de %s a %s: %s dias voltam ao fornecedor; entrega prevista de %s para %s',
                       to_char(OLD.etapa_em, 'DD/MM/YYYY'), to_char(NEW.etapa_em, 'DD/MM/YYYY'), v_d,
                       to_char(NEW.prevista, 'DD/MM/YYYY'), to_char(NEW.prevista + v_d, 'DD/MM/YYYY')),
                auth.uid(), NEW.atualizado_por_nome);
        NEW.prevista := NEW.prevista + v_d;
        NEW.dias_suspensos := NEW.dias_suspensos + v_d;
        NEW.ultima_suspensao := v_d;
      END IF;
    END IF;
  END IF;

  -- Volta ao Exército (Voltar etapa ou correção): desfaz a última saída.
  IF NEW.etapa = 'CONTROLADO' AND v_de > v_ex THEN
    IF NEW.prevista_origem = 'EXERCITO' THEN
      NEW.prevista := NULL; NEW.prevista_original := NULL; NEW.prevista_origem := NULL; NEW.prazo_dias := NULL;
    ELSIF NEW.ultima_suspensao > 0 AND NEW.prevista IS NOT NULL THEN
      NEW.prevista := NEW.prevista - NEW.ultima_suspensao;
      NEW.dias_suspensos := GREATEST(0, NEW.dias_suspensos - NEW.ultima_suspensao);
    END IF;
    NEW.ultima_suspensao := 0;
  END IF;

  -- Ordem registrada: prazo da emissão ou da assinatura sai sozinho (o do recebimento espera o fiscal informar).
  IF NEW.etapa = 'ORDEM' AND v_de < v_ordem AND NEW.prevista IS NULL AND v_ini IN ('OF_EMISSAO', 'ASSINATURA') THEN
    v_inicio := CASE WHEN v_ini = 'OF_EMISSAO' THEN NEW.etapa_em ELSE public.fisc_assinatura_do_contrato(NEW.contract_key) END;
    IF v_inicio IS NOT NULL THEN
      NEW.prevista := public.fisc_prevista_pela_regra(v_inicio, v_dias, v_cont);
      NEW.prevista_original := NEW.prevista;
      NEW.prevista_origem := CASE WHEN v_ini = 'OF_EMISSAO' THEN 'ORDEM' ELSE 'ASSINATURA' END;
      NEW.prazo_dias := v_dias;
      INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, data, observacao, criado_por, criado_por_nome)
      VALUES (NEW.id, 'PRAZO', NEW.prevista,
              format('%s %s %s (%s): entrega até %s', v_dias, CASE WHEN v_cont = 'UTEIS' THEN 'dias úteis' ELSE 'dias corridos' END,
                     CASE WHEN v_ini = 'OF_EMISSAO' THEN 'da emissão da Ordem' ELSE 'da assinatura do contrato' END,
                     to_char(v_inicio, 'DD/MM/YYYY'), to_char(NEW.prevista, 'DD/MM/YYYY')),
              auth.uid(), NEW.atualizado_por_nome);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_prazo_na_etapa() FROM PUBLIC, anon, authenticated;

-- Itens que já podem ter a data pela regra (assinatura; emissão da Ordem para os que estão na Ordem), sem data hoje.
CREATE OR REPLACE FUNCTION public.fisc_aplicar_regra_aos_itens(p_contrato TEXT, p_nome TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_r     JSONB := public.fisc_regra_do_contrato(p_contrato);
  v_ini   TEXT;
  v_assin DATE;
  e       RECORD;
  v_base  DATE;
  v_dias  INTEGER;
  v_prev  DATE;
  v_n     INTEGER := 0;
BEGIN
  IF v_r IS NULL OR v_r ? 'conflito' THEN RETURN 0; END IF;
  v_ini := v_r->>'inicio';
  IF v_ini NOT IN ('ASSINATURA', 'OF_EMISSAO') THEN RETURN 0; END IF;
  v_assin := public.fisc_assinatura_do_contrato(p_contrato);
  FOR e IN SELECT * FROM public.fisc_entregas x
            WHERE x.contract_key = p_contrato AND x.prevista IS NULL AND x.entregue_em IS NULL AND x.encerrada_em IS NULL
              AND x.responsavel = 'SFC' AND x.etapa <> 'CONTROLADO'
              AND (v_ini = 'ASSINATURA' OR x.etapa = 'ORDEM') LOOP
    v_base := CASE WHEN v_ini = 'ASSINATURA' THEN v_assin ELSE e.etapa_em END;
    CONTINUE WHEN v_base IS NULL;
    v_dias := public.fisc_dias_do_item(v_r, e.item_key);
    v_prev := public.fisc_prevista_pela_regra(v_base, v_dias, v_r->>'contagem');
    UPDATE public.fisc_entregas
       SET prevista = v_prev, prevista_original = v_prev, prevista_origem = CASE WHEN v_ini = 'ASSINATURA' THEN 'ASSINATURA' ELSE 'ORDEM' END,
           prazo_dias = v_dias, atualizado_por_nome = p_nome, atualizado_em = NOW()
     WHERE id = e.id;
    INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, data, observacao, criado_por, criado_por_nome)
    VALUES (e.id, 'PRAZO', v_prev,
            format('%s %s %s (%s): entrega até %s', v_dias, CASE WHEN v_r->>'contagem' = 'UTEIS' THEN 'dias úteis' ELSE 'dias corridos' END,
                   CASE WHEN v_ini = 'ASSINATURA' THEN 'da assinatura do contrato' ELSE 'da emissão da Ordem' END,
                   to_char(v_base, 'DD/MM/YYYY'), to_char(v_prev, 'DD/MM/YYYY')),
            auth.uid(), p_nome);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_aplicar_regra_aos_itens(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fisc_aplicar_regra_aos_itens(TEXT, TEXT) TO service_role;

-- Prazo do contrato: o informado no contrato vale acima do da ata; mudar uma regra que já vale pede motivo.
CREATE OR REPLACE FUNCTION public.definir_prazo_entrega_contrato(p_contract_key TEXT, p_dias INTEGER, p_contagem TEXT, p_inicio TEXT, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  f      public.fisc_contratos%ROWTYPE;
  v_nome TEXT := left(public.nome_do_usuario_logado(), 200);
  v_mot  TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_r    JSONB;
  v_n    INTEGER;
BEGIN
  IF public.has_permission('fiscalizacao.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem permissão para registrar a fiscalização.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO f FROM public.fisc_contratos WHERE contract_key = p_contract_key FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Contrato sem fiscalização definida.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_role('admin') AND auth.uid() IS DISTINCT FROM f.fiscal_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o fiscal ou o coordenador definem o prazo deste contrato.' USING ERRCODE = '42501';
  END IF;
  IF p_dias IS NULL OR p_dias NOT BETWEEN 1 AND 730 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Prazo de 1 a 730 dias.' USING ERRCODE = '22023';
  END IF;
  IF p_contagem NOT IN ('CORRIDOS', 'UTEIS') OR p_inicio NOT IN ('OF_RECEBIMENTO', 'OF_EMISSAO', 'ASSINATURA', 'EXERCITO') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Contagem ou início do prazo inválido.' USING ERRCODE = '22023';
  END IF;
  v_r := public.fisc_regra_do_contrato(p_contract_key);
  IF v_r IS NOT NULL AND NOT (v_r ? 'conflito')
     AND ((v_r->>'dias')::INTEGER, v_r->>'contagem', v_r->>'inicio') IS DISTINCT FROM (p_dias, p_contagem, p_inicio)
     AND COALESCE(length(v_mot), 0) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Diga por que o prazo muda (mínimo de 10 letras).' USING ERRCODE = '22023';
  END IF;

  UPDATE public.fisc_contratos
     SET prazo_dias = p_dias, prazo_contagem = p_contagem, prazo_inicio = p_inicio, prazo_origem = 'CONTRATO',
         prazo_motivo = COALESCE(v_mot, prazo_motivo), prazo_definido_por_nome = v_nome, prazo_definido_em = NOW(),
         atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE contract_key = p_contract_key;
  v_n := public.fisc_aplicar_regra_aos_itens(p_contract_key, v_nome);
  RETURN jsonb_build_object('contrato', p_contract_key, 'itens_com_data', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.definir_prazo_entrega_contrato(TEXT, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.definir_prazo_entrega_contrato(TEXT, INTEGER, TEXT, TEXT, TEXT) TO authenticated;

-- Recebimento da Ordem: dias do item quando o prazo informado é o da regra (prazo por item do TR).
CREATE OR REPLACE FUNCTION public.registrar_recebimento_ordem(p_ids UUID[], p_recebida_em DATE, p_prazo_dias INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome  TEXT := left(public.nome_do_usuario_logado(), 200);
  v_hoje  DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_k     TEXT;
  v_r     JSONB;
  v_cont  TEXT;
  e       RECORD;
  v_dias  INTEGER;
  v_pela  DATE;
  v_n     INTEGER := 0;
BEGIN
  PERFORM public.fisc_conferir_entregas(p_ids);
  IF p_recebida_em IS NULL OR p_recebida_em > v_hoje THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Data do recebimento até hoje.' USING ERRCODE = '22023';
  END IF;
  IF p_prazo_dias IS NULL OR p_prazo_dias NOT BETWEEN 1 AND 730 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Prazo de 1 a 730 dias.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT contract_key) FROM public.fisc_entregas WHERE id = ANY (p_ids)) > 1 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Registre o recebimento de um contrato por vez.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids)
              AND (responsavel <> 'SFC' OR entregue_em IS NOT NULL OR public.fisc_ordem_da_etapa(etapa) < public.fisc_ordem_da_etapa('ORDEM'))) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Só itens com a Ordem registrada e ainda não entregues.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) AND etapa = 'ORDEM' AND etapa_em > p_recebida_em) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O recebimento não pode ser antes da emissão da Ordem.' USING ERRCODE = '22023';
  END IF;

  SELECT contract_key INTO v_k FROM public.fisc_entregas WHERE id = p_ids[1];
  PERFORM 1 FROM public.fisc_contratos WHERE contract_key = v_k FOR UPDATE;
  v_r := public.fisc_regra_do_contrato(v_k);
  IF v_r ? 'conflito' THEN v_r := NULL; END IF;
  -- Contrato sem regra (nem dele, nem da ata): o prazo informado aqui vira a regra do contrato.
  IF v_r IS NULL THEN
    UPDATE public.fisc_contratos
       SET prazo_dias = p_prazo_dias, prazo_contagem = 'CORRIDOS', prazo_inicio = 'OF_RECEBIMENTO', prazo_origem = 'CONTRATO',
           prazo_definido_por_nome = v_nome, prazo_definido_em = NOW()
     WHERE contract_key = v_k AND prazo_dias IS NULL;
    v_cont := 'CORRIDOS';
  ELSE
    v_cont := v_r->>'contagem';
  END IF;

  FOR e IN SELECT * FROM public.fisc_entregas WHERE id = ANY (p_ids) LOOP
    v_dias := CASE WHEN v_r IS NOT NULL AND p_prazo_dias = (v_r->>'dias')::INTEGER THEN public.fisc_dias_do_item(v_r, e.item_key) ELSE p_prazo_dias END;
    v_pela := public.fisc_prevista_pela_regra(p_recebida_em, v_dias, v_cont);
    UPDATE public.fisc_entregas
       SET ordem_recebida_em = p_recebida_em, prazo_dias = v_dias, prevista_original = v_pela,
           prevista = v_pela + e.dias_suspensos, prevista_origem = 'ORDEM', prevista_anterior = NULL,
           atualizado_por_nome = v_nome, atualizado_em = NOW()
     WHERE id = e.id;
    INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, data, observacao, criado_por, criado_por_nome)
    VALUES (e.id, 'RECEBIMENTO', p_recebida_em,
            format('%s %s: entrega até %s%s', v_dias, CASE WHEN v_cont = 'UTEIS' THEN 'dias úteis' ELSE 'dias corridos' END,
                   to_char(v_pela + e.dias_suspensos, 'DD/MM/YYYY'),
                   CASE WHEN e.prevista IS NOT NULL AND e.prevista <> v_pela + e.dias_suspensos THEN format(' (antes %s)', to_char(e.prevista, 'DD/MM/YYYY')) ELSE '' END),
            auth.uid(), v_nome);
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('entregas', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_recebimento_ordem(UUID[], DATE, INTEGER) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_recebimento_ordem(UUID[], DATE, INTEGER) TO authenticated;

-- 5) Confirmação do prazo da ata -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirmar_prazo_entrega_ata(p_ata_key TEXT, p_sem_prazo BOOLEAN, p_dias INTEGER, p_contagem TEXT,
                                                              p_inicio TEXT, p_por_item JSONB, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome  TEXT := left(public.nome_do_usuario_logado(), 200);
  v_mot   TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_key   TEXT := btrim(COALESCE(p_ata_key, ''));
  v_item  JSONB := COALESCE(p_por_item, '{}'::JSONB);
  p       public.ata_prazo_entrega%ROWTYPE;
  v_c     RECORD;
  v_ct    INTEGER := 0;
  v_it    INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Faça login.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role('admin')
     AND NOT EXISTS (SELECT 1 FROM public.ata_managers am WHERE am.ata_key = v_key AND am.gestor_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor da ata ou o coordenador confirmam o prazo de entrega.' USING ERRCODE = '42501';
  END IF;
  IF v_key !~ '^\d{5}/\d{4}(-\d{6})?$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Ata inválida.' USING ERRCODE = '22023';
  END IF;
  IF NOT COALESCE(p_sem_prazo, FALSE) THEN
    IF p_dias IS NULL OR p_dias NOT BETWEEN 1 AND 730 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Prazo de 1 a 730 dias.' USING ERRCODE = '22023';
    END IF;
    IF p_contagem NOT IN ('CORRIDOS', 'UTEIS') OR p_inicio NOT IN ('OF_RECEBIMENTO', 'OF_EMISSAO', 'ASSINATURA', 'EXERCITO') THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Contagem ou início do prazo inválido.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_item) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_each(v_item) x
                                                     WHERE x.key !~ '^\d{1,5}$' OR jsonb_typeof(x.value) <> 'number'
                                                        OR (x.value)::TEXT::NUMERIC NOT BETWEEN 1 AND 730) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Prazo por item inválido.' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT * INTO p FROM public.ata_prazo_entrega WHERE ata_key = v_key FOR UPDATE;
  IF FOUND AND p.confirmado_em IS NOT NULL
     AND (p.sem_prazo, p.dias, p.contagem, p.inicio, p.por_item) IS DISTINCT FROM
         (COALESCE(p_sem_prazo, FALSE), CASE WHEN p_sem_prazo THEN NULL ELSE p_dias END, CASE WHEN p_sem_prazo THEN NULL ELSE p_contagem END,
          CASE WHEN p_sem_prazo THEN NULL ELSE p_inicio END, CASE WHEN p_sem_prazo THEN '{}'::JSONB ELSE v_item END)
     AND COALESCE(length(v_mot), 0) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Diga por que o prazo confirmado muda (mínimo de 10 letras).' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ata_prazo_entrega AS t (ata_key, numero_ata, uasg, sem_prazo, dias, contagem, inicio, por_item, motivo,
                                             confirmado_por, confirmado_por_nome, confirmado_em)
  VALUES (v_key, split_part(v_key, '-', 1), NULLIF(split_part(v_key, '-', 2), ''), COALESCE(p_sem_prazo, FALSE),
          CASE WHEN p_sem_prazo THEN NULL ELSE p_dias END, CASE WHEN p_sem_prazo THEN NULL ELSE p_contagem END,
          CASE WHEN p_sem_prazo THEN NULL ELSE p_inicio END, CASE WHEN p_sem_prazo THEN '{}'::JSONB ELSE v_item END, v_mot,
          auth.uid(), v_nome, NOW())
  ON CONFLICT (ata_key) DO UPDATE
     SET sem_prazo = EXCLUDED.sem_prazo, dias = EXCLUDED.dias, contagem = EXCLUDED.contagem, inicio = EXCLUDED.inicio,
         por_item = EXCLUDED.por_item, motivo = COALESCE(EXCLUDED.motivo, t.motivo),
         confirmado_por = EXCLUDED.confirmado_por, confirmado_por_nome = EXCLUDED.confirmado_por_nome, confirmado_em = EXCLUDED.confirmado_em;

  -- Contratos da ata que herdam: os itens que já podem ter a data recebem agora.
  FOR v_c IN SELECT DISTINCT l.contract_key FROM public.arp_item_contract_links l
              JOIN public.fisc_contratos f ON f.contract_key = l.contract_key AND f.prazo_dias IS NULL
             WHERE public.ata_key_from_item_key(l.item_key) = v_key LOOP
    v_ct := v_ct + 1;
    v_it := v_it + public.fisc_aplicar_regra_aos_itens(v_c.contract_key, v_nome);
  END LOOP;
  RETURN jsonb_build_object('ata', v_key, 'contratos', v_ct, 'itens_com_data', v_it);
END;
$$;
REVOKE ALL ON FUNCTION public.confirmar_prazo_entrega_ata(TEXT, BOOLEAN, INTEGER, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_prazo_entrega_ata(TEXT, BOOLEAN, INTEGER, TEXT, TEXT, JSONB, TEXT) TO authenticated;

-- 6) Leituras com a regra herdada ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fisc_contratos_para_distribuicao()
 RETURNS TABLE(contract_key text, uasg text, numero text, fornecedor text, objeto text, assinatura date, vigencia_fim date, emendas text[], situacao text, motivo text, fiscal_user_id uuid, fiscal_nome text, portaria_sei text, processo_sei text, autuado_em date, definido_por_nome text, definido_em timestamp with time zone, atas text[], unidade_area text, unidades_do_contrato text[], processo_nup text, processo_autuado_em date, prazo_entrega jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF public.has_permission('fiscalizacao.view') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem acesso à fiscalização.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH emendas AS (
    SELECT n.contract_key AS chave, array_agg(DISTINCT p.siop_emenda::TEXT ORDER BY p.siop_emenda::TEXT) FILTER (WHERE p.siop_emenda IS NOT NULL) AS lista, TRUE AS de_emenda
      FROM public.emenda_linha_notas n
      JOIN public.emenda_pedido_linhas l ON l.id = n.linha_id AND NOT l.cancelada
      JOIN public.emenda_pedidos p ON p.id = l.pedido_id AND p.etapa <> 'CANCELADO'
     WHERE n.contract_key IS NOT NULL
     GROUP BY n.contract_key
  ),
  atas AS (
    -- A chave do item da ata é "ata-UASG-item" (00031/2025-200331-00002).
    SELECT k.contract_key AS chave, array_agg(DISTINCT split_part(k.item_key, '-', 1) ORDER BY split_part(k.item_key, '-', 1)) AS lista
      FROM public.arp_item_contract_links k
     GROUP BY k.contract_key
  ),
  -- Unidades internas do contrato: pela divisão do contratado (migration 103) ou, sem divisão, pela alocação dos
  -- itens da ata ligados ao contrato. Sugestão para a área requisitante.
  divisao AS (
    SELECT u.contract_key AS chave, array_agg(DISTINCT u.unit_name::TEXT ORDER BY u.unit_name::TEXT) AS lista
      FROM public.contrato_item_divisao_unidades u
     GROUP BY u.contract_key
  ),
  alocacao AS (
    SELECT k.contract_key AS chave, array_agg(DISTINCT a.unit_name::TEXT ORDER BY a.unit_name::TEXT) AS lista
      FROM public.arp_item_contract_links k
      JOIN public.arp_allocations a ON a.item_key = k.item_key AND a.allocated_qty > 0
     GROUP BY k.contract_key
  ),
  contratos AS (
    SELECT DISTINCT ON (c.contract_key) c.*
      FROM public.contratos_oficiais c
     ORDER BY c.contract_key, c.sincronizado_em DESC
  )
  SELECT c.contract_key::TEXT,
         c.uasg::TEXT,
         COALESCE(NULLIF(c.registro->>'numero', ''), c.numero)::TEXT,
         (c.registro->>'fornecedorNome')::TEXT,
         (c.registro->>'objeto')::TEXT,
         NULLIF(c.registro->>'dataAssinatura', '')::DATE,
         c.data_vigencia_fim,
         COALESCE(e.lista, ARRAY[]::TEXT[]),
         CASE WHEN f.contract_key IS NOT NULL THEN f.fiscalizacao::TEXT
              WHEN e.de_emenda THEN 'A_DEFINIR'
              ELSE 'AREA_PADRAO' END,
         f.motivo, f.fiscal_user_id, f.fiscal_nome::TEXT,
         f.portaria_sei::TEXT, f.processo_sei::TEXT, f.autuado_em, f.definido_por_nome::TEXT, f.definido_em,
         COALESCE(at.lista, ARRAY[]::TEXT[]),
         f.unidade_area::TEXT,
         COALESCE(dv.lista, al.lista, ARRAY[]::TEXT[]),
         f.processo_nup::TEXT, f.processo_autuado_em,
         public.fisc_regra_do_contrato(c.contract_key::TEXT)
    FROM contratos c
    LEFT JOIN emendas e ON e.chave = c.contract_key
    LEFT JOIN atas at ON at.chave = c.contract_key
    LEFT JOIN divisao dv ON dv.chave = c.contract_key
    LEFT JOIN alocacao al ON al.chave = c.contract_key
    LEFT JOIN public.fisc_contratos f ON f.contract_key = c.contract_key
   WHERE f.contract_key IS NOT NULL
      OR c.data_vigencia_fim IS NULL
      OR c.data_vigencia_fim >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fisc_entregas_lista(p_contrato text DEFAULT NULL::text, p_encerradas boolean DEFAULT false)
 RETURNS TABLE(id uuid, contract_key text, contrato_numero text, fornecedor text, fiscal_user_id uuid, fiscal_nome text, fiscalizacao text, item_key text, item_nome text, item_descricao text, item_texto text, beneficiario_id uuid, beneficiario_nome text, beneficiario_sigla text, beneficiario_razao text, beneficiario_texto text, municipio text, uf text, quantidade integer, origem text, emenda text, pedido_id uuid, responsavel text, etapa text, etapa_em date, prevista date, entregue_em date, dividida_de uuid, programa_texto text, carga_linha integer, faturado_em date, pago_em date, atualizado_por_nome text, atualizado_em timestamp with time zone, programa_id uuid, programa_ativo boolean, parlamentar_nome text, entrega_logradouro text, entrega_numero text, entrega_complemento text, entrega_bairro text, entrega_cep text, aviso jsonb, encerrada_em date, encerrada_motivo text, prevista_origem text, ordem_recebida_em date, prazo_dias integer, prevista_anterior date, prevista_original date, dias_suspensos integer, prazo_inicio text, prazo_contagem text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF public.has_permission('fiscalizacao.view') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem acesso à fiscalização.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT e.id, e.contract_key::TEXT,
         COALESCE(NULLIF(c.registro->>'numero', ''), c.numero, e.contract_key)::TEXT,
         (c.registro->>'fornecedorNome')::TEXT,
         f.fiscal_user_id, f.fiscal_nome::TEXT, f.fiscalizacao::TEXT,
         e.item_key::TEXT, i.nome_curto::TEXT, i.descricao_item::TEXT, e.item_texto,
         e.beneficiario_id, COALESCE(b.nome, b.nome_curto)::TEXT, b.sigla::TEXT, b.razao_social::TEXT, e.beneficiario_texto, COALESCE(b.entrega_municipio, e.municipio_texto)::TEXT, COALESCE(b.entrega_uf, e.uf_texto)::TEXT,
         e.quantidade, e.origem::TEXT, COALESCE(p.siop_emenda::TEXT, e.emenda_texto), p.id,
         e.responsavel::TEXT, e.etapa::TEXT, e.etapa_em, e.prevista, e.entregue_em, e.dividida_de,
         COALESCE(pr.nome, e.programa_texto)::TEXT, e.carga_linha,
         n.faturado_em::DATE, n.pago_em::DATE, e.atualizado_por_nome::TEXT, e.atualizado_em,
         e.programa_id, pr.ativo, a.nome::TEXT,
         b.entrega_logradouro::TEXT, b.entrega_numero::TEXT, b.entrega_complemento::TEXT, b.entrega_bairro::TEXT, b.entrega_cep::TEXT,
         CASE WHEN e.encerrada_em IS NULL AND e.emenda_linha_id IS NOT NULL THEN public.fisc_aviso_da_entrega(e.emenda_linha_id, e.contract_key::TEXT) END,
         e.encerrada_em, e.encerrada_motivo::TEXT,
         e.prevista_origem::TEXT, e.ordem_recebida_em, e.prazo_dias, e.prevista_anterior, e.prevista_original, e.dias_suspensos, COALESCE(f.prazo_inicio, ra.inicio)::TEXT, COALESCE(f.prazo_contagem, ra.contagem)::TEXT
    FROM public.fisc_entregas e
    JOIN public.fisc_contratos f ON f.contract_key = e.contract_key
    -- Regra herdada das atas (a mesma de fisc_regra_do_contrato, só o que a lista usa): as atas confirmadas concordam.
    LEFT JOIN (SELECT l.contract_key, min(pz.inicio) AS inicio, min(pz.contagem) AS contagem
                 FROM public.arp_item_contract_links l
                 JOIN public.ata_prazo_entrega pz ON pz.ata_key = public.ata_key_from_item_key(l.item_key)
                                                 AND pz.confirmado_em IS NOT NULL AND NOT pz.sem_prazo
                WHERE p_contrato IS NULL OR l.contract_key = p_contrato
                GROUP BY l.contract_key
               HAVING count(DISTINCT (pz.dias, pz.contagem, pz.inicio)) = 1) ra ON ra.contract_key = e.contract_key
    LEFT JOIN LATERAL (SELECT co.* FROM public.contratos_oficiais co WHERE co.contract_key = e.contract_key ORDER BY co.sincronizado_em DESC LIMIT 1) c ON TRUE
    LEFT JOIN LATERAL public.fisc_item_da_ata(e.item_key) i ON TRUE
    LEFT JOIN public.emenda_beneficiarios b ON b.id = e.beneficiario_id
    LEFT JOIN public.emenda_pedido_linhas l ON l.id = e.emenda_linha_id
    LEFT JOIN public.emenda_pedidos p ON p.id = l.pedido_id
    LEFT JOIN public.emenda_autores a ON a.id = p.autor_id
    LEFT JOIN public.emenda_linha_notas n ON n.linha_id = e.emenda_linha_id
    LEFT JOIN public.fisc_programas pr ON pr.id = e.programa_id
   WHERE (p_contrato IS NULL OR e.contract_key = p_contrato)
     AND (p_encerradas OR e.encerrada_em IS NULL);
END;
$function$;
