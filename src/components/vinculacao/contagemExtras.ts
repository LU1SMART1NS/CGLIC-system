import { useSyncExternalStore } from 'react';
import type { CarteiraItemRow } from '../../utils/carteiraItens';

/** Itens da carteira que ainda pedem alocação: sem alocação ou parcialmente alocados, em atas vigentes e com quantitativo SENASP. */
export function contarItensAAlocar(rows: Pick<CarteiraItemRow, 'quantitativoSenasp' | 'faixa' | 'nivelAlocacao'>[]): number {
  return rows.filter((r) => r.quantitativoSenasp > 0 && r.faixa !== 'EXPIRADO' && r.nivelAlocacao !== 'TOTAL').length;
}

/**
 * Contagens do menu que dependem da carteira inteira de atas e contratos. Quem calcula (ContagensDaCarteira) só
 * entra em cena quando a carteira já está no cache do navegador; antes disso o valor é nulo e o menu mostra só o
 * que as consultas leves já sabem.
 */
export interface ContagensExtras {
  contratosAta: number | null;
  itensAAlocar: number | null;
  /** Central de Distribuição (só o coordenador): atas sem gestor e contratos com gestor diferente da ata. */
  atasSemGestor: number | null;
  gestorDiferente: number | null;
}

const VAZIO: ContagensExtras = { contratosAta: null, itensAAlocar: null, atasSemGestor: null, gestorDiferente: null };
let estado: ContagensExtras = VAZIO;
const ouvintes = new Set<() => void>();

export function definirContagemExtra(chave: keyof ContagensExtras, valor: number | null) {
  if (estado[chave] === valor) return;
  estado = { ...estado, [chave]: valor };
  ouvintes.forEach((o) => o());
}

export function useContagensExtras(): ContagensExtras {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    () => estado,
    () => estado
  );
}

/** Para os testes. */
export function zerarContagensExtras() {
  estado = VAZIO;
  ouvintes.forEach((o) => o());
}
