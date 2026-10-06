import React from 'react';
import { Plus } from 'lucide-react';
import { ActionButton, AppButton, DataTable, NoticeBar, SectionHeader, Timeline, type Column, type TimelineEventItem } from '../../../design-system';
import type { PaymentCycleDocument, PaymentCycleEvent, PaymentFollowUpCycle } from '../../../types/paymentFollowUp';
import { TIPOS_DOCUMENTO_RECEBIDO } from './PaymentCycleModals';
import { formatCurrencyInputBR, isoToBR, parseCurrencyInputBR } from './paymentFormUtils';

const formatCurrency = (v?: number) => (v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

/** Documentos ainda podem entrar ou sair enquanto o ciclo está com a CGLIC. */
const DOCUMENTOS_EDITAVEIS = ['RECEBIDO', 'COM_PENDENCIA', 'DEVOLVIDO', 'CONFERIDO'];

export const PaymentCycleDocuments: React.FC<{
  cycle: PaymentFollowUpCycle;
  canEdit: boolean;
  onAdd: (input: { cycleKey: string; tipo: string; sei: string; numero?: string; valor?: number }) => Promise<void>;
  onRemove: (documentId: string) => Promise<void>;
}> = ({ cycle, canEdit, onAdd, onRemove }) => {
  const editavel = canEdit && DOCUMENTOS_EDITAVEIS.includes(cycle.status);
  const [tipo, setTipo] = React.useState('Nota Fiscal Eletrônica');
  const [numero, setNumero] = React.useState('');
  const [sei, setSei] = React.useState('');
  const [valor, setValor] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onAdd({ cycleKey: cycle.cycleKey, tipo, sei: sei.trim(), numero: numero.trim() || undefined, valor: parseCurrencyInputBR(valor) });
      setNumero('');
      setSei('');
      setValor('');
    } catch (err) {
      setError((err as { message?: string } | null)?.message || 'Não foi possível incluir o documento.');
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<PaymentCycleDocument>[] = [
    { key: 'tipo', header: 'Documento', sortValue: (d) => d.tipo, render: (d) => d.tipo },
    { key: 'numero', header: 'Nº', sortValue: (d) => d.numero, render: (d) => d.numero || '—' },
    { key: 'sei', header: 'Id. SEI', sortValue: (d) => d.sei, render: (d) => <strong>{d.sei}</strong> },
    { key: 'valor', header: 'Valor', align: 'right', sortValue: (d) => d.valor, sortFirstDir: 'desc', render: (d) => formatCurrency(d.valor) },
    {
      key: 'acao',
      header: 'Ação',
      align: 'right',
      render: (d) =>
        editavel && d.sei !== cycle.input.documentoAtestoSei ? (
          <ActionButton action="remover" iconOnly label="Remover documento" size="sm" onClick={() => void onRemove(d.id)} />
        ) : null
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} data-testid={`payment-documents-${cycle.cycleKey}`}>
      <SectionHeader title="Documentos recebidos" countBadge={(cycle.documentos ?? []).length} />
      <DataTable
        columns={columns}
        data={cycle.documentos ?? []}
        keyExtractor={(d) => d.id}
        emptyMessage="Nenhum documento registrado."
        testId={`payment-documents-table-${cycle.cycleKey}`}
      />
      {editavel && (
        <form onSubmit={handleAdd} className="payment-doc-row">
          <select aria-label="Tipo do documento" className="form-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_DOCUMENTO_RECEBIDO.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input aria-label="Número do documento" className="form-input" type="text" placeholder="Nº" value={numero} onChange={(e) => setNumero(e.target.value)} />
          <input aria-label="Id. SEI" className="form-input" type="text" placeholder="Id. SEI *" value={sei} onChange={(e) => setSei(e.target.value)} required />
          <input aria-label="Valor do documento" className="form-input" type="text" inputMode="numeric" placeholder="Valor (R$)" value={valor} onChange={(e) => setValor(formatCurrencyInputBR(e.target.value))} />
          <AppButton type="submit" variant="outline" size="sm" icon={<Plus size={15} />} disabled={saving} isLoading={saving} title="Incluir documento" className="payment-doc-remove">
            <span className="payment-doc-remove__label">Incluir</span>
          </AppButton>
        </form>
      )}
      {error && <NoticeBar tone="danger" testId="payment-document-error">{error}</NoticeBar>}
    </div>
  );
};

const EVENTO_TITULO: Record<PaymentCycleEvent['tipo'], string> = {
  RECEBIDO: 'Documentos recebidos',
  CONFERIDO: 'Conferência concluída',
  PENDENCIA: 'Pendência registrada',
  ENVIADO_CGOFI: 'Enviado à CGOFI',
  DEVOLVIDO: 'Devolvido pela CGOFI',
  PAGO: 'Pagamento confirmado',
  CANCELADO: 'Ciclo cancelado',
  PRAZO_ALONGADO: 'Prazo alongado'
};

function eventDescription(e: PaymentCycleEvent): string | undefined {
  const partes: string[] = [];
  if (e.regularidadeVerificada) partes.push('Regularidade fiscal verificada (SICAF / CNDs)');
  if (e.sei) partes.push(`SEI ${e.sei}`);
  if (e.numeroOb) partes.push(`OB ${e.numeroOb}`);
  if (e.origemPendencia) partes.push(e.origemPendencia === 'FORNECEDOR' ? 'Pendência do fornecedor' : 'Pendência do fiscal');
  if (e.motivo) partes.push(e.motivo);
  if (e.prazoNovo) partes.push(e.prazoAnterior ? `Prazo ${isoToBR(e.prazoAnterior)} → ${isoToBR(e.prazoNovo)}` : `Prazo até ${isoToBR(e.prazoNovo)}`);
  if (e.justificativa) partes.push(`Justificativa: ${e.justificativa}`);
  if (e.registradoPorNome) partes.push(`por ${e.registradoPorNome}`);
  return partes.length > 0 ? partes.join(' · ') : undefined;
}

export const PaymentCycleHistory: React.FC<{ cycle: PaymentFollowUpCycle }> = ({ cycle }) => {
  const events: TimelineEventItem[] = [...(cycle.eventos ?? [])]
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
    .map((e) => ({
      id: e.id,
      date: e.dataEvento,
      title: EVENTO_TITULO[e.tipo] ?? e.tipo,
      description: eventDescription(e),
      category: 'OPERACIONAL' as const,
      origin: 'Manual'
    }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} data-testid={`payment-history-${cycle.cycleKey}`}>
      <SectionHeader title="Histórico do ciclo" countBadge={events.length} />
      <Timeline events={events} emptyMessage="Nenhum registro no histórico." testId={`payment-timeline-${cycle.cycleKey}`} />
    </div>
  );
};
