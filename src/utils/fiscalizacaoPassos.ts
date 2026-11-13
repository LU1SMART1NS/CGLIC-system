import type { EntregaFiscalizacao, EtapaEntrega, MovimentoEntrega } from '../services/fiscalizacaoService';
import { etapaDef } from './fiscalizacaoEntregas';

/*
 * Avançar e voltar a etapa do item (o mesmo jeito do pedido de emenda): o botão abre o próximo passo; onde o caminho
 * se divide (depois da produção), a janela mostra só as saídas possíveis; voltar desfaz o último passo, com motivo.
 */

type Item = Pick<EntregaFiscalizacao, 'etapa' | 'pagoEm' | 'origem' | 'emenda' | 'responsavel'> & Partial<Pick<EntregaFiscalizacao, 'pedidoId'>>;
const deEmenda = (e: Item) => e.origem === 'EMENDA' || Boolean(e.emenda);

/** As etapas para onde o item pode ir agora. Vazio: o próximo movimento é de outros (financeiro) ou acabou. */
export function proximasEtapas(e: Item): EtapaEntrega[] {
  if (e.responsavel === 'AREA') return [];
  switch (e.etapa) {
    case 'INFO_PEDIDA': return ['INFO_ENVIADA'];
    case 'INFO_ENVIADA': return ['ORDEM'];
    case 'ORDEM': return ['PRODUCAO'];
    case 'PRODUCAO': return ['TRANSITO', 'RETIRADA', 'CONTROLADO', 'ENTREGUE'];
    case 'CONTROLADO': return ['TRANSITO', 'RETIRADA', 'ENTREGUE'];
    case 'TRANSITO':
    case 'RETIRADA': return ['ENTREGUE'];
    case 'ENTREGUE': return ['TRP'];
    case 'TRP': return ['TRD'];
    case 'TRD': return ['PAGAMENTO'];
    case 'PAGAMENTO': return e.pagoEm ? [deEmenda(e) ? 'SAL' : 'FINALIZADO'] : [];
    case 'SAL': return ['FINALIZADO'];
    default: return [];
  }
}

/** Itens juntos na mesa avançam juntos: só as saídas que servem a todos. */
export function proximasDoGrupo(es: Item[]): EtapaEntrega[] {
  if (!es.length) return [];
  return es.map(proximasEtapas).reduce((a, b) => a.filter((x) => b.includes(x)));
}

/** O texto do botão: o que se registra ao avançar. */
export const VERBO: Record<EtapaEntrega, string> = {
  INFO_PEDIDA: 'Pedir as informações',
  INFO_ENVIADA: 'Registrar as informações',
  ORDEM: 'Registrar a Ordem',
  PRODUCAO: 'Registrar o início da produção',
  CONTROLADO: 'Aguardar o Exército',
  TRANSITO: 'Registrar o envio',
  RETIRADA: 'Aguardar a retirada',
  ENTREGUE: 'Registrar a entrega',
  TRP: 'Registrar o recebimento provisório',
  TRD: 'Registrar o recebimento definitivo',
  PAGAMENTO: 'Registrar o envio para pagamento',
  SAL: 'Registrar o Ofício à SAL',
  FINALIZADO: 'Finalizar a fiscalização'
};

/** O botão de avançar: o verbo do próximo passo, ou "Registrar o andamento" quando há escolha. */
export function rotuloDoAvanco(opcoes: EtapaEntrega[]): string | null {
  if (!opcoes.length) return null;
  return opcoes.length === 1 ? VERBO[opcoes[0]] : 'Registrar o andamento';
}

/** Explicação curta de cada saída, na escolha depois da produção. */
export const EXPLICA: Partial<Record<EtapaEntrega, string>> = {
  TRANSITO: 'O fornecedor despachou; a entrega está a caminho.',
  RETIRADA: 'Pronto na fábrica; o beneficiário vai buscar.',
  CONTROLADO: 'Produto controlado: espera a autorização da DFPC.',
  ENTREGUE: 'Chegou ao beneficiário (sem passar pelas etapas acima).'
};

/** Movimentos que contam como passo (as mesmas regras de voltar_etapa_entrega, migration 273). */
const PASSOS = new Set<MovimentoEntrega['tipo']>(['ETAPA', 'CARGA', 'CRIADA', 'AUTOMATICA', 'CORRECAO']);

export interface VoltaDoItem {
  /** Para onde volta; nulo quando não há passo anterior registrado. */
  para: EtapaEntrega | null;
  /** O registro que sai (o último passo). */
  apaga: MovimentoEntrega | null;
  /** Por que não volta por aqui. */
  impede: string | null;
}

/** Voltar desfaz só o último passo registrado (os movimentos vêm do mais novo ao mais velho). */
export function voltaDoItem(e: Item, movimentos: MovimentoEntrega[]): VoltaDoItem {
  if (e.responsavel === 'AREA') return { para: null, apaga: null, impede: 'Item da área requisitante não tem etapa na SFC/CGLIC.' };
  if (e.etapa === 'PAGAMENTO' && e.pagoEm) return { para: null, apaga: null, impede: 'A nota já foi paga: a etapa não volta. Se o registro está errado, peça ao coordenador para corrigir.' };
  if ((e.etapa === 'INFO_ENVIADA' || e.etapa === 'ORDEM') && e.pedidoId) return { para: null, apaga: null, impede: 'A Informação e a Ordem deste item estão também no pedido de emenda: a correção é no Pedido 360.' };
  const passos = movimentos.filter((m) => m.etapa && PASSOS.has(m.tipo));
  const atual = passos.findIndex((m) => m.etapa === e.etapa);
  const anterior = atual >= 0 ? passos.slice(atual + 1).find((m) => m.etapa !== e.etapa) : undefined;
  if (atual < 0 || !anterior?.etapa) return { para: null, apaga: null, impede: `Não há passo anterior registrado antes de "${etapaDef(e.etapa).nome}" (o item já chegou nesta etapa). Se está errado, peça ao coordenador para corrigir.` };
  return { para: anterior.etapa, apaga: passos[atual], impede: null };
}
