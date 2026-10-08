import type { DistribuicaoDoEmpenho } from '../../services/distribuicaoEmpenhoService';
import type { FaturaCarteira } from '../../services/financeiroCarteiraService';

/** Nota que espera a equipe: a vincular ou a rever (as vinculadas automaticamente não entram na fila). */
export const aguardaVinculoAosItens = (d: DistribuicaoDoEmpenho) => d.situacao === 'A_DISTRIBUIR' || d.situacao === 'REVISAR';

/** Nota que a equipe vinculou (aparece em "Vinculadas pela equipe"). */
export const vinculadaPelaEquipe = (d: DistribuicaoDoEmpenho) => d.situacao === 'DISTRIBUIDA' && d.origem === 'USUARIO';

/** Sugestão que pode ser aceita sem escolha: igual ao total de um item ou múltiplo do preço de um item só. */
export const temSugestaoUnica = (d: DistribuicaoDoEmpenho) =>
  (d.sugestaoTipo === 'TOTAL_DO_ITEM' || d.sugestaoTipo === 'MULTIPLO_DO_PRECO') && d.sugestao.length === 1;

/** Pode entrar no lote "Vincular pela sugestão": a vincular (não a rever) e com sugestão única. */
export const entraNoLote = (d: DistribuicaoDoEmpenho) => d.situacao === 'A_DISTRIBUIR' && temSugestaoUnica(d);

export type FiltroSugestao = 'TODOS' | 'UNICA' | 'VARIAS' | 'NENHUMA';

export function passaFiltroSugestao(d: DistribuicaoDoEmpenho, filtro: FiltroSugestao): boolean {
  if (filtro === 'TODOS') return true;
  if (filtro === 'UNICA') return temSugestaoUnica(d);
  if (filtro === 'VARIAS') return d.sugestaoTipo === 'VARIAS_POSSIBILIDADES';
  return !d.sugestaoTipo || d.sugestaoTipo === 'SEM_SUGESTAO';
}

/** A rever primeiro, depois as mais recentes. */
export function ordenarFila(lista: DistribuicaoDoEmpenho[], emissaoDe: (d: DistribuicaoDoEmpenho) => string | null | undefined): DistribuicaoDoEmpenho[] {
  const peso = (d: DistribuicaoDoEmpenho) => (d.situacao === 'REVISAR' ? 0 : 1);
  return [...lista].sort((a, b) => peso(a) - peso(b) || (emissaoDe(b) ?? '').localeCompare(emissaoDe(a) ?? ''));
}

/** Uma linha da fila "Empenhos ao contrato": a fatura e cada NE que ela cita sem vínculo no contrato. */
export interface EmpenhoCitadoSemVinculo {
  chave: string;
  numeroEmpenho: string;
  fatura: FaturaCarteira;
}

/**
 * Faturas que citam NE não vinculada ao contrato, só dos contratos cujos empenhos já foram consultados (antes
 * disso toda NE pareceria sem vínculo). Faturas canceladas ficam de fora.
 */
export function empenhosCitadosSemVinculo(faturas: FaturaCarteira[], contratosConsultados: ReadonlySet<string>): EmpenhoCitadoSemVinculo[] {
  const linhas: EmpenhoCitadoSemVinculo[] = [];
  for (const f of faturas) {
    if (f.cancelada || f.empenhosSemVinculo <= 0 || !contratosConsultados.has(f.contractKey)) continue;
    const numeros = (f.empenhosSemVinculoNumeros ?? '').split(',').map((n) => n.trim()).filter(Boolean);
    for (const numeroEmpenho of numeros) linhas.push({ chave: `${f.idFatura}|${numeroEmpenho}`, numeroEmpenho, fatura: f });
  }
  return linhas.sort((a, b) => (b.fatura.emissao ?? '').localeCompare(a.fatura.emissao ?? ''));
}
