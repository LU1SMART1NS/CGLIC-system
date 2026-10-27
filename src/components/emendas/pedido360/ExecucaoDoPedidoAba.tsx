import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DataTable, type Column } from '../../../design-system/components/DataTable';
import { StatusBadge } from '../../../design-system/components/StatusBadge';
import { NoticeBar } from '../../../design-system/components/NoticeBar';
import { carteiraDetalhe, carteiraNumero, carteiraSubtitle, carteiraValor } from '../../carteira/carteiraStyles';
import { CarteiraDetailLabel } from '../../carteira/CarteiraDetailLabel';
import { numeroDaChave } from '../../../utils/contractKeyUtils';
import { formatCurrency } from '../../../utils/format';
import { curto, dataBR } from '../../../utils/emendasKits';
import { execucaoDoPedido, jaEmpenhado, linhasAtivas, listaEmTexto } from '../../../utils/emendasPedidos';
import type { ConferenciaEmpenho, ItemCaep, LinhaPedido, NotaDaLinha, PedidoEmenda } from '../../../services/emendasService';
import type { CredorNoPedido } from '../../../utils/emendasConferenciaNota';
import { ExecucaoDoPedidoResumo } from '../emendasPartes';
import { EmpenhoDoPedido } from '../EmpenhoDoPedido';
import { CredorDoPedido } from '../CredorDoPedido';
import { EmendasDoPedido } from '../EmendasDoPedido';

interface Props {
  p: PedidoEmenda;
  itens: Map<string, ItemCaep>;
  notas: Map<string, NotaDaLinha>;
  conferencia: ConferenciaEmpenho[];
  credor: CredorNoPedido[];
  podeGerir: boolean;
  podeVerContratos: boolean;
}

interface NotaDoPedido {
  chave: string;
  nota: NotaDaLinha;
  linhas: LinhaPedido[];
}

const nomeDaLinha = (l: LinhaPedido, itens: Map<string, ItemCaep>) => {
  if (l.tipo === 'KIT') return `${l.quantidade} ${l.kitNome ?? 'kit'}`;
  const item = l.itemKey ? itens.get(l.itemKey) : undefined;
  return `${l.quantidade} ${item?.nomeCurto?.trim() || curto(item?.descricao ?? l.itemKey ?? '', 40)}`;
};

/** Situação da nota pelo que já foi liquidado e pago (valores da nota inteira). */
const situacaoDaNota = (n: NotaDaLinha): { texto: string; variante: 'success' | 'warning' | 'neutral' } => {
  const emp = n.valorEmpenhado ?? 0;
  const pago = n.valorPago ?? 0;
  const liq = n.valorLiquidado ?? 0;
  if (emp > 0 && pago >= emp - 0.01) return { texto: 'Paga', variante: 'success' };
  if (pago > 0) return { texto: 'Paga em parte', variante: 'warning' };
  if (liq > 0) return { texto: 'Liquidada, falta pagar', variante: 'warning' };
  return { texto: 'A liquidar', variante: 'neutral' };
};

/**
 * Aba Execução do Pedido 360 (protótipo aprovado em 27/10/2026): o dinheiro de cada nota do pedido até o pagamento,
 * a conferência do empenho (empenhado × pedido e nota de outro fornecedor) e as anulações. Valores das notas como o
 * sistema já lê (Contratos.gov.br e Tesouro); a nota inteira pode ter outros itens da mesma emenda.
 */
