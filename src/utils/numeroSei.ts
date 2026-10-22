/**
 * Número SEI informado na tarefa do plano (migration 154): documento (7 a 10 dígitos) ou processo
 * (17 dígitos, com a máscara NNNNN.NNNNNN/AAAA-DD). O banco confere de novo com a mesma regra.
 */
export type NumeroSeiLido =
  | { tipo: 'VAZIO' }
  | { tipo: 'DOCUMENTO' | 'PROCESSO'; valor: string }
  | { tipo: 'INVALIDO' };

export function lerNumeroSei(texto: string): NumeroSeiLido {
  const v = texto.trim();
  if (!v) return { tipo: 'VAZIO' };
  if (/^\d{7,10}$/.test(v)) return { tipo: 'DOCUMENTO', valor: v };
  const d = v.replace(/\D/g, '');
  if (/^[\d./ -]+$/.test(v) && d.length === 17) {
    return { tipo: 'PROCESSO', valor: `${d.slice(0, 5)}.${d.slice(5, 11)}/${d.slice(11, 15)}-${d.slice(15)}` };
  }
  return { tipo: 'INVALIDO' };
}

/** Linha de ajuda abaixo do campo: o que o sistema entendeu ou como corrigir. */
export function descreverNumeroSei(lido: NumeroSeiLido): string {
  if (lido.tipo === 'DOCUMENTO') return `Documento SEI ${lido.valor}`;
  if (lido.tipo === 'PROCESSO') return `Processo SEI ${lido.valor}`;
  if (lido.tipo === 'INVALIDO') return 'Use os dígitos do documento (ex.: 28451237) ou o processo (ex.: 08020.012345/2025-11).';
  return 'Número do documento ou do processo no SEI.';
}
