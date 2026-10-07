import React from 'react';
import { Modal, NoticeBar } from '../../../design-system';
import type { ChecklistResposta, PaymentFollowUpCycle } from '../../../types/paymentFollowUp';
import type { RegisterPaymentMarcoInput } from '../../../adapters/paymentCycleRpcAdapter';
import { DateField, Field, FooterButtons, JustificativaField } from './PaymentCycleModals';
import { empenhosSemSaldo, errorMessage, useEmpenhosDoContrato } from './cicloPagamentoShared';
import { montarChecklist, resumoChecklist, type LinhaChecklist } from './checklistPagamento';
import { isoToBR, parseDateInputBR, prazoExigeJustificativa, prazoPadraoISO, todayISO } from './paymentFormUtils';

const RESPOSTAS: Array<{ valor: ChecklistResposta; label: string }> = [
  { valor: 'SIM', label: 'Sim' },
  { valor: 'NAO', label: 'Não' },
  { valor: 'NA', label: 'N/A' }
];

/**
 * Conferência do processo com o checklist da Portaria DGFNSP 50/2025 (Anexo I). Itens que o sistema já conhece
 * (contrato vigente, empenho com saldo, nota e atesto informados na abertura) vêm marcados para confirmação.
 * Com algum "Não", o caminho é devolver: ao contratado (o prazo legal da liquidação para) ou à área.
 */
