import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';

/**
 * Avisos de carregamento (padrão do Google e do Jira):
 * - até 0,3 s nada aparece, para a tela não piscar;
 * - depois disso, a barra azul fina corre no topo enquanto houver leitura ou gravação;
 * - no esqueleto da tela, o texto "Carregando…" aparece após 1 s e a explicação da demora após 8 s;
 * - o que apareceu fica no mínimo 0,5 s.
 */
export const CARREGAMENTO_ATRASO_MS = 300;
export const CARREGAMENTO_MINIMO_MS = 500;
export const CARREGAMENTO_TEXTO_MS = 1000;
export const CARREGAMENTO_LENTO_MS = 8000;

export const MENSAGEM_CARREGAMENTO_LENTO =
  'Ainda carregando. Esta tela reúne muitos dados e pode levar alguns segundos. Não é preciso recarregar a página.';

/** Consultas com este `meta` (ex.: conferência periódica da sincronização) não acendem a barra do topo. */
export const META_SEM_BARRA_DE_CARREGAMENTO = { semBarraDeCarregamento: true } as const;

interface ControleIndicadorOpcoes {
  atraso: number;
  minimo: number;
  aoMudar: (visivel: boolean) => void;
}

/** Liga o indicador só depois do atraso e o mantém ligado pelo tempo mínimo. Separado do React para ser testável. */
export function criarControleIndicador({ atraso, minimo, aoMudar }: ControleIndicadorOpcoes) {
  let visivel = false;
  let desde = 0;
  let timerAtraso: ReturnType<typeof setTimeout> | null = null;
  let timerMinimo: ReturnType<typeof setTimeout> | null = null;

  const limpar = (t: ReturnType<typeof setTimeout> | null) => {
    if (t) clearTimeout(t);
    return null;
  };
  const mudar = (v: boolean) => {
    visivel = v;
    if (v) desde = Date.now();
    aoMudar(v);
  };

  return {
    definirAtivo(ativo: boolean) {
      if (ativo) {
        timerMinimo = limpar(timerMinimo);
        if (!visivel && !timerAtraso) {
          timerAtraso = setTimeout(() => {
            timerAtraso = null;
            mudar(true);
          }, atraso);
        }
        return;
      }
      timerAtraso = limpar(timerAtraso);
      if (!visivel || timerMinimo) return;
      const restante = minimo - (Date.now() - desde);
      if (restante <= 0) {
        mudar(false);
        return;
      }
      timerMinimo = setTimeout(() => {
        timerMinimo = null;
        mudar(false);
      }, restante);
    },
    encerrar() {
      timerAtraso = limpar(timerAtraso);
      timerMinimo = limpar(timerMinimo);
    }
  };
}

export function useIndicadorComAtraso(ativo: boolean, atraso = CARREGAMENTO_ATRASO_MS, minimo = CARREGAMENTO_MINIMO_MS): boolean {
  const [visivel, setVisivel] = useState(false);
  const [controle] = useState(() => criarControleIndicador({ atraso, minimo, aoMudar: setVisivel }));
  useEffect(() => {
    controle.definirAtivo(ativo);
  }, [controle, ativo]);
  useEffect(() => () => controle.encerrar(), [controle]);
  return visivel;
}

/** 0 = recém-montado, 1 = passou do primeiro limite, 2 = passou do segundo. Conta a partir da montagem. */
export function useFaseDaEspera(primeiro = CARREGAMENTO_TEXTO_MS, segundo = CARREGAMENTO_LENTO_MS): 0 | 1 | 2 {
  const [fase, setFase] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    const t1 = setTimeout(() => setFase(1), primeiro);
    const t2 = setTimeout(() => setFase(2), segundo);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [primeiro, segundo]);
  return fase;
}

// Páginas ainda baixando (Suspense das rotas) também acendem a barra do topo.
let paginasCarregando = 0;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((o) => o());
const assinarPaginas = (o: () => void) => {
  ouvintes.add(o);
  return () => ouvintes.delete(o);
};
const lerPaginas = () => paginasCarregando;

/** Marca que uma página está carregando enquanto o componente estiver na tela. */
export function useMarcarPaginaCarregando() {
  useEffect(() => {
    paginasCarregando += 1;
    avisar();
    return () => {
      paginasCarregando -= 1;
      avisar();
    };
  }, []);
}

const semBarra = (meta: unknown) => Boolean((meta as { semBarraDeCarregamento?: boolean } | undefined)?.semBarraDeCarregamento);

/** Barra azul fina no topo enquanto o sistema lê ou grava dados, ou baixa uma página. */
export const BarraCarregamento: React.FC = () => {
  const lendo = useIsFetching({ predicate: (q) => !semBarra(q.meta) });
  const gravando = useIsMutating();
  const paginas = useSyncExternalStore(assinarPaginas, lerPaginas, lerPaginas);
  const visivel = useIndicadorComAtraso(lendo + gravando + paginas > 0);
  return <div className={`barra-carregamento${visivel ? ' barra-carregamento--ativa' : ''}`} aria-hidden="true" data-testid="barra-carregamento" />;
};

export interface AvisoCarregandoProps {
  /** O que está vindo, sem reticências: "Carregando atas". */
  label: string;
  testId?: string;
}

/** Texto que acompanha o esqueleto: aparece após 1 s e explica a demora após 8 s. */
export const AvisoCarregando: React.FC<AvisoCarregandoProps> = ({ label, testId = 'aviso-carregando' }) => {
  const fase = useFaseDaEspera();
  return (
    <div role="status" aria-live="polite" data-testid={testId} data-fase={fase} className={`aviso-carregando${fase === 2 ? ' aviso-carregando--lento' : ''}`}>
      {fase >= 1 && (
        <>
          <span className="aviso-carregando__giro" aria-hidden="true" />
          <span>{fase === 2 ? MENSAGEM_CARREGAMENTO_LENTO : `${label}…`}</span>
        </>
      )}
    </div>
  );
};

/** Aviso de página inteira enquanto o pacote da tela baixa (Suspense das rotas). */
export const CarregandoPagina: React.FC = () => {
  useMarcarPaginaCarregando();
  const visivel = useIndicadorComAtraso(true);
  if (!visivel) return null;
  return (
    <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem 0' }}>
      <AvisoCarregando label="Carregando a página" />
      <div className="skeleton-box" style={{ height: 96, borderRadius: 12 }} />
      <div className="skeleton-box" style={{ height: 300, borderRadius: 12 }} />
    </div>
  );
};
