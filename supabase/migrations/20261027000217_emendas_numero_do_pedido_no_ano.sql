-- Número do pedido nas telas: a ordem dele no parlamentar, por ano da emenda (1/2026, 2/2026, 1/2027...).
-- Decisão do usuário (27/10/2026): o sequencial emenda_pedidos.numero é controle interno e sai das telas.
--
-- Regras:
-- 1) O pedido só ganha número quando a emenda é informada com o ano (siop_emenda_ano, ou a emenda de origem em
--    emendas_siop). Antes disso a tela mostra "Reserva de dd/mm/aaaa"; com o nº da emenda sem o ano, "ano a informar".
-- 2) O número é gravado uma vez e nunca muda: cancelado guarda o seu; anulação que limpa a emenda não apaga o número;
--    pedido reaberto por anulação ganha o próximo do ano quando a emenda for informada de novo.
-- 3) Só se o parlamentar do pedido mudar o número é refeito (era a ordem no outro parlamentar).
-- 4) Reserva sem parlamentar (autor_id nulo, migration 163) fica sem número.
-- Carga inicial: pela data da reserva e, no empate (cargas das planilhas), pelo sequencial interno.

ALTER TABLE public.emenda_pedidos ADD COLUMN IF NOT EXISTS numero_no_ano SMALLINT;
ALTER TABLE public.emenda_pedidos ADD COLUMN IF NOT EXISTS ano_do_numero SMALLINT;

ALTER TABLE public.emenda_pedidos DROP CONSTRAINT IF EXISTS emenda_pedidos_numero_no_ano_par;
ALTER TABLE public.emenda_pedidos ADD CONSTRAINT emenda_pedidos_numero_no_ano_par
  CHECK ((numero_no_ano IS NULL) = (ano_do_numero IS NULL) AND (numero_no_ano IS NULL OR numero_no_ano > 0));

CREATE UNIQUE INDEX IF NOT EXISTS ux_emenda_pedidos_numero_no_ano
  ON public.emenda_pedidos (autor_id, ano_do_numero, numero_no_ano) WHERE numero_no_ano IS NOT NULL;

COMMENT ON COLUMN public.emenda_pedidos.numero_no_ano IS
  'Número do pedido nas telas: ordem no parlamentar dentro do ano da emenda (1/2026). Gravado quando a emenda é informada com o ano; nunca muda.';
COMMENT ON COLUMN public.emenda_pedidos.ano_do_numero IS
  'Ano da emenda em que o número foi dado (o "2026" de 1/2026).';

CREATE OR REPLACE FUNCTION public.trg_emendas_numero_no_ano()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_ano SMALLINT;
BEGIN
  -- O número é a ordem no parlamentar: trocou o parlamentar, refaz no novo.
  IF TG_OP = 'UPDATE' AND NEW.autor_id IS DISTINCT FROM OLD.autor_id THEN
    NEW.numero_no_ano := NULL;
    NEW.ano_do_numero := NULL;
  END IF;
  IF NEW.numero_no_ano IS NOT NULL OR NEW.autor_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_ano := COALESCE(NEW.siop_emenda_ano, (SELECT s.ano FROM public.emendas_siop s WHERE s.id = NEW.emenda_id));
  IF v_ano IS NULL THEN
    RETURN NEW;
  END IF;
  -- Dois pedidos do mesmo parlamentar e ano ao mesmo tempo não podem pegar o mesmo número.
  PERFORM pg_advisory_xact_lock(hashtext('emendas_numero_no_ano'), hashtext(NEW.autor_id || ':' || v_ano));
  SELECT COALESCE(max(p.numero_no_ano), 0) + 1 INTO NEW.numero_no_ano
    FROM public.emenda_pedidos p
   WHERE p.autor_id = NEW.autor_id AND p.ano_do_numero = v_ano AND p.id <> NEW.id;
  NEW.ano_do_numero := v_ano;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_emendas_numero_no_ano() FROM PUBLIC, anon, authenticated;

-- "zz" no nome: os gatilhos BEFORE rodam em ordem alfabética; este roda depois do que liga a emenda (migration 206).
DROP TRIGGER IF EXISTS trg_emendas_zz_numero_no_ano ON public.emenda_pedidos;
CREATE TRIGGER trg_emendas_zz_numero_no_ano
  BEFORE INSERT OR UPDATE OF autor_id, siop_emenda_ano, emenda_id ON public.emenda_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.trg_emendas_numero_no_ano();

-- Carga dos pedidos que já têm parlamentar e emenda com ano.
WITH base AS (
  SELECT p.id, p.autor_id, COALESCE(p.siop_emenda_ano, s.ano) AS ano, p.reservado_em, p.numero
    FROM public.emenda_pedidos p
    LEFT JOIN public.emendas_siop s ON s.id = p.emenda_id
   WHERE p.autor_id IS NOT NULL AND p.numero_no_ano IS NULL AND COALESCE(p.siop_emenda_ano, s.ano) IS NOT NULL
), numerados AS (
  SELECT id, ano, row_number() OVER (PARTITION BY autor_id, ano ORDER BY reservado_em, numero) AS n FROM base
)
UPDATE public.emenda_pedidos p
   SET numero_no_ano = numerados.n, ano_do_numero = numerados.ano
  FROM numerados
 WHERE p.id = numerados.id;
