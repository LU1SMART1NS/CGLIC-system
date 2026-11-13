import type { FatiasDaAta, FiltroGti } from '../../config/gruposGti';
import type { CarteiraAtaExecucao } from '../../utils/carteiraItens';
import type { ArpRecord } from '../../types';

export interface TotaisDasAtas {
  atas: number;
  valorSenasp: number;
  valorConsumido: number;
  /** Registrado pelos participantes (todos os grupos) e pelo GTI filtrado, somados das fatias de cada ata. */
  registradoParticipantes: number;
  registradoGti: number;
}

/** Soma o valor das atas exibidas (os mesmos filtros da lista): linha de total no rodapé da Carteira de Atas. */
export function somarValorDasAtas(
  arps: ArpRecord[],
  execucaoDaArp: (arp: ArpRecord) => CarteiraAtaExecucao | undefined,
  fatiasDaArp: (arp: ArpRecord) => FatiasDaAta | undefined,
  gti: FiltroGti
): TotaisDasAtas {
  const t: TotaisDasAtas = { atas: arps.length, valorSenasp: 0, valorConsumido: 0, registradoParticipantes: 0, registradoGti: 0 };
  for (const arp of arps) {
    const exec = execucaoDaArp(arp);
    t.valorSenasp += exec?.valorSenasp ?? 0;
    t.valorConsumido += exec?.valorConsumido ?? 0;
    const fatias = fatiasDaArp(arp);
    if (fatias?.medida !== 'VALOR') continue;
    t.registradoParticipantes += fatias.total;
    if (gti !== 'TODOS') t.registradoGti += fatias.fatias.find((f) => f.grupo === gti)?.quantidade ?? 0;
  }
  return t;
}
