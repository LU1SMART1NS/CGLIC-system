import React from 'react';
import { DataTable, type Column } from '../../../design-system/components/DataTable';
import { StatusBadge } from '../../../design-system/components/StatusBadge';
import { carteiraDetalhe, carteiraIdentificacao, carteiraNumero, carteiraValor } from '../../carteira/carteiraStyles';
import { useNavigateWithOrigin } from '../../../hooks/useDetailOrigin';
import { formatCurrency } from '../../../utils/format';
import { ItensEBeneficiarios } from '../ItensEBeneficiarios';
import { useBeneficiariosEmendas } from '../../../hooks/useEmendas';
import { avisoGrave, avisosDoPedido, execucaoDoPedido, rotuloDaEtapaDoPedido, valorDoPedidoNaEtapa } from '../../../utils/emendasPedidos';
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
  const { data: beneficiariosLista = [] } = useBeneficiariosEmendas();
  const beneficiarios = React.useMemo(() => new Map(beneficiariosLista.map((b) => [b.id, b])), [beneficiariosLista]);
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
            {faltaAnoDaEmenda(p) && <div style={{ ...carteiraDetalhe, color: 'var(--color-warning-text)' }}>ano a informar</div>}
          </>
        );
      }
    },
    {
      key: 'itens',
      header: 'Itens e beneficiários',
      minWidth: '280px',
      render: (p) => <ItensEBeneficiarios pedido={p} itens={itens} beneficiarios={beneficiarios} />
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
        return <StatusBadge label={rotuloDaEtapaDoPedido(p, notas)} variant={p.etapa === 'CANCELADO' ? 'neutral' : p.etapa === 'EMPENHADO' || p.etapa === 'CONTRATACAO' ? 'success' : 'info'} size="sm" dot={false} />;
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
