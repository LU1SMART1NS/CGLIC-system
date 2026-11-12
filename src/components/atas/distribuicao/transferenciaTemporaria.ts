import type { TransferenciaItem, TransferenciaTemporaria } from '../../../services/transferenciaTemporariaService';
import { parseContractKey } from '../../../services/managerAssignmentService';

/** "Ata 00074/2025" ou "Contrato 00018/2025 (200330)". */
export function rotuloDoItem(i: Pick<TransferenciaItem, 'tipo' | 'chave'>): string {
  if (i.tipo === 'ATA') return `Ata ${i.chave}`;
  const c = parseContractKey(i.chave);
  return c ? `Contrato ${c.numero}/${c.ano} (${c.uasg})` : `Contrato ${i.chave}`;
}

/** "2026-11-20" → "20/11/2026" (sem fuso: a data vem pura do banco). */
export function dataBR(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

/** "2026-11-20" → "20/11". */
export const diaMes = (iso: string) => dataBR(iso).slice(0, 5);

/** Data de hoje no formato do banco (AAAA-MM-DD), no fuso do navegador. */
export function hojeISO(agora: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

/** Dias de `de` até `ate` (datas AAAA-MM-DD); negativo se já passou. */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate.slice(0, 10)}T00:00:00Z`) - Date.parse(`${de.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

export const emCurso = (lista: TransferenciaTemporaria[]) => lista.filter((t) => t.desfeitaEm === null);

/** O retorno previsto chegou (ou passou) e a transferência ainda não foi desfeita. */
export const retornoChegou = (t: TransferenciaTemporaria, hoje: string) => t.desfeitaEm === null && t.retornoPrevisto <= hoje;

/** Transferência em curso do servidor, se houver. */
export function ausenciaDe(lista: TransferenciaTemporaria[], userId: string | null | undefined): TransferenciaTemporaria | null {
  if (!userId) return null;
  return emCurso(lista).find((t) => t.ausenteUserId === userId) ?? null;
}

export interface Recebidas {
  transferencia: TransferenciaTemporaria;
  atas: number;
  contratos: number;
  chaves: Set<string>;
}

/** O que o servidor recebeu de colegas ausentes (transferências em curso), por ausente. */
export function recebidasPor(lista: TransferenciaTemporaria[], userId: string | null | undefined): Recebidas[] {
  if (!userId) return [];
  return emCurso(lista)
    .map((t) => {
      const meus = t.itens.filter((i) => i.destinoUserId === userId);
      return {
        transferencia: t,
        atas: meus.filter((i) => i.tipo === 'ATA').length,
        contratos: meus.filter((i) => i.tipo === 'CONTRATO').length,
        chaves: new Set(meus.map((i) => `${i.tipo}:${i.chave}`))
      };
    })
    .filter((r) => r.chaves.size > 0);
}

/** Quanto foi para cada pessoa: "Carla Mendes: 4 atas · 1 contrato". */
export function resumoPorDestino(itens: Array<Pick<TransferenciaItem, 'tipo' | 'destinoNome'>>): Array<{ nome: string; atas: number; contratos: number }> {
  const porNome = new Map<string, { nome: string; atas: number; contratos: number }>();
  for (const i of itens) {
    const r = porNome.get(i.destinoNome) ?? { nome: i.destinoNome, atas: 0, contratos: 0 };
    if (i.tipo === 'ATA') r.atas++;
    else r.contratos++;
    porNome.set(i.destinoNome, r);
  }
  return Array.from(porNome.values()).sort((a, b) => b.atas + b.contratos - (a.atas + a.contratos) || a.nome.localeCompare(b.nome));
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
export const textoQuantidade = (atas: number, contratos: number) =>
  [atas > 0 ? plural(atas, 'ata', 'atas') : '', contratos > 0 ? plural(contratos, 'contrato', 'contratos') : ''].filter(Boolean).join(' · ') || 'nada';

export interface PreviaDesfazer {
  voltam: TransferenciaItem[];
  /** Mudaram de mãos no período: ficam com quem está hoje. */
  ficam: Array<TransferenciaItem & { atualNome: string | null }>;
}

/**
 * O que o Desfazer vai fazer, com os gestores de hoje (mesma regra da RPC): volta o que está com quem assumiu
 * (ou já voltou), fica o que mudou de mãos.
 */
export function previaDoDesfazer(
  t: TransferenciaTemporaria,
  gestorAtual: (tipo: 'ATA' | 'CONTRATO', chave: string) => { userId: string | null; nome: string | null } | undefined
): PreviaDesfazer {
  const voltam: TransferenciaItem[] = [];
  const ficam: PreviaDesfazer['ficam'] = [];
  for (const i of t.itens) {
    const atual = gestorAtual(i.tipo, i.chave);
    const atualId = atual?.userId ?? null;
    if (atualId === i.destinoUserId || atualId === i.origemUserId) voltam.push(i);
    else ficam.push({ ...i, atualNome: atual?.nome ?? null });
  }
  return { voltam, ficam };
}
