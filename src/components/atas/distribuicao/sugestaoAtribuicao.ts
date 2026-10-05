import { resolveManagerPropagation, type ManagerTarget } from '../../../services/managerAssignmentService';
import type { ArpItemContractLinkPair } from '../../../services/arpContractLinkService';
import { PESO_COMPLEXIDADE, type NivelComplexidade } from './complexidade';
import type { DistribuicaoItem, DistribuicaoLinha } from './distribuicaoEquipe';

/** Instrumento vigente e quem o gere hoje (`null` = sem gestor). */
export interface ItemIndexado {
  item: DistribuicaoItem;
  gestorNome: string | null;
}

const chaveItem = (tipo: 'ATA' | 'CONTRATO', chave: string) => `${tipo}:${chave}`;

/** Índice de todos os instrumentos vigentes da distribuição, por tipo e chave. */
export function indexarItens(linhas: DistribuicaoLinha[]): Map<string, ItemIndexado> {
  const index = new Map<string, ItemIndexado>();
  for (const l of linhas) {
    for (const item of l.itens) index.set(chaveItem(item.tipo, item.chave), { item, gestorNome: l.gestorNome });
  }
  return index;
}

/** O que muda de mãos: os alvos escolhidos mais o que vem junto pelos vínculos ata ↔ contrato (só vigentes contam carga). */
export interface LoteAtribuicao {
  itens: ItemIndexado[];
  atas: number;
  contratos: number;
  /** Contratos/atas vigentes que entram só pela propagação (não estavam entre os alvos). */
  vinculados: number;
  complexidade: Record<NivelComplexidade, number>;
  /** Carga equivalente do lote inteiro. */
  equivalente: number;
}

export function montarLote(targets: ManagerTarget[], links: ArpItemContractLinkPair[], index: Map<string, ItemIndexado>): LoteAtribuicao {
  const alvos = new Set(targets.map((t) => (t.tipo === 'ATA' ? chaveItem('ATA', t.ataKey) : chaveItem('CONTRATO', t.contractKey))));
  const { ataKeys, contractKeys } = resolveManagerPropagation(targets, links);
  const chaves = [...ataKeys.map((k) => chaveItem('ATA', k)), ...contractKeys.map((k) => chaveItem('CONTRATO', k))];

  const lote: LoteAtribuicao = { itens: [], atas: 0, contratos: 0, vinculados: 0, complexidade: { ALTA: 0, MEDIA: 0, BAIXA: 0 }, equivalente: 0 };
  for (const chave of chaves) {
    const indexado = index.get(chave);
    if (!indexado) continue; // encerrado: muda de gestor, mas não pesa na carga vigente
    lote.itens.push(indexado);
    if (indexado.item.tipo === 'ATA') lote.atas++;
    else lote.contratos++;
    if (!alvos.has(chave)) lote.vinculados++;
    lote.complexidade[indexado.item.complexidade.nivel]++;
    lote.equivalente += PESO_COMPLEXIDADE[indexado.item.complexidade.nivel];
  }
  return lote;
}

export interface CandidatoAtribuicao {
  nome: string;
  userId: string | null;
  /** Perfil "gestor": aparece em "Gestores" e entra na sugestão. Coordenador e outros perfis, nunca. */
  ehGestor: boolean;
  perfilLabel?: string;
}

export interface OpcaoAtribuicao extends CandidatoAtribuicao {
  cargaAtual: number;
  /** Carga depois de receber o lote (o que já é dele não soma de novo). */
  cargaDepois: number;
  urgentes: number;
  atrasadas: number;
  /** Já é o gestor de todo o lote: atribuir não muda nada. */
  jaEhGestor: boolean;
}

/**
 * Carga atual → carga depois de cada candidato (só usuários cadastrados), e uma sugestão discreta: entre os de
 * perfil gestor, o de menor carga depois da atribuição; empate pelo menor número de urgentes. Ter carteira não
 * torna ninguém "gestor" para a sugestão (ex.: coordenador com um contrato). Só sugere com 2+ gestores possíveis.
 */
export function avaliarCandidatos(
  lote: LoteAtribuicao,
  candidatos: CandidatoAtribuicao[],
  linhas: DistribuicaoLinha[]
): { opcoes: OpcaoAtribuicao[]; sugestao: string | null } {
  const linhaPorNome = new Map(linhas.filter((l) => l.gestorNome !== null).map((l) => [l.gestorNome as string, l]));

  const opcoes = candidatos.map((c): OpcaoAtribuicao => {
    const linha = linhaPorNome.get(c.nome);
    const cargaAtual = linha?.equivalente ?? 0;
    const acrescimo = lote.itens
      .filter((i) => i.gestorNome !== c.nome)
      .reduce((soma, i) => soma + PESO_COMPLEXIDADE[i.item.complexidade.nivel], 0);
    return {
      ...c,
      cargaAtual,
      cargaDepois: cargaAtual + acrescimo,
      urgentes: linha?.pendencias.urgentes ?? 0,
      atrasadas: linha?.pendencias.atrasadas ?? 0,
      jaEhGestor: lote.itens.length > 0 && acrescimo === 0
    };
  });

  // Gestores primeiro, depois os demais servidores; em cada grupo, ordem alfabética (sem ranking).
  opcoes.sort((a, b) => Number(b.ehGestor) - Number(a.ehGestor) || a.nome.localeCompare(b.nome, 'pt-BR'));

  const elegiveis = opcoes.filter((o) => o.ehGestor && !o.jaEhGestor);
  const sugestao =
    elegiveis.length >= 2
      ? [...elegiveis].sort((a, b) => a.cargaDepois - b.cargaDepois || a.urgentes - b.urgentes || a.nome.localeCompare(b.nome, 'pt-BR'))[0].nome
      : null;

  return { opcoes, sugestao };
}