export const ExecucaoDoPedidoAba: React.FC<Props> = ({ p, itens, notas, conferencia, credor, podeGerir, podeVerContratos }) => {
  const execucao = useMemo(() => execucaoDoPedido(p, notas), [p, notas]);
  const porNota = useMemo(() => {
    const m = new Map<string, NotaDoPedido>();
    for (const l of linhasAtivas(p)) {
      const n = notas.get(l.id);
      if (!n?.nota) continue;
      const chave = n.empenhoId ?? n.nota;
      const atual = m.get(chave) ?? { chave, nota: n, linhas: [] };
      atual.linhas.push(l);
      m.set(chave, atual);
    }
    return [...m.values()].sort((a, b) => (a.nota.nota ?? '').localeCompare(b.nota.nota ?? ''));
  }, [p, notas]);

  // As emendas que pagam o pedido (a conferida e as outras, migration 211) ficam no alto, antes e depois do empenho.
  const emendas = <EmendasDoPedido p={p} podeGerir={podeGerir} />;
  if (!jaEmpenhado(p.etapa) && p.anulacoes.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {emendas}
        <NoticeBar tone="info" testId="pedido360-execucao-antes">
          A execução começa com a nota de empenho. Até lá, o andamento do pedido está na aba Andamento.
        </NoticeBar>
      </div>
    );
  }

  const colunas: Column<NotaDoPedido>[] = [
    {
      key: 'nota',
      header: 'Nota',
      priority: 'primary',
      nowrap: true,
      render: (x) => (
        <>
          <div style={{ ...carteiraValor, fontWeight: 700 }}>{x.nota.nota}</div>
          {x.nota.emitidaEm && <div style={carteiraDetalhe}>emitida em {dataBR(x.nota.emitidaEm)}</div>}
        </>
      )
    },
    {
      key: 'itens',
      header: 'Itens',
      minWidth: '220px',
      render: (x) => {
        const fornecedor = [...new Set(x.linhas.map((l) => (l.itemKey ? itens.get(l.itemKey)?.fornecedor : null)).filter((f): f is string => Boolean(f)))][0];
        return (
          <>
            {fornecedor && <div style={carteiraValor}>{curto(fornecedor, 40)}</div>}
            <div style={carteiraDetalhe}>{x.linhas.map((l) => nomeDaLinha(l, itens)).join(' · ')}</div>
          </>
        );
      }
    },
    {
      key: 'contrato',
      header: 'Contrato',
      nowrap: true,
      render: (x) =>
        x.nota.contractKey ? (
          podeVerContratos ? (
            <Link to={`/contratos/${encodeURIComponent(x.nota.contractKey)}`} style={{ color: 'var(--primary)', fontWeight: 700 }}>
              {numeroDaChave(x.nota.contractKey)}
            </Link>
          ) : (
            <span style={carteiraValor}>{numeroDaChave(x.nota.contractKey)}</span>
          )
        ) : (
          <span style={carteiraDetalhe}>aguarda a CCGA</span>
        )
    },
    { key: 'empenhado', header: 'Empenhado', align: 'right', nowrap: true, render: (x) => <span style={carteiraNumero}>{x.nota.valorEmpenhado != null ? formatCurrency(x.nota.valorEmpenhado) : '—'}</span> },
    { key: 'liquidado', header: 'Liquidado', align: 'right', nowrap: true, render: (x) => <span style={carteiraNumero}>{x.nota.valorLiquidado != null ? formatCurrency(x.nota.valorLiquidado) : '—'}</span> },
    { key: 'pago', header: 'Pago', align: 'right', nowrap: true, render: (x) => <span style={carteiraNumero}>{x.nota.valorPago != null ? formatCurrency(x.nota.valorPago) : '—'}</span> },
    {
      key: 'situacao',
      header: 'Situação',
      nowrap: true,
      render: (x) => {
        const s = situacaoDaNota(x.nota);
        return <StatusBadge label={s.texto} variant={s.variante} size="sm" dot={false} />;
      }
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} data-testid={`pedido360-execucao-${p.id}`}>
      {emendas}
      {jaEmpenhado(p.etapa) && <ExecucaoDoPedidoResumo execucao={execucao} />}
      {jaEmpenhado(p.etapa) && execucao.notas > 0 && (
        <div style={{ ...carteiraDetalhe, display: 'flex', flexWrap: 'wrap', gap: '0.3rem 1.1rem' }} data-testid="pedido360-execucao-caminho">
          <span>
            A liquidar <b style={carteiraNumero}>{formatCurrency(Math.max(execucao.empenhado - execucao.liquidado, 0))}</b>
          </span>
          <span>
            Liquidado a pagar <b style={carteiraNumero}>{formatCurrency(Math.max(execucao.liquidado - execucao.pago, 0))}</b>
          </span>
          <span>
            Pago <b style={carteiraNumero}>{formatCurrency(execucao.pago)}</b>
          </span>
        </div>
      )}
      {jaEmpenhado(p.etapa) && <EmpenhoDoPedido pedidoId={p.id} conferencia={conferencia} itens={itens} podeGerir={podeGerir} />}
      <CredorDoPedido pedidoId={p.id} grupos={credor} itens={itens} podeGerir={podeGerir} />
      {porNota.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <CarteiraDetailLabel>Notas de empenho do pedido</CarteiraDetailLabel>
          <DataTable<NotaDoPedido> testId={`pedido360-notas-${p.id}`} className="data-table-container--flush" data={porNota} keyExtractor={(x) => x.chave} columns={colunas} />
          {execucao.linhasSemNota > 0 && (
            <div style={carteiraDetalhe}>
              {execucao.linhasSemNota === 1 ? '1 item ainda sem nota ligada' : `${execucao.linhasSemNota} itens ainda sem nota ligada`}: o sistema procura de hora em hora.
            </div>
          )}
        </div>
      )}
      {p.anulacoes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }} data-testid={`emendas-pedido-anulacoes-${p.id}`}>
          <CarteiraDetailLabel>Anulações de empenho</CarteiraDetailLabel>
          {p.anulacoes.map((a) => (
            <div key={a.id} style={carteiraSubtitle}>
              Empenho anulado em {dataBR(a.anuladoEm)}
              {a.notas.length ? ` (${listaEmTexto(a.notas)})` : ''}: {a.linhas.length === 1 ? '1 item' : `${a.linhas.length} itens`}, documento SEI {a.documentoSei}.{' '}
              {a.destino === 'CANCELAR'
                ? a.total
                  ? 'O pedido foi cancelado.'
                  : `${a.linhas.length === 1 ? 'O item foi cancelado' : 'Os itens foram cancelados'}, sem volta à interlocução.`
                : a.total
                  ? 'O pedido voltou a "Itens reservados".'
                  : `${a.linhas.length === 1 ? 'O item voltou' : 'Os itens voltaram'} à interlocução no ${a.novoPedidoNome ?? 'pedido novo'}.`}{' '}
              Motivo: {a.motivo}
              {a.criadoPorNome ? ` · registrado por ${a.criadoPorNome}` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
