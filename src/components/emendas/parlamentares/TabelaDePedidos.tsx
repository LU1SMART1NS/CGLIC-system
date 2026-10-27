import React from 'react';
import { DataTable, type Column } from '../../../design-system/components/DataTable';
import { StatusBadge } from '../../../design-system/components/StatusBadge';
import { carteiraDetalhe, carteiraIdentificacao, carteiraNumero, carteiraValor } from '../../carteira/carteiraStyles';
import { useNavigateWithOrigin } from '../../../hooks/useDetailOrigin';
import { formatCurrency } from '../../../utils/format';
import { curto, dataBR } from '../../../utils/emendasKits';
import { avisoGrave, avisosDoPedido, contratosDoPedido, execucaoDoPedido, linhasAtivas, ROTULO_ETAPA, valorDoPedidoNaEtapa } from '../../../utils/emendasPedidos';
import { numeroDaEmenda } from '../../../utils/emendasSemPedido';
import { faltaAnoDaEmenda, numeroDoPedido, rotaDoPedido } from '../../../utils/emendasNomeDoPedido';
import type { ConferenciaEmpenho, ItemCaep, NotaDaLinha, PedidoEmenda } from '../../../services/emendasService';
import type { PrecoPrevisto } from '../../../services/emendasQuadroService';
import type { CredorNoPedido } from '../../../utils/emendasConferenciaNota';

interface Props {
  pedidos: PedidoEmenda[];
  itens: Map<string, ItemCaep>;
  notas: Map<string, NotaDaLinha>;
  precos: Map<string, PrecoPrevisto> | undefined;
  hoje: string;
  diferencas: Map<string, ConferenciaEmpenho[]>;
  credor: Map<string, CredorNoPedido[]>;
  testId: string;
}

/**
 * Pedidos de um parlamentar ou de uma emenda (Parlamentar 360 e Emenda 360): o número no parlamentar (1/2026) ou a
 * reserva, os itens, o valor, o pago, a etapa e o aviso mais grave. A linha abre o Pedido 360, com origem.
 */
export const TabelaDePedidos: React.FC<Props> = ({ pedidos, itens, notas, precos, hoje, diferencas, credor, testId }) => {
  const navegar = useNavigateWithOrigin();
  const colunasPedidos: Column<PedidoEmenda>[] = [
    {
      key: 'pedido',
      header: 'Pedido',
      priority: 'primary',
      nowrap: true,
      render: (p) => {
        const numero = numeroDoPedido(p);
        return numero ? (
          <span style={carteiraIdentificacao}>{numero}</span>
        ) : (
          <>
            <div style={carteiraValor}>{faltaAnoDaEmenda(p) ? `Emenda ${numeroDaEmenda(p.siopEmenda!)}` : 'Reserva'}</div>
            <div style={carteiraDetalhe}>{faltaAnoDaEmenda(p) ? 'ano a informar' : p.origem === 'PLANILHA' ? 'da planilha' : `de ${dataBR(p.reservadoEm)}`}</div>
          </>
        );
      }
    },
    {
      key: 'itens',
      header: 'Itens',
      minWidth: '220px',
      render: (p) => {
        const ls = linhasAtivas(p);
        const nomes = ls.slice(0, 2).map((l) => (l.tipo === 'KIT' ? `${l.quantidade} ${l.kitNome}` : `${l.quantidade} ${itens.get(l.itemKey ?? '')?.nomeCurto?.trim() || curto(itens.get(l.itemKey ?? '')?.descricao ?? l.itemKey ?? '', 30)}`));
        return (
          <>
            <div style={carteiraValor}>{nomes.join(' · ') || '—'}</div>
            {ls.length > 2 && <div style={carteiraDetalhe}>+{ls.length - 2} {ls.length - 2 === 1 ? 'item' : 'itens'}</div>}
          </>
        );
      }
    },
    { key: 'valor', header: 'Valor', align: 'right', nowrap: true, render: (p) => <span style={carteiraNumero}>{formatCurrency(valorDoPedidoNaEtapa(p, itens, precos).valor)}</span> },
    {
      key: 'pago',
      header: 'Pago',
      align: 'right',
      nowrap: true,
      render: (p) => {
        const e = execucaoDoPedido(p, notas);
        return e.notas > 0 ? <span style={carteiraNumero}>{formatCurrency(e.pago)}</span> : <span style={carteiraDetalhe}>—</span>;
      }
    },
    {
      key: 'etapa',
      header: 'Etapa',
      nowrap: true,
      render: (p) => {
        const contratado = p.etapa === 'CONTRATACAO' && contratosDoPedido(p, notas).contratado;
        return <StatusBadge label={contratado ? 'Contratado' : ROTULO_ETAPA[p.etapa]} variant={p.etapa === 'CANCELADO' ? 'neutral' : contratado || p.etapa === 'EMPENHADO' || p.etapa === 'CONTRATACAO' ? 'success' : 'info'} size="sm" dot={false} />;
      }
    },
    {
      key: 'aviso',
      header: 'Aviso',
      nowrap: true,
      render: (p) => {
        const [a, ...outros] = avisosDoPedido(p, itens, hoje, notas, diferencas.get(p.id), credor.get(p.id));
        if (!a) return <span style={carteiraDetalhe}>—</span>;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <StatusBadge label={a.curto} variant={avisoGrave(a) ? 'danger' : 'warning'} size="sm" dot={false} />
            {outros.length > 0 && <span style={{ ...carteiraDetalhe, fontWeight: 700 }}>+{outros.length}</span>}
          </span>
        );
      }
    }
  ];

  return (
    <DataTable<PedidoEmenda>
      testId={testId}
      className="data-table-container--flush"
      data={pedidos}
      keyExtractor={(p) => p.id}
      columns={colunasPedidos}
      rowStyle={(p) => (p.etapa === 'CANCELADO' ? { opacity: 0.6 } : undefined)}
      rowOpen={(p) => () => navegar(rotaDoPedido(p))}
    />
  );
};
