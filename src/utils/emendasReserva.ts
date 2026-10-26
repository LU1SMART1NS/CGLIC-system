/**
 * Pedido da reserva agrupado por beneficiário (protótipo aprovado em 26/10/2026): cada grupo é um órgão (ou "a informar")
 * com as suas linhas. O banco não muda: ao gravar, cada linha leva o beneficiário do seu grupo. Funções puras, usadas
 * pela janela de reserva (PedidoModal).
 */

export interface GrupoReserva {
  chave: string;
  /** null = beneficiário a informar (ou o órgão ainda não escolhido). */
  beneficiarioId: string | null;
}

/** O mínimo de uma linha da reserva que estas funções precisam. */
export interface LinhaDoGrupo {
  chave: string;
  id?: string;
  tipo: 'ITEM' | 'KIT';
  itemKey: string | null;
  kitId: string | null;
  quantidade: number;
  grupo: string;
}

/** Mesmo item (ou mesmo kit): a chave que junta linhas iguais. */
export const chaveDoConteudo = (l: Pick<LinhaDoGrupo, 'tipo' | 'itemKey' | 'kitId'>) => (l.tipo === 'KIT' ? `KIT:${l.kitId}` : `ITEM:${l.itemKey}`);

/** Grupos das linhas gravadas, na ordem em que o beneficiário aparece; sem linhas, um grupo vazio "a informar". */
export function agruparPorBeneficiario<T extends { beneficiarioId: string | null }>(
  linhas: T[],
  novaChave: () => string
): { grupos: GrupoReserva[]; linhas: (Omit<T, 'beneficiarioId'> & { grupo: string })[] } {
  const grupos: GrupoReserva[] = [];
  const porBen = new Map<string | null, string>();
  const saida = linhas.map(({ beneficiarioId, ...resto }) => {
    let g = porBen.get(beneficiarioId);
    if (!g) {
      g = novaChave();
      porBen.set(beneficiarioId, g);
      grupos.push({ chave: g, beneficiarioId });
    }
    return { ...resto, grupo: g };
  });
  if (!grupos.length) grupos.push({ chave: novaChave(), beneficiarioId: null });
  return { grupos, linhas: saida };
}

/** Beneficiário que cada linha leva ao banco. */
export const beneficiarioDaLinha = (l: Pick<LinhaDoGrupo, 'grupo'>, grupos: GrupoReserva[]) => grupos.find((g) => g.chave === l.grupo)?.beneficiarioId ?? null;

/**
 * Soma `quantidade` do conteúdo de `modelo` no grupo: na linha igual que já está lá ou numa linha nova (logo depois da
 * última linha do grupo, para o grupo ficar junto).
 */
export function somarNoGrupo<L extends LinhaDoGrupo>(linhas: L[], modelo: L, grupo: string, quantidade: number, novaChave: () => string): L[] {
  if (quantidade <= 0) return linhas;
  const igual = linhas.find((l) => l.grupo === grupo && chaveDoConteudo(l) === chaveDoConteudo(modelo));
  if (igual) return linhas.map((l) => (l === igual ? { ...l, quantidade: l.quantidade + quantidade } : l));
  const nova = { ...modelo, chave: novaChave(), id: undefined, quantidade, grupo } as L;
  const ultima = linhas.map((l) => l.grupo).lastIndexOf(grupo);
  return ultima < 0 ? [...linhas, nova] : [...linhas.slice(0, ultima + 1), nova, ...linhas.slice(ultima + 1)];
}

/**
 * Reparte a linha entre os grupos: `partes` diz quanto vai para cada grupo e tem de somar a quantidade da linha. A parte
 * do próprio grupo fica na linha (que mantém o id gravado); as outras vão para a linha igual do grupo ou para uma nova.
 */
export function repartirLinha<L extends LinhaDoGrupo>(linhas: L[], chave: string, partes: Map<string, number>, novaChave: () => string): L[] {
  const l = linhas.find((x) => x.chave === chave);
  if (!l) return linhas;
  const soma = [...partes.values()].reduce((s, q) => s + q, 0);
  if (soma !== l.quantidade || [...partes.values()].some((q) => !Number.isInteger(q) || q < 0)) return linhas;
  const fica = partes.get(l.grupo) ?? 0;
  let r = fica > 0 ? linhas.map((x) => (x === l ? { ...x, quantidade: fica } : x)) : linhas.filter((x) => x !== l);
  for (const [g, q] of partes) if (g !== l.grupo) r = somarNoGrupo(r, l, g, q, novaChave);
  return r;
}

/** Leva a linha inteira para outro grupo; se lá já existe o mesmo item, as quantidades se somam. */
export function moverLinha<L extends LinhaDoGrupo>(linhas: L[], chave: string, destino: string): L[] {
  const l = linhas.find((x) => x.chave === chave);
  if (!l || l.grupo === destino) return linhas;
  const igual = linhas.find((x) => x.grupo === destino && chaveDoConteudo(x) === chaveDoConteudo(l));
  if (igual) return linhas.filter((x) => x !== l).map((x) => (x === igual ? { ...x, quantidade: x.quantidade + l.quantidade } : x));
  // A linha muda de grupo inteira (com o id gravado) e vai para o fim do grupo de destino.
  const sem = linhas.filter((x) => x !== l);
  const ultima = sem.map((x) => x.grupo).lastIndexOf(destino);
  const movida = { ...l, grupo: destino };
  return ultima < 0 ? [...sem, movida] : [...sem.slice(0, ultima + 1), movida, ...sem.slice(ultima + 1)];
}

/** Grade da visão "Por item": uma linha por item ou kit, na ordem em que aparecem, com a quantidade de cada grupo. */
export function gradePorItem<L extends LinhaDoGrupo>(linhas: L[]): { conteudo: string; modelo: L; porGrupo: Map<string, number>; total: number }[] {
  const m = new Map<string, { conteudo: string; modelo: L; porGrupo: Map<string, number>; total: number }>();
  for (const l of linhas) {
    const c = chaveDoConteudo(l);
    let x = m.get(c);
    if (!x) m.set(c, (x = { conteudo: c, modelo: l, porGrupo: new Map(), total: 0 }));
    x.porGrupo.set(l.grupo, (x.porGrupo.get(l.grupo) ?? 0) + l.quantidade);
    x.total += l.quantidade;
  }
  return [...m.values()];
}

/** Uma célula da grade: define a quantidade do item no grupo (0 tira a linha daquele grupo). */
export function definirNoGrupo<L extends LinhaDoGrupo>(linhas: L[], modelo: L, grupo: string, quantidade: number, novaChave: () => string): L[] {
  const c = chaveDoConteudo(modelo);
  const doGrupo = linhas.filter((l) => l.grupo === grupo && chaveDoConteudo(l) === c);
  if (quantidade <= 0) return linhas.filter((l) => !doGrupo.includes(l));
  if (!doGrupo.length) return somarNoGrupo(linhas, modelo, grupo, quantidade, novaChave);
  const [primeira, ...resto] = doGrupo;
  return linhas.filter((l) => !resto.includes(l)).map((l) => (l === primeira ? { ...l, quantidade } : l));
}
