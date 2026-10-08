import React from 'react';
import { AppButton, DataTable, NoticeBar, StatusBadge, type Column } from '../../design-system';
import { formatCurrency, formatNumber } from './itemBalanceUtils';
import type { ExecucaoNoContrato, ParcelaDoItem } from '../../utils/empenhoDoItem';
import type { DistribuicaoDoEmpenho } from '../../services/distribuicaoEmpenhoService';
import { textoDaSugestao } from '../../utils/distribuicaoEmpenho';

export interface AllocationOption {
  id: string;
  unitName: string;
  saldoQty: number;
}

interface ContractEmpenhosPanelProps {
  /** Número do item (o mesmo na ata e no contrato), para destacar a sugestão "deste item". */
  numeroItem: number;
  /** Quantidade do item no contrato segundo a API; nula enquanto não lida. */
  contratado: number | null;
  /** Parcelas deste item e notas a vincular deste contrato. */
  execucao: ExecucaoNoContrato | undefined;
  loading: boolean;
  canLinkEmpenhos: boolean;
  allocationOptions: AllocationOption[];
  /** Id da unidade interna a que a nota (pelo número) está ligada. */
  linkedAllocationId: (numeroEmpenho: string) => string;
  onLinkAllocation: (numeroEmpenho: string, allocationId: string) => void;
  /** Gestor e coordenador: abre a janela "Vincular aos itens" da nota. */
  onVincularAosItens?: (nota: DistribuicaoDoEmpenho) => void;
  busy: boolean;
}

const dataBR = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const subtle: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--text-muted)' };
const rotulo: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' };

/** Sugestão da nota com "deste item" no lugar do número deste item. */
function sugestaoParaEsteItem(d: DistribuicaoDoEmpenho, numeroItem: number): string {
  const texto = textoDaSugestao(d.sugestaoTipo, d.sugestao);
  if (!texto) return 'sem sugestão';
  return texto.replace(new RegExp(`do item ${numeroItem}(?!\\d)`, 'g'), 'deste item');
}

/**
 * Notas de UM contrato para este item: as que já foram vinculadas a ele (parcela, quantidade e unidade interna) e as
 * do contrato que ainda faltam vincular aos itens. A quantidade vem da parcela ÷ preço do item no contrato; não há
 * mais confirmação de quantidade por item.
 */
