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
