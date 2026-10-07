import React from 'react';
import { Plus } from 'lucide-react';
import { ActionButton, AppButton, DataTable, NoticeBar, SectionHeader, StatusBadge, Timeline, useToast, type Column, type TimelineEventItem } from '../../../design-system';
import type { PaymentCycleDocument, PaymentCycleEvent, PaymentCycleItem, PaymentFollowUpCycle } from '../../../types/paymentFollowUp';
import type { PrazosLegaisDoCiclo } from '../../../services/prazosLegaisPagamento';
import { rotuloDoItem } from './checklistPagamento';
import { numeroDoEmpenho, textoDoPagamento } from './cicloPagamentoShared';
import { TIPOS_DOCUMENTO_RECEBIDO } from './cicloPagamentoShared';
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
  RECEBIDO: 'Processo recebido',
  CONFERIDO: 'Conferência concluída',
  PENDENCIA: 'Devolvido para correção',
  RETORNO: 'Recebido de volta',
  ENVIADO_CGOFI: 'Enviado à CGOFI',
  DEVOLVIDO: 'Devolvido pela CGOFI',
  LIQUIDADO: 'Liquidado no SIAFI',
  PAGO: 'Pagamento confirmado',
  OB_CANCELADA: 'Ordem bancária cancelada',
  CANCELADO: 'Ciclo cancelado',
  PRAZO_ALONGADO: 'Prazo alongado',
  PRORROGACAO_LIQUIDACAO: 'Prazo de liquidação prorrogado',
  ENVIADO_COLOG: 'Enviado à COLOG',
  FATURA_VINCULADA: 'Fatura ligada ao ciclo'
};

function eventDescription(e: PaymentCycleEvent): string | undefined {
  const partes: string[] = [];
  if (e.regularidadeVerificada) partes.push('Regularidade fiscal verificada (SICAF / CNDs)');
  if (e.sei) partes.push(`SEI ${e.sei}`);
  if (e.numeroOb) partes.push(`OB ${e.numeroOb}`);
  if (e.origemPendencia) partes.push(e.origemPendencia === 'FORNECEDOR' ? 'Devolvido ao contratado' : 'Devolvido à área / fiscal');
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
      origin: e.automatico ? 'Sistema' : 'Manual'
    }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} data-testid={`payment-history-${cycle.cycleKey}`}>
      <SectionHeader title="Histórico do ciclo" countBadge={events.length} />
      <Timeline events={events} emptyMessage="Nenhum registro no histórico." testId={`payment-timeline-${cycle.cycleKey}`} />
    </div>
  );
};

