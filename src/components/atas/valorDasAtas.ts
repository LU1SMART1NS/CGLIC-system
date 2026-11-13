import type { FatiasDaAta, FiltroGti } from '../../config/gruposGti';
import type { CarteiraAtaExecucao } from '../../utils/carteiraItens';
import type { ArpRecord } from '../../types';
import { SEM_UNIDADE } from '../carteira/CarteiraExecucaoSelects';

export interface TotaisDasAtas {
  atas: number;
  /** Valor total das atas (todos os órgãos), pelos itens. */
  valorTotal: number;
  valorSenasp: number;
  valorConsumido: number;
  /** Registrado pelos participantes (todos os grupos) e pelo GTI filtrado, somados das fatias de cada ata. */
  registradoParticipantes: number;
  registradoGti: number;
  /** Alocado à unidade interna filtrada (R$), ou ainda a alocar com "Sem unidade", somado dos itens. */
  alocadoUnidade: number;
}

/** Soma o valor das atas exibidas (os mesmos filtros da lista): faixas do GTI e da unidade filtrados na Carteira de Atas. */
export function somarValorDasAtas(
  arps: ArpRecord[],
  execucaoDaArp: (arp: ArpRecord) => CarteiraAtaExecucao | undefined,
  fatiasDaArp: (arp: ArpRecord) => FatiasDaAta | undefined,
  gti: FiltroGti,
  /** Chave normalizada da unidade filtrada; nula sem filtro de unidade. */
  unidade: string | null = null
): TotaisDasAtas {
  const t: TotaisDasAtas = {
    atas: arps.length,
    valorTotal: 0,
    valorSenasp: 0,
    valorConsumido: 0,
    registradoParticipantes: 0,
    registradoGti: 0,
    alocadoUnidade: 0
  };
  for (const arp of arps) {
    const exec = execucaoDaArp(arp);
    t.valorTotal += exec?.valorTotal ?? 0;
    t.valorSenasp += exec?.valorSenasp ?? 0;
    t.valorConsumido += exec?.valorConsumido ?? 0;
    if (unidade) t.alocadoUnidade += (unidade === SEM_UNIDADE ? exec?.valorSemUnidade : exec?.valorAlocadoPorUnidade?.[unidade]) ?? 0;
    const fatias = fatiasDaArp(arp);
    if (fatias?.medida !== 'VALOR') continue;
    t.registradoParticipantes += fatias.total;
    if (gti !== 'TODOS') t.registradoGti += fatias.fatias.find((f) => f.grupo === gti)?.quantidade ?? 0;
  }
  return t;
}