export const ContractEmpenhosPanel: React.FC<ContractEmpenhosPanelProps> = ({
  numeroItem,
  contratado,
  execucao,
  loading,
  canLinkEmpenhos,
  allocationOptions,
  linkedAllocationId,
  onLinkAllocation,
  onVincularAosItens,
  busy
}) => {
  const parcelas = execucao?.parcelas ?? [];
  const aVincular = [...(execucao?.aVincular ?? []), ...(execucao?.deOutroItem ?? [])];
  const deOutro = new Set((execucao?.deOutroItem ?? []).map((d) => d.contratoEmpenhoId));
  const empenhado = execucao?.empenhado ?? 0;
  const aEmpenhar = contratado != null ? contratado - empenhado : null;

  const colunasParcelas: Column<ParcelaDoItem>[] = [
    {
      key: 'empenho',
      header: 'Empenho',
      sortValue: (p) => p.numeroOficial,
      render: (p) => (
        <>
          <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--primary)' }}>{p.numeroOficial}</span>
          <div style={subtle}>
            {p.uasgEmitente ? `UASG ${p.uasgEmitente}` : ''}
            {p.dataEmissao ? ` · ${dataBR(p.dataEmissao)}` : ''}
          </div>
        </>
      )
    },
    { key: 'parcela', header: 'Parcela deste item', align: 'right', sortValue: (p) => p.valor, sortFirstDir: 'desc', render: (p) => <strong>{formatCurrency(p.valor)}</strong> },
    {
      key: 'qtd',
      header: 'Quantidade',
      align: 'right',
      sortValue: (p) => p.quantidade,
      sortFirstDir: 'desc',
      render: (p) =>
        p.quantidade != null ? (
          <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{formatNumber(p.quantidade)} un</span>
        ) : (
          <span style={subtle} title="O item não tem preço unitário no contrato (ex.: serviço)">sem preço</span>
        )
    },
    {
      key: 'vinculo',
      header: 'Vínculo',
      render: (p) => (
        <>
          <StatusBadge label={p.origem === 'AUTO' ? 'Vinculada automaticamente' : 'Vinculada'} variant="success" size="sm" dot={false} />
          {p.origem === 'USUARIO' && (
            <div style={subtle}>
              por {p.vinculadaPorNome || 'usuário'}
              {p.vinculadaEm ? ` em ${dataBR(p.vinculadaEm)}` : ''}
            </div>
          )}
        </>
      )
    },
    {
      key: 'unidade',
      header: 'Unidade interna',
      render: (p) => {
        if (allocationOptions.length === 0) return <span style={subtle}>Sem unidades alocadas</span>;
        const current = linkedAllocationId(p.numeroOficial);
        return (
          <select
            value={current}
            onChange={(e) => onLinkAllocation(p.numeroOficial, e.target.value)}
            disabled={busy || !canLinkEmpenhos}
            className="form-input"
            aria-label={`Unidade interna da nota ${p.numeroOficial}`}
            style={{
              padding: '0.2rem 0.4rem',
              fontSize: '0.75rem',
              height: 'auto',
              width: '100%',
              maxWidth: '200px',
              borderColor: current ? 'var(--primary)' : '#cbd5e1',
              background: current ? 'var(--color-info-bg)' : '#ffffff'
            }}
          >
            <option value="">Sem unidade</option>
            {allocationOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.unitName} (saldo {formatNumber(a.saldoQty)} un)
              </option>
            ))}
          </select>
        );
      }
    }
  ];

  const colunasAVincular: Column<DistribuicaoDoEmpenho>[] = [
    {
      key: 'empenho',
      header: 'Empenho',
      sortValue: (d) => d.numeroOficial,
      render: (d) => (
        <>
          <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--primary)' }}>{d.numeroOficial}</span>
          {d.dataEmissao && <div style={subtle}>{dataBR(d.dataEmissao)}</div>}
        </>
      )
    },
    { key: 'valor', header: 'Valor da nota', align: 'right', sortValue: (d) => d.valorNota, sortFirstDir: 'desc', render: (d) => formatCurrency(d.valorNota) },
    {
      key: 'sugestao',
      header: 'Sugestão',
      render: (d) => (
        <span style={{ fontSize: '0.8rem' }}>
          {deOutro.has(d.contratoEmpenhoId) && <StatusBadge label="outro item" variant="neutral" size="sm" dot={false} />} {sugestaoParaEsteItem(d, numeroItem)}
        </span>
      )
    },
    {
      key: 'situacao',
      header: 'Situação',
      render: (d) => <StatusBadge label={d.situacao === 'REVISAR' ? 'Revisar' : 'A vincular'} variant={d.situacao === 'REVISAR' ? 'danger' : 'warning'} size="sm" dot={false} />
    }
  ];

  return (
    <div data-testid="contract-empenhos-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
        <span>
          Contratado: <strong>{contratado != null ? formatNumber(contratado) : 'N/D'}</strong>
        </span>
        <span>
          Empenhado: <strong>{formatNumber(empenhado)}</strong>
        </span>
        <span>
          A empenhar:{' '}
          <strong style={{ color: aEmpenhar != null && aEmpenhar < 0 ? 'var(--danger)' : undefined }}>{aEmpenhar != null ? formatNumber(aEmpenhar) : 'N/D'}</strong>
        </span>
      </div>

      {execucao?.semItens && (
        <NoticeBar tone="info" testId="contract-empenhos-sem-itens">
          Este contrato não tem itens na fonte oficial: as notas ({formatCurrency(execucao.valorSemDivisao)}) ficam no contrato inteiro, sem divisão por item,
          e não contam no empenhado deste item.
        </NoticeBar>
      )}

      <div style={rotulo}>Notas vinculadas a este item</div>
      <DataTable
        columns={colunasParcelas}
        data={parcelas}
        keyExtractor={(p) => p.contratoEmpenhoId}
        isLoading={loading}
        emptyMessage="Nenhuma nota deste contrato foi vinculada a este item ainda."
        testId="contract-empenhos-table"
      />

      {aVincular.length > 0 && (
        <>
          <div style={rotulo}>Notas do contrato ainda a vincular aos itens</div>
          <DataTable
            columns={colunasAVincular}
            data={aVincular}
            keyExtractor={(d) => d.contratoEmpenhoId}
            testId="contract-empenhos-a-vincular"
            rowActions={
              onVincularAosItens
                ? (d) => (
                    <AppButton variant={deOutro.has(d.contratoEmpenhoId) ? 'outline' : 'primary'} size="sm" onClick={() => onVincularAosItens(d)} disabled={busy}>
                      Vincular aos itens
                    </AppButton>
                  )
                : undefined
            }
          />
        </>
      )}
    </div>
  );
};
