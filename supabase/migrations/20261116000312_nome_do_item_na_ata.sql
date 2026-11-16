-- Nome do item como está escrito na ata assinada (PDF do PNCP), para as listas de Atas e Contratos.
--
-- O nome curto da CAEP (emenda_itens_dados, migration 165) só existe para os itens alocados à CAEP: 138 dos 667
-- itens em 16/11/2026. A coluna de nome da tabela da ata assinada existe em 142 das 145 atas vigentes; a leitura
-- desse nome fica aqui. Nas telas, o nome da CAEP vale primeiro; sem ele, o nome da ata; sem os dois, a descrição.
--
-- Só o servidor grava (carga conferida pelo usuário e, depois, a leitura das atas novas); logados só leem.

CREATE TABLE IF NOT EXISTS public.itens_nome_na_ata (
  item_key      VARCHAR(100) PRIMARY KEY,
  nome          VARCHAR(200) NOT NULL,
  -- Onde o nome foi lido: célula da tabela do PDF ou texto corrido da página.
  lido_de       VARCHAR(10)  NOT NULL DEFAULT 'TABELA',
  documento_pncp TEXT,
  lido_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT itens_nome_na_ata_nome CHECK (btrim(nome) <> ''),
  CONSTRAINT itens_nome_na_ata_lido_de CHECK (lido_de IN ('TABELA', 'TEXTO'))
);
COMMENT ON TABLE public.itens_nome_na_ata IS
  'Nome do item na tabela da ata assinada (PDF do PNCP). Só exibição; o nome curto da CAEP (emenda_itens_dados) vale primeiro. Grava só o servidor.';

ALTER TABLE public.itens_nome_na_ata ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura para logados: itens_nome_na_ata" ON public.itens_nome_na_ata;
CREATE POLICY "Leitura para logados: itens_nome_na_ata" ON public.itens_nome_na_ata
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.itens_nome_na_ata;
CREATE POLICY "Somente usuario ativo" ON public.itens_nome_na_ata AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
REVOKE ALL ON public.itens_nome_na_ata FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.itens_nome_na_ata TO authenticated;
GRANT ALL ON public.itens_nome_na_ata TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_itens_nome_na_ata ON public.itens_nome_na_ata;
    CREATE TRIGGER trg_audit_itens_nome_na_ata AFTER INSERT OR UPDATE OR DELETE ON public.itens_nome_na_ata
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;