// -----------------------------------------------------------------------------
// Do pagamento (Portaria 50, Anexo II)
// -----------------------------------------------------------------------------
export const PaymentCycleItens: React.FC<{ cycle: PaymentFollowUpCycle }> = ({ cycle }) => {
  const toast = useToast();
  const itens = cycle.itens ?? [];
  if (itens.length === 0) return null;
  const columns: Column<PaymentCycleItem>[] = [
    { key: 'nf', header: 'Nota fiscal', priority: 'primary', render: (i) => <strong>{i.notaFiscal}</strong> },
    { key: 'sei', header: 'SEI', render: (i) => i.notaFiscalSei || '—' },
    { key: 'atesto', header: 'Atesto (SEI)', render: (i) => i.atestoSei },
    { key: 'empenho', header: 'Empenho', render: (i) => numeroDoEmpenho(i.empenhoCanonicalKey) },
    { key: 'sub', header: 'Subelemento', render: (i) => i.subelemento || '—' },
    { key: 'bruto', header: 'Bruto', align: 'right', render: (i) => formatCurrency(i.valorBruto) },
    { key: 'juros', header: 'Juros/multa', align: 'right', render: (i) => (i.jurosMulta ? <span title={i.justificativaJuros}>{formatCurrency(i.jurosMulta)}</span> : '—') },
    { key: 'glosa', header: 'Glosa', align: 'right', render: (i) => (i.glosa ? formatCurrency(i.glosa) : '—') },
    { key: 'desconto', header: 'Desconto', align: 'right', render: (i) => (i.desconto ? formatCurrency(i.desconto) : '—') },
    { key: 'pagar', header: 'A pagar', align: 'right', render: (i) => <strong>{formatCurrency(i.valorAPagar)}</strong> }
  ];
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoDoPagamento(itens));
      toast.success('Tabela "DO PAGAMENTO" copiada. Cole no documento do SEI.');
    } catch {
      toast.error('Não foi possível copiar. Selecione a tabela e copie manualmente.');
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} data-testid={`payment-itens-${cycle.cycleKey}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <SectionHeader title="Do pagamento (Anexo II)" countBadge={itens.length} />
        <ActionButton action="copiar" size="sm" onClick={() => void copiar()} label="Copiar para o SEI" />
      </div>
      <DataTable columns={columns} data={itens} keyExtractor={(i) => i.id} testId={`payment-itens-table-${cycle.cycleKey}`} />
      {cycle.input.numeroProcessoPagamentoSei && (
        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Processo SEI de pagamento: <strong>{cycle.input.numeroProcessoPagamentoSei}</strong></div>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Checklist respondido
// -----------------------------------------------------------------------------
const RESPOSTA_LABEL = { SIM: 'Sim', NAO: 'Não', NA: 'N/A' } as const;

export const PaymentCycleChecklist: React.FC<{ cycle: PaymentFollowUpCycle }> = ({ cycle }) => {
  const checklist = cycle.checklist ?? [];
  if (checklist.length === 0) return null;
  const nao = checklist.filter((c) => c.resposta === 'NAO');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }} data-testid={`payment-checklist-${cycle.cycleKey}`}>
      <SectionHeader title="Checklist da conferência (Anexo I)" countBadge={checklist.length} />
      {nao.length > 0 && (
        <NoticeBar tone="warning" testId="payment-checklist-nao">
          Marcado "Não": {nao.map((c) => rotuloDoItem(c.item)).join('; ')}.
        </NoticeBar>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '0.3rem 1rem', fontSize: '0.8rem' }}>
        {checklist.map((c) => (
          <div key={c.item} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', borderBottom: '1px solid #f1f5f9', padding: '0.25rem 0' }}>
            <span style={{ color: '#334155' }}>{rotuloDoItem(c.item)}</span>
            <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: c.resposta === 'NAO' ? 'var(--color-danger-text)' : '#0f172a' }}>
              {RESPOSTA_LABEL[c.resposta]}{c.sei ? ` · ${c.sei}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Prazos legais (Portaria 50 e IN 77)
// -----------------------------------------------------------------------------
const du = (n: number) => `${n} ${n === 1 ? 'dia útil' : 'dias úteis'}`;

export const PaymentCyclePrazosLegais: React.FC<{ cycle: PaymentFollowUpCycle; prazos: PrazosLegaisDoCiclo }> = ({ cycle, prazos }) => {
  const cards: Array<{ id: string; titulo: string; valor: string; detalhe: string; tom: 'ok' | 'alerta' | 'neutro' }> = [
    {
      id: 'chegada',
      titulo: 'Chegada à CGLIC',
      valor: du(prazos.chegada.diasUteisAteVencimento),
      detalhe: `antes do vencimento · mínimo ${prazos.chegada.minimo} (Portaria 50, art. 5º)`,
      tom: prazos.chegada.fora ? 'alerta' : 'ok'
    },
    {
      id: 'liquidacao',
      titulo: prazos.liquidacao.concluido ? 'Liquidação' : 'Liquidação (correndo)',
      valor: du(prazos.liquidacao.diasUteis),
      detalhe: `atesto → SIAFI · teto ${prazos.liquidacao.teto}${prazos.liquidacao.prorrogado ? ' (prorrogado)' : ''} (IN 77, art. 7º, I)`,
      tom: prazos.liquidacao.estourou ? 'alerta' : prazos.liquidacao.concluido ? 'ok' : 'neutro'
    },
    {
      id: 'pagamento',
      titulo: prazos.pagamento?.concluido ? 'Pagamento' : 'Pagamento (correndo)',
      valor: prazos.pagamento ? du(prazos.pagamento.diasUteis) : '—',
      detalhe: prazos.pagamento ? `liquidação → OB · teto ${prazos.pagamento.teto} (IN 77, art. 7º, II)` : 'começa na liquidação',
      tom: prazos.pagamento?.estourou ? 'alerta' : prazos.pagamento?.concluido ? 'ok' : 'neutro'
    },
    {
      id: 'contratado',
      titulo: 'Com o contratado',
      valor: du(prazos.liquidacao.diasComContratado),
      detalhe: 'não conta na liquidação (IN 77, art. 7º, § 4º)',
      tom: 'neutro'
    }
  ];
  const cor = { ok: 'var(--color-success-text)', alerta: 'var(--color-danger-text)', neutro: '#0f172a' } as const;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }} data-testid={`payment-prazos-legais-${cycle.cycleKey}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <SectionHeader title="Prazos legais" />
        {prazos.pequenoValor && <StatusBadge label="Pequeno valor: prazos pela metade" variant="info" size="sm" dot={false} />}
      </div>
      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
        Limite do art. 75, II da Lei 14.133 em {prazos.limite.ano}:{' '}
        {prazos.limite.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ({prazos.limite.decreto}). Até ele, os prazos de
        liquidação e pagamento caem pela metade (IN 77, art. 7º, § 2º).
      </div>
      {prazos.limite.desatualizado && (
        <NoticeBar tone="warning" testId="payment-limite-desatualizado">
          Ainda não há no sistema o decreto que atualiza o limite do art. 75, II para o ano do atesto; está valendo o de {prazos.limite.ano}.
          Peça para cadastrar o decreto novo.
        </NoticeBar>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '0.6rem' }}>
        {cards.map((c) => (
          <div key={c.id} data-testid={`payment-prazo-${c.id}`} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.55rem 0.7rem', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{c.titulo}</span>
            <strong style={{ fontSize: '1.05rem', color: cor[c.tom], fontVariantNumeric: 'tabular-nums' }}>{c.valor}</strong>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{c.detalhe}</span>
          </div>
        ))}
      </div>
      {prazos.riscoExtincao && (
        <NoticeBar tone="danger" testId="payment-risco-extincao">
          Mais de 2 meses desde o atesto sem pagamento: o contratado pode pedir a extinção do contrato (IN 77, art. 11).
        </NoticeBar>
      )}
    </div>
  );
};
