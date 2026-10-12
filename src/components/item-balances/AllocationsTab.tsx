import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Plus } from 'lucide-react';
import { AlocarUnidadeModal, type ItemParaAlocar } from '../alocacao/AlocarUnidadeModal';
import {
  AlertCard,
  ActionButton, AppButton,
  DataTable,
  EmptyState,
  NoticeBar,
  ProgressBar,
  SectionHeader,
  SummaryBar,
  type Column
} from '../../design-system';
import { formatNumber } from './itemBalanceUtils';
import type { InternalDepartment } from '../../services/unitService';

export interface AllocationRow {
  id: string;
  unitName: string;
  allocatedQty: number;
  /** Contratado da unidade no item: soma das divisões dos contratos (migration 103). */
  contratado: number;
  /** Soma das parcelas deste item nas notas ligadas à unidade (ou herdadas do contrato). */
  empenhado: number;
  /** Notas do item ligadas à unidade (vinculadas aos itens ou a vincular): com alguma, a alocação não pode ser removida. */
  vinculados: number;
}

interface AllocationsTabProps {
  /** UASG gerenciadora do item (de onde vem o quantitativo a alocar). */
  ugUasg: string;
  /** Item da ata, para a janela "Alocação do item". */
  item: ItemParaAlocar;
  totalUG: number;
  totalAllocated: number;
  remaining: number;
  percentAllocated: number;
  rows: AllocationRow[];
  semUnidade: { empenhado: number; count: number };
  /** Consumo do item: contratado nos contratos vinculados. */
  contratadoItem: number;
  /** Contratado ainda sem unidade interna e em quantos contratos. */
  contratadoSemUnidade: { quantidade: number; contratos: number };
  /** Contratos com divisão a conferir (soma acima do contrato, unidade sem alocação, quantidade mudou). */
  contratosAConferir: number;

  departments: InternalDepartment[];
  departmentsLoading: boolean;
  canManage: boolean;
  /** Erro de gravação vindo da página (ex.: vínculo de empenho). */
  error: string | null;

  onGoToContracts: () => void;
}

