/** A gravação só troca o status (sem nome, responsável, prazo nem observação)? */
export function soMudaStatus(input: Record<string, unknown>): boolean {
  return Object.entries(input).every(([k, v]) => k === 'taskId' || k === 'status' || v === undefined);
}
