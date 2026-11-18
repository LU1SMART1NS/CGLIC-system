import { useEffect, useSyncExternalStore } from 'react';
import { useIsFetching } from '@tanstack/react-query';

/** Tempo sem nenhuma leitura em andamento que conta como "a tela encheu" (cobre a passagem de uma leitura à seguinte). */
export const SOSSEGO_DA_TELA_MS = 1000;
/** Teto: mesmo que a tela não pare de ler (banco lento), os números do menu saem depois disto. */
export const TETO_ESPERA_DA_TELA_MS = 20000;

// Vale para a aba inteira: a tela que abriu o sistema enche uma vez; depois disso o menu já não espera.
let carregada = false;
const ouvintes = new Set<() => void>();

function marcarCarregada() {
  if (carregada) return;
  carregada = true;
  for (const ouvinte of ouvintes) ouvinte();
}

function ouvir(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

const lerCarregada = () => carregada;

/** Só para testes: volta ao estado de quem acabou de abrir o sistema. */
export function zerarTelaCarregada(): void {
  carregada = false;
}

/**
 * true depois que a tela aberta terminou de carregar: nenhuma leitura em andamento por SOSSEGO_DA_TELA_MS, ou
 * TETO_ESPERA_DA_TELA_MS desde que o menu apareceu. Os números do menu esperam por isto para não disputar a fila do
 * banco com a tela (estudo docs/estudos/inicio-fila-do-banco.md, corte 1). Uma vez true, fica true.
 */
export function useTelaCarregada(): boolean {
  const lendo = useIsFetching();
  const pronta = useSyncExternalStore(ouvir, lerCarregada, lerCarregada);

  useEffect(() => {
    if (carregada) return undefined;
    const teto = setTimeout(marcarCarregada, TETO_ESPERA_DA_TELA_MS);
    return () => clearTimeout(teto);
  }, []);

  useEffect(() => {
    if (carregada || lendo > 0) return undefined;
    const sossego = setTimeout(marcarCarregada, SOSSEGO_DA_TELA_MS);
    return () => clearTimeout(sossego);
  }, [lendo]);

  return pronta;
}

/**
 * Etapas dos números do menu (estudo docs/estudos/contagens-do-menu.md, opção 1). Depois que a tela enche, os grupos
 * não leem todos juntos: sai um, e o seguinte só quando o banco fica quieto por SOSSEGO_ENTRE_ETAPAS_MS (ou depois de
 * TETO_POR_ETAPA_MS). Medição de 18/11/2026: sozinhas, as consultas do menu levam menos de 1 s; ~25 juntas iam a
 * 8-14 s e às vezes passavam do limite de 8 s do banco. Nenhum número muda; os das últimas etapas aparecem depois.
 */
export const ETAPA_DO_MENU = {
  /** Financeiro, e o Início e a Fiscalização do fiscal. */
  financeiro: 0,
  vinculos: 1,
  emendas: 2,
  /** Contratos à ata, atas sem gestor, itens a alocar, atas a montar, grupos de UASGs. */
  carteira: 3
} as const;
const ULTIMA_ETAPA = 3;
export const SOSSEGO_ENTRE_ETAPAS_MS = 500;
export const TETO_POR_ETAPA_MS = 15000;

// Vale para a aba inteira, como `carregada`: depois de liberadas, as etapas não voltam.
let etapaLiberada = -1;
const ouvintesDaEtapa = new Set<() => void>();

/**
 * Libera a etapa seguinte a `atual`, se ninguém já liberou (vários hooks montados chamam ao mesmo tempo). Exportada
 * para os testes; as telas usam useEtapaDoMenu.
 */
export function avancarDe(atual: number) {
  if (etapaLiberada !== atual || etapaLiberada >= ULTIMA_ETAPA) return;
  etapaLiberada = atual + 1;
  for (const ouvinte of ouvintesDaEtapa) ouvinte();
}

function ouvirEtapa(ouvinte: () => void) {
  ouvintesDaEtapa.add(ouvinte);
  return () => {
    ouvintesDaEtapa.delete(ouvinte);
  };
}

const lerEtapa = () => etapaLiberada;

/** Última etapa liberada (-1 antes de a tela encher). Para os testes. */
export const etapaLiberadaDoMenu = () => etapaLiberada;

/** Só para testes: volta às etapas de quem acabou de abrir o sistema. */
export function zerarEtapasDoMenu(): void {
  etapaLiberada = -1;
}

/** true quando a tela já encheu e a etapa `etapa` do menu foi liberada. Uma vez true, fica true. */
export function useEtapaDoMenu(etapa: number): boolean {
  const telaCarregada = useTelaCarregada();
  const lendo = useIsFetching();
  const liberada = useSyncExternalStore(ouvirEtapa, lerEtapa, lerEtapa);

  // A 1ª etapa sai assim que a tela enche.
  useEffect(() => {
    if (telaCarregada) avancarDe(-1);
  }, [telaCarregada]);

  // A seguinte, quando o banco fica quieto...
  useEffect(() => {
    if (liberada < 0 || liberada >= ULTIMA_ETAPA || lendo > 0) return undefined;
    const sossego = setTimeout(() => avancarDe(liberada), SOSSEGO_ENTRE_ETAPAS_MS);
    return () => clearTimeout(sossego);
  }, [liberada, lendo]);

  // ...ou depois do teto, se o banco não parar de ler.
  useEffect(() => {
    if (liberada < 0 || liberada >= ULTIMA_ETAPA) return undefined;
    const teto = setTimeout(() => avancarDe(liberada), TETO_POR_ETAPA_MS);
    return () => clearTimeout(teto);
  }, [liberada]);

  return liberada >= etapa;
}
