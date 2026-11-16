import type { ContratoFiscalizacao, EntregaFiscalizacao } from '../services/fiscalizacaoService';
import { autuado } from './fiscalizacao';
import { linhasDoContrato, type Linha } from './fiscalizacaoMesa';
import { agrupar, diasAte, resumir, type Resumo } from './fiscalizacaoResumo';

export type SegContrato = 'VOCE' | 'OUTROS' | 'FINALIZADO' | 'TODOS';

/** Linha de Fiscalização › Contratos: o próximo passo do contrato, o prazo dele e com quem está. */
export interface LinhaContrato {
  c: ContratoFiscalizacao;
  es: EntregaFiscalizacao[];
  r: Resumo;
  agora: Linha | null;
  mais: number;
  dias: number | null;
  seg: Exclude<SegContrato, 'TODOS'>;
}

/**
 * Contratos da SFC/CGLIC (inteira ou mista) com o próximo passo de cada um, como na mesa do Contrato 360. Usada pela
 * lista de Contratos e pelo número do menu Fiscalização, para os dois contarem igual.
 */
export function linhasDosContratos(contratos: ContratoFiscalizacao[], entregas: EntregaFiscalizacao[], hoje: string): LinhaContrato[] {
  const porContrato = agrupar(entregas, (e) => e.contractKey);
  return contratos
    .filter((c) => c.situacao === 'SFC' || c.situacao === 'MISTA')
    .map((c) => {
      const es = porContrato.get(c.contractKey) ?? [];
      const r = resumir(es);
      const { comVoce, comOutros } = linhasDoContrato(es, !autuado(c), () => {}, () => {});
      const agora = comVoce[0] ?? comOutros[0] ?? null;
      const mais = comVoce.length ? comVoce.length - 1 : 0;
      const dias = agora?.limite ? diasAte(agora.limite, hoje) : null;
      const seg: LinhaContrato['seg'] = r.fase === 'FINALIZADO' ? 'FINALIZADO' : comVoce.length ? 'VOCE' : 'OUTROS';
      return { c, es, r, agora, mais, dias, seg };
    });
}
