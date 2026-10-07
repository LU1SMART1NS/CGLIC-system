import type {
  EntregaPrevista,
  ExpectativaPagamento,
  HistoricoPagamentos,
  SugestaoExpectativa,
  TipoExpectativa
} from '../../services/expectativaPagamentoService';

/** Segmento da linha na aba Previsão: a marca, quando há; sem marca, a sugestão do sistema. */
export type ClasseExpectativa = 'SUGERIDO_MENSAL' | 'TALVEZ_MENSAL' | TipoExpectativa | 'SEM_CLASSE';

export interface LinhaExpectativa {
  contractKey: string;
  numero: string;
  fornecedorNome?: string;
  gestorNome?: string;
  marca?: ExpectativaPagamento;
  historico?: HistoricoPagamentos;
  sugestao: SugestaoExpectativa;
  /** Entregas previstas a partir de hoje. */
  entregas: EntregaPrevista[];
  classe: ClasseExpectativa;
}

export function classeDaLinha(l: Pick<LinhaExpectativa, 'marca' | 'sugestao'>): ClasseExpectativa {
  if (l.marca) return l.marca.tipo;
  if (l.sugestao === 'MENSAL') return 'SUGERIDO_MENSAL';
  if (l.sugestao === 'TALVEZ_MENSAL') return 'TALVEZ_MENSAL';
  return 'SEM_CLASSE';
}

export const ROTULO_TIPO: Record<TipoExpectativa, string> = {
  MENSAL: 'Mensal',
  ENTREGA: 'Por entrega',
  EVENTUAL: 'Eventual'
};