export const AllocationsTab: React.FC<AllocationsTabProps> = ({
  ugUasg,
  item,
  totalUG,
  totalAllocated,
  remaining,
  percentAllocated,
  rows,
  semUnidade,
  contratadoItem,
  contratadoSemUnidade,
  contratosAConferir,
  departments,
  departmentsLoading,
  canManage,
  error,
  onGoToContracts
}) => {
  // Janela aberta: sem foco (Alocar), com foco numa linha (lápis) ou com a linha já marcada para remover (lixeira).
  const [janela, setJanela] = useState<{ focoId?: string; removerId?: string } | null>(null);
  const catalogoVazio = !departmentsLoading && departments.length === 0;

  const columns: Column<AllocationRow>[] = [
    {
      key: 'unidade',
      header: 'Unidade interna',
      sortValue: (r) => r.unitName,
      render: (r) => <span style={{ fontWeight: 700 }}>{r.unitName}</span>
    },
    {
      key: 'alocado',
      header: 'Alocado',
      sortValue: (r) => r.allocatedQty,
      sortFirstDir: 'desc',
      align: 'right',
      render: (r) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{formatNumber(r.allocatedQty)}</span>
    },
    {
      key: 'contratado',
      header: 'Contratado',
      sortValue: (r) => r.contratado,
      sortFirstDir: 'desc',
      align: 'right',
      render: (r) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: r.contratado > r.allocatedQty ? 'var(--danger)' : undefined }} title={r.contratado > r.allocatedQty ? 'Contratado acima do alocado' : undefined}>
          {formatNumber(r.contratado)}
        </span>
      )
    },
    {
      key: 'empenhado',
      header: 'Empenhado',
      sortValue: (r) => r.empenhado,
      sortFirstDir: 'desc',
      align: 'right',
      render: (r) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{formatNumber(r.empenhado)}</span>
    },
    {
      key: 'aEmpenhar',
      header: 'A empenhar',
      sortValue: (r) => r.contratado - r.empenhado,
      sortFirstDir: 'desc',
      align: 'right',
      render: (r) => {
        const balance = r.contratado - r.empenhado;
        return <span style={{ fontFamily: 'monospace', fontWeight: 700, color: balance < 0 ? 'var(--danger)' : undefined }}>{formatNumber(balance)}</span>;
      }
    },
    {
      key: 'livre',
      header: 'Livre p/ contratar',
      sortValue: (r) => r.allocatedQty - r.contratado,
      sortFirstDir: 'desc',
      align: 'right',
      render: (r) => {
        const livre = r.allocatedQty - r.contratado;
        return <span style={{ fontFamily: 'monospace', fontWeight: 700, color: livre < 0 ? 'var(--danger)' : 'var(--success)' }}>{formatNumber(livre)}</span>;
      }
    },
    {
      key: 'consumo',
      header: 'Contratado do alocado',
      sortValue: (r) => (r.allocatedQty > 0 ? r.contratado / r.allocatedQty : 0),
      sortFirstDir: 'desc',
      width: '160px',
      render: (r) => {
        const percent = r.allocatedQty > 0 ? (r.contratado / r.allocatedQty) * 100 : 0;
        // A barra para em 100%; o rótulo mostra o percentual real (contratado acima do alocado passa de 100%).
        return <ProgressBar value={percent} height="6px" showPercent={false} label={`${formatNumber(Math.round(percent * 10) / 10)}%`} testId={`consumo-${r.id}`} />;
      }
    },
    ...(canManage
      ? [
          {
            key: 'acoes',
            header: 'Ações',
            align: 'center' as const,
            width: '110px',
            render: (r: AllocationRow) => (
              <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                <ActionButton action="editar" iconOnly label={`Editar a alocação de ${r.unitName}`} size="sm" onClick={() => setJanela({ focoId: r.id })} />
                <ActionButton
                  action="excluir"
                  iconOnly
                  label={
                    r.contratado > 0
                      ? `${r.unitName} tem ${formatNumber(r.contratado)} contratados. Para remover, tire a unidade das divisões dos contratos na aba Contratos e empenhos.`
                      : r.vinculados > 0
                        ? `${r.unitName} tem ${r.vinculados} ${r.vinculados === 1 ? 'empenho vinculado' : 'empenhos vinculados'}. Para remover, desvincule os empenhos na aba Contratos e empenhos.`
                        : `Excluir a alocação de ${r.unitName}`
                  }
                  size="sm"
                  onClick={() => setJanela({ removerId: r.id })}
                  disabled={r.vinculados > 0 || r.contratado > 0}
                />
              </div>
            )
          }
        ]
      : [])
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} data-testid="allocations-tab">
      <SummaryBar
        testId="allocations-summary"
        items={[
          { label: 'Alocado', value: `${formatNumber(totalAllocated)} de ${formatNumber(totalUG)} (${formatNumber(percentAllocated)}%)` },
          { label: 'A alocar', value: formatNumber(remaining), tone: remaining < 0 ? 'danger' : 'default' },
          { label: 'Contratado', value: formatNumber(contratadoItem) },
          { label: 'Empenhado nas unidades', value: formatNumber(rows.reduce((s, r) => s + r.empenhado, 0)) }
        ]}
        progress={{ value: totalAllocated, max: totalUG }}
      >
        {contratadoSemUnidade.quantidade > 0 && (
          <NoticeBar
            testId="contratado-sem-unidade"
            action={
              <AppButton variant="outline" size="sm" onClick={onGoToContracts}>
                Informar unidades em Contratos e empenhos
              </AppButton>
            }
          >
            <strong>{formatNumber(contratadoSemUnidade.quantidade)}</strong> contratados ainda sem unidade interna
            {contratadoSemUnidade.contratos > 0 ? ` (${contratadoSemUnidade.contratos} ${contratadoSemUnidade.contratos === 1 ? 'contrato' : 'contratos'})` : ''}.
            Não entram no contratado das unidades até a unidade ser informada.
          </NoticeBar>
        )}
        {contratosAConferir > 0 && (
          <NoticeBar tone="danger" testId="contratado-a-conferir">
            {contratosAConferir === 1 ? '1 contrato tem' : `${contratosAConferir} contratos têm`} divisão entre unidades a conferir: a quantidade do
            contrato mudou, a soma passa do contrato ou há unidade sem alocação.
          </NoticeBar>
        )}
        {semUnidade.count > 0 && (
          <NoticeBar
            testId="empenhos-sem-unidade"
            action={
              <AppButton variant="outline" size="sm" onClick={onGoToContracts}>
                Escolher a unidade em Contratos e empenhos
              </AppButton>
            }
          >
            <strong>{semUnidade.count}</strong> {semUnidade.count === 1 ? 'nota vinculada a este item está' : 'notas vinculadas a este item estão'} ({formatNumber(semUnidade.empenhado)} un)
            sem unidade interna. Não entram no empenhado das unidades até a unidade ser escolhida.
          </NoticeBar>
        )}
      </SummaryBar>

      {error && !janela && <AlertCard severity="CRITICA" title={error} testId="allocation-error" />}

      {canManage && catalogoVazio && (
        <EmptyState
          title="Nenhuma unidade interna cadastrada"
          description="As alocações usam as unidades do catálogo oficial de Unidades Internas, que ainda está vazio. Cadastre as unidades para poder alocar."
          icon={<Building2 size={32} color="#94a3b8" />}
          action={<Link to="/admin/departamentos" className="ds-btn ds-btn--outline ds-btn--md">Abrir Unidades Internas</Link>}
        />
      )}

      <div>
        <SectionHeader
          title="Alocações"
          subtitle={`Quantitativo da UG ${ugUasg} alocado às unidades internas.`}
          icon={<Building2 size={16} />}
          countBadge={rows.length}
          actions={
            canManage ? (
              <AppButton
                variant="primary"
                size="sm"
                icon={<Plus size={14} />}
                onClick={() => setJanela({})}
                disabled={departmentsLoading}
                title="Alocar quantitativo a uma unidade interna"
              >
                Alocar
              </AppButton>
            ) : undefined
          }
        />
        {rows.length === 0 ? (
          <EmptyState
            title="Nenhuma alocação interna neste item"
            description={canManage ? 'Use o botão Alocar para alocar o quantitativo às unidades internas.' : 'Ainda não há quantitativo alocado às unidades internas.'}
          />
        ) : (
          <DataTable columns={columns} data={rows} keyExtractor={(r) => r.id} testId="allocations-table" />
        )}
      </div>

      {canManage && (
        <AlocarUnidadeModal item={janela ? item : null} focoId={janela?.focoId} removerId={janela?.removerId} onFechar={() => setJanela(null)} />
      )}
    </div>
  );
};
