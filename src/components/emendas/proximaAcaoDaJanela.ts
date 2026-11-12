import type { PedidoEmenda } from '../../services/emendasService';
import type { AcaoDaJanela } from './EtapaPedidoModal';

/** A ação da janela do próximo passo do pedido (as mesmas regras de proximaAcao). */
export function proximaAcaoDaJanela(p: PedidoEmenda): AcaoDaJanela {
  switch (p.etapa) {
    case 'RESERVADO':
      return 'MINUTA';
    case 'MINUTA':
      return 'OFICIO';
    case 'OFICIO':
      return 'CONFERIDO';
    case 'CONFERIDO':
      return 'SOLICITADO';
    case 'SOLICITADO':
      return 'AUTORIZADO';
    case 'AUTORIZADO':
      return 'CGOFI';
    case 'CGOFI':
      return 'EMPENHADO';
    default:
      return 'CONTRATACAO';
  }
}