export const ConferenciaModal: React.FC<{
  cycle: PaymentFollowUpCycle | null;
  /** Vigência do contrato, quando a tela a conhece. */
  contratoVigente?: boolean;
  onClose: () => void;
  registradoPorNome?: string;
  onSubmit: (input: RegisterPaymentMarcoInput) => Promise<void>;
}> = ({ cycle, contratoVigente, onClose, registradoPorNome, onSubmit }) => {
  const { data: empenhos, isLoading: carregandoEmpenhos } = useEmpenhosDoContrato(cycle?.contractKey);
  const [linhas, setLinhas] = React.useState<LinhaChecklist[]>([]);
  const [acao, setAcao] = React.useState<'CONFERIDO' | 'DEVOLVER'>('CONFERIDO');
  const [aQuem, setAQuem] = React.useState<'FORNECEDOR' | 'FISCAL'>('FORNECEDOR');
  const [motivo, setMotivo] = React.useState('');
  const [data, setData] = React.useState(isoToBR(todayISO()));
  const [prazo, setPrazo] = React.useState('');
  const [prazoTocado, setPrazoTocado] = React.useState(false);
  const [justificativa, setJustificativa] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Monta o checklist quando o ciclo abre e quando o saldo dos empenhos chega.
  React.useEffect(() => {
    if (!cycle) return;
    const semSaldo = empenhos
      ? empenhosSemSaldo((cycle.itens ?? []).map((i) => ({ empenho: i.empenhoCanonicalKey, valor: i.valorAPagar })), empenhos)
      : null;
    setLinhas(
      montarChecklist(cycle, {
        contratoVigente,
        empenhosComSaldo: semSaldo === null || (cycle.itens ?? []).length === 0 ? undefined : semSaldo.length === 0
      })
    );
  }, [cycle?.cycleKey, empenhos, contratoVigente]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    setAcao('CONFERIDO');
    setAQuem('FORNECEDOR');
    setMotivo('');
    setData(isoToBR(todayISO()));
    setPrazoTocado(false);
    setJustificativa('');
    setError(null);
  }, [cycle?.cycleKey]);

  const dataISO = parseDateInputBR(data);
  const padraoISO = dataISO && acao === 'CONFERIDO' ? prazoPadraoISO('ENVIO', dataISO) : '';
  React.useEffect(() => {
    if (!prazoTocado) setPrazo(padraoISO ? isoToBR(padraoISO) : '');
  }, [padraoISO, prazoTocado]);

  if (!cycle) return null;

  const { faltam, nao } = resumoChecklist(linhas);
  const prazoISO = parseDateInputBR(prazo);
  const alongado = acao === 'CONFERIDO' && Boolean(prazoISO && padraoISO && prazoExigeJustificativa({ prazoISO, padraoISO }));
  const bloqueioConferido = acao === 'CONFERIDO' && (faltam > 0 || nao > 0);

  const atualizar = (item: string, patch: Partial<LinhaChecklist>) =>
    setLinhas((prev) => prev.map((l) => (l.item === item ? { ...l, ...patch, sugeridoPeloSistema: patch.resposta ? undefined : l.sugeridoPeloSistema } : l)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataISO || bloqueioConferido) return;
    const checklist = linhas.filter((l) => l.resposta).map((l) => ({ item: l.item, resposta: l.resposta as ChecklistResposta, sei: l.sei.trim() || undefined }));
    const input: RegisterPaymentMarcoInput =
      acao === 'CONFERIDO'
        ? {
            cycleKey: cycle.cycleKey,
            marco: 'CONFERIDO',
            data: dataISO,
            checklist,
            prazoNovo: prazoISO || undefined,
            prazoPadrao: padraoISO || undefined,
            justificativa: alongado ? justificativa.trim() : undefined,
            registradoPorNome
          }
        : { cycleKey: cycle.cycleKey, marco: 'PENDENCIA', data: dataISO, checklist, origemPendencia: aQuem, motivo: motivo.trim(), registradoPorNome };
    setSaving(true);
    setError(null);
    try {
      await onSubmit(input);
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível registrar a conferência. Tente novamente.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Conferir o processo"
      size="lg"
      dismissible={!saving}
      testId="payment-conferencia-modal"
      footer={
        <FooterButtons
          formId="payment-conferencia-form"
          onCancel={onClose}
          saving={saving}
          disabled={bloqueioConferido}
          submitLabel={acao === 'CONFERIDO' ? 'Concluir conferência' : 'Devolver'}
        />
      }
    >
      <form id="payment-conferencia-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>Checklist para pagamento (Portaria 50, Anexo I)</div>
        {carregandoEmpenhos && <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Conferindo o saldo dos empenhos…</div>}
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <table data-testid="payment-checklist" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#64748b', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem 0.6rem' }}>Documento</th>
                {RESPOSTAS.map((r) => (
                  <th key={r.valor} style={{ padding: '0.5rem 0.4rem', textAlign: 'center' }}>{r.label}</th>
                ))}
                <th style={{ padding: '0.5rem 0.6rem' }}>Nº SEI</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.item} data-testid={`checklist-${l.item}`} style={{ borderTop: '1px solid #f1f5f9', background: l.resposta === 'NAO' ? 'var(--color-danger-bg)' : undefined }}>
                  <td style={{ padding: '0.45rem 0.6rem', minWidth: '220px' }}>
                    {l.label}
                    {l.sugeridoPeloSistema && (
                      <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-success-text)', background: 'var(--color-success-bg)', padding: '0.05rem 0.35rem', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                        sistema: {l.sugeridoPeloSistema}
                      </span>
                    )}
                  </td>
                  {RESPOSTAS.map((r) => (
                    <td key={r.valor} style={{ textAlign: 'center', padding: '0.3rem' }}>
                      <input
                        type="radio"
                        name={`checklist-${l.item}`}
                        aria-label={`${l.label}: ${r.label}`}
                        checked={l.resposta === r.valor}
                        onChange={() => atualizar(l.item, { resposta: r.valor })}
                      />
                    </td>
                  ))}
                  <td style={{ padding: '0.3rem 0.6rem' }}>
                    <input
                      className="form-input"
                      type="text"
                      aria-label={`Nº SEI de ${l.label}`}
                      value={l.sei}
                      onChange={(e) => setLinhas((prev) => prev.map((x) => (x.item === l.item ? { ...x, sei: e.target.value } : x)))}
                      style={{ minWidth: '110px' }}
                      disabled={l.resposta === 'NA'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Field id="conferencia-acao" label="Resultado">
          <select id="conferencia-acao" className="form-input" value={acao} onChange={(e) => { setAcao(e.target.value as 'CONFERIDO' | 'DEVOLVER'); setPrazoTocado(false); }}>
            <option value="CONFERIDO">Conferido: tudo em ordem</option>
            <option value="DEVOLVER">Devolver para correção</option>
          </select>
        </Field>
        {acao === 'CONFERIDO' && bloqueioConferido && (
          <NoticeBar tone="warning" testId="payment-checklist-bloqueio">
            {faltam > 0 ? `Responda ${faltam === 1 ? 'o item que falta' : `os ${faltam} itens que faltam`}. ` : ''}
            {nao > 0 ? `Há ${nao === 1 ? 'um item' : `${nao} itens`} "Não": devolva o processo em vez de concluir a conferência.` : ''}
          </NoticeBar>
        )}

        <DateField id="conferencia-data" label={acao === 'CONFERIDO' ? 'Conferido em *' : 'Devolvido em *'} value={data} onChange={(v) => { setData(v); setPrazoTocado(false); }} />

        {acao === 'DEVOLVER' && (
          <>
            <Field
              id="conferencia-a-quem"
              label="Devolvido a quem? *"
              hint={
                aQuem === 'FORNECEDOR'
                  ? 'Enquanto o contratado corrige, o prazo legal da liquidação não corre (IN 77, art. 7º, § 4º).'
                  : 'Correção interna: o prazo legal da liquidação continua correndo; só o prazo da CGLIC para.'
              }
            >
              <select id="conferencia-a-quem" className="form-input" value={aQuem} onChange={(e) => setAQuem(e.target.value as 'FORNECEDOR' | 'FISCAL')}>
                <option value="FORNECEDOR">Ao contratado (nota ou execução)</option>
                <option value="FISCAL">À área / fiscal do contrato</option>
              </select>
            </Field>
            <Field id="conferencia-motivo" label="O que precisa ser corrigido *">
              <input id="conferencia-motivo" className="form-input" type="text" placeholder="Ex.: atesto sem assinatura do fiscal substituto" value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
            </Field>
          </>
        )}
        {acao === 'CONFERIDO' && (
          <DateField
            id="conferencia-prazo-envio"
            label="Enviar à CGOFI até *"
            value={prazo}
            onChange={(v) => { setPrazo(v); setPrazoTocado(true); }}
            hint={padraoISO ? `Prazo padrão: ${isoToBR(padraoISO)}.` : undefined}
          />
        )}
        {alongado && <JustificativaField id="conferencia-justificativa" value={justificativa} onChange={setJustificativa} hint="Prazo além do padrão exige justificativa." />}

        {error && <NoticeBar tone="danger" testId="payment-conferencia-error">{error}</NoticeBar>}
      </form>
    </Modal>
  );
};
