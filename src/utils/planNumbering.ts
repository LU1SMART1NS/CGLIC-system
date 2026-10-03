/**
 * Numeração do plano de gestão (Ata e Contrato).
 *
 * Etapa e tarefa são numeradas pela posição na tela (1, 2... e 1.1, 1.2...), recomeçando em cada
 * módulo. O número não é gravado no nome. Nomes antigos que o usuário numerou à mão ("1. Verificar...")
 * perdem esse prefixo na exibição e na edição, para o número não aparecer duas vezes.
 */

/** Prefixo digitado à mão: "1.", "1.1.", "1)" ou "1.1 " (sem ponto final, mas com subnível). */
const NUMERACAO_MANUAL = /^\s*(?:\d+(?:\.\d+)*[.)]|\d+(?:\.\d+)+)\s+/;

export function stripNumeracaoManual(nome: string | null | undefined): string {
  return (nome ?? '').replace(NUMERACAO_MANUAL, '');
}

/** "2" para a etapa; "2.3" para a terceira tarefa da segunda etapa. */
export function numeroEtapa(etapaIndex: number): string {
  return String(etapaIndex + 1);
}

export function numeroTarefa(etapaIndex: number, tarefaIndex: number): string {
  return `${etapaIndex + 1}.${tarefaIndex + 1}`;
}
