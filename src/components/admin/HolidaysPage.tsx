import React from 'react';
import { CalendarOff, ChevronLeft, ChevronRight, CopyPlus, Download, Edit2, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../design-system/components/PageHeader';
import { AppButton } from '../../design-system/components/AppButton';
import { EmptyState } from '../../design-system/components/EmptyState';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { Modal } from '../../design-system/components/Modal';
import { useConfirmDialog, useToast } from '../../design-system';
import {
  HOLIDAY_TIPO_LABEL,
  computeBaselineHolidays,
  type HolidayRecord,
  type HolidayTipo
} from '../../config/holidayCalendar';
import {
  buildCopyFromPreviousYear,
  copyHolidaysFromPreviousYear,
  deleteHoliday,
  importHolidaysForYear,
  loadAndApplyHolidays,
  saveHoliday
} from '../../services/holidayService';
import { formatDateBR, parseDateBRT } from '../../services/temporalEngineService';
import { carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.6rem',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '0.88rem',
  color: '#0f172a',
  boxSizing: 'border-box'
};

const labelStyle: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '0.3rem' };

interface FormState {
  data: string;
  nome: string;
  tipo: HolidayTipo;
  ativo: boolean;
  meioExpediente: boolean;
}

const emptyForm = (year: number): FormState => ({ data: `${year}-01-01`, nome: '', tipo: 'PONTO_FACULTATIVO', ativo: true, meioExpediente: false });

function weekdayOf(dateIso: string): string {
  const d = parseDateBRT(dateIso);
  return d ? WEEKDAYS[d.getDay()] : '';
}

export const HolidaysPage: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirmDialog();

  const [year, setYear] = React.useState(() => new Date().getFullYear());
  const [records, setRecords] = React.useState<HolidayRecord[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isBusy, setIsBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<{ original?: string; form: FormState } | null>(null);

  const reload = React.useCallback(async () => {
    setRecords(await loadAndApplyHolidays());
  }, []);

  React.useEffect(() => {
    void reload().finally(() => setIsLoading(false));
  }, [reload]);

  const yearRecords = records.filter((r) => r.data.startsWith(`${year}-`));
  const registeredDates = new Set(yearRecords.map((r) => r.data));
  const pendingBaseline = computeBaselineHolidays(year).filter((h) => !registeredDates.has(h.data));
  const copyCandidates = buildCopyFromPreviousYear(records, year).filter((h) => !registeredDates.has(h.data));

  /** Executa uma alteração, recarrega o calendário e recalcula as telas abertas. */
  const run = async (action: () => Promise<string>) => {
    setIsBusy(true);
    try {
      const message = await action();
      await reload();
      await queryClient.invalidateQueries();
      toast.success(message);
    } catch (err: any) {
      toast.error(`Não foi possível concluir: ${err?.message || 'erro desconhecido'}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleImport = () =>
    run(async () => {
      const result = await importHolidaysForYear(year);
      const base = result.inserted === 0
        ? `Nenhuma data nova para ${year}: todas já estavam cadastradas.`
        : `${result.inserted} ${result.inserted === 1 ? 'data importada' : 'datas importadas'} para ${year}. Confira os pontos facultativos com a portaria do ano.`;
      return result.apiOk ? base : `${base} A BrasilAPI não respondeu; os feriados nacionais vieram do calendário calculado.`;
    });

  const handleCopy = () =>
    run(async () => {
      const result = await copyHolidaysFromPreviousYear(records, year);
      return `${result.inserted} ${result.inserted === 1 ? 'data copiada' : 'datas copiadas'} de ${year - 1}.`;
    });

  const handleToggle = (r: HolidayRecord) =>
    run(async () => {
      await saveHoliday({ data: r.data, nome: r.nome, tipo: r.tipo, ativo: !r.ativo, meioExpediente: r.meioExpediente });
      return r.ativo ? `${r.nome} desativado: passa a contar como dia útil.` : `${r.nome} reativado.`;
    });

  const handleDelete = async (r: HolidayRecord) => {
    const isBaseline = computeBaselineHolidays(year).some((h) => h.data === r.data);
    const ok = await confirm({
      title: 'Excluir data',
      message: isBaseline
        ? `${formatDateBR(r.data)} é feriado do calendário calculado e continuará contando como feriado mesmo excluído. Para que conte como dia útil, desative em vez de excluir. Excluir assim mesmo?`
        : `Excluir ${r.nome} (${formatDateBR(r.data)})? A data passa a contar como dia útil.`,
      confirmLabel: 'Excluir',
      tone: 'danger'
    });
    if (!ok) return;
    await run(async () => {
      await deleteHoliday(r.data);
      return `${r.nome} excluído.`;
    });
  };

  const handleSaveForm = async () => {
    if (!editing) return;
    const { form, original } = editing;
    if (!form.nome.trim() || !parseDateBRT(form.data)) return;
    await run(async () => {
      await saveHoliday({ ...form, nome: form.nome.trim() }, original);
      setEditing(null);
      const savedYear = Number(form.data.slice(0, 4));
      if (savedYear !== year) setYear(savedYear);
      return `${form.nome.trim()} salvo.`;
    });
  };

  const formValid = Boolean(editing && editing.form.nome.trim() && parseDateBRT(editing.form.data));
  const setForm = (patch: Partial<FormState>) => setEditing((prev) => (prev ? { ...prev, form: { ...prev.form, ...patch } } : prev));

  const iconButton = (color: string): React.CSSProperties => ({ background: 'none', border: 'none', cursor: isBusy ? 'not-allowed' : 'pointer', color, padding: '0.2rem', display: 'inline-flex' });

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1.5rem 2rem 3rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Feriados"
        subtitle="Datas sem expediente descontadas dos prazos em dias úteis."
        icon={<CalendarOff size={26} color="#0c326f" aria-hidden="true" />}
        actions={
          <>
            <AppButton variant="outline" icon={<Download size={15} />} onClick={handleImport} disabled={isBusy} data-testid="holidays-import">
              Importar {year}
            </AppButton>
            <AppButton
              variant="outline"
              icon={<CopyPlus size={15} />}
              onClick={handleCopy}
              disabled={isBusy || copyCandidates.length === 0}
              title={copyCandidates.length === 0 ? `Nenhuma data manual de ${year - 1} para copiar` : undefined}
              data-testid="holidays-copy"
            >
              Copiar de {year - 1}{copyCandidates.length > 0 ? ` (${copyCandidates.length})` : ''}
            </AppButton>
            <AppButton icon={<Plus size={15} />} onClick={() => setEditing({ form: emptyForm(year) })} disabled={isBusy} data-testid="holidays-new">
              Nova data
            </AppButton>
          </>
        }
      />

      {!isLoading && pendingBaseline.length > 0 && (
        <NoticeBar tone="info" testId="holidays-pending-baseline">
          {pendingBaseline.length} {pendingBaseline.length === 1 ? 'feriado nacional ou distrital ainda não cadastrado já é descontado' : 'feriados nacionais ou distritais ainda não cadastrados já são descontados'} pelo
          calendário do sistema ({pendingBaseline.map((h) => formatDateBR(h.data).slice(0, 5)).join(', ')}). Use "Importar {year}" para trazê-los para a lista.
        </NoticeBar>
      )}

      <div data-testid="holidays-list" style={carteiraTableShell}>
        <div style={{ padding: '0.5rem 1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
            Datas cadastradas em {year} ({yearRecords.length})
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AppButton variant="outline" size="sm" iconOnly icon={<ChevronLeft size={15} />} onClick={() => setYear((y) => y - 1)} aria-label="Ano anterior" />
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0c326f', minWidth: '4ch', textAlign: 'center' }} data-testid="holidays-year">{year}</span>
            <AppButton variant="outline" size="sm" iconOnly icon={<ChevronRight size={15} />} onClick={() => setYear((y) => y + 1)} aria-label="Próximo ano" />
          </div>
        </div>
        {isLoading ? (
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <SkeletonLoader variant="card" height="40px" />
            <SkeletonLoader variant="card" height="40px" />
            <SkeletonLoader variant="card" height="40px" />
          </div>
        ) : yearRecords.length === 0 ? (
          <EmptyState
            title={`Nenhuma data cadastrada para ${year}.`}
            description={`Use "Importar ${year}" para trazer os feriados nacionais, o feriado distrital do DF e os pontos facultativos usuais.`}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...carteiraTh, width: '120px' }}>Data</th>
                  <th style={{ ...carteiraTh, width: '110px' }}>Dia</th>
                  <th style={carteiraTh}>Nome</th>
                  <th style={{ ...carteiraTh, width: '170px' }}>Tipo</th>
                  <th style={{ ...carteiraTh, width: '220px' }}>Nos prazos</th>
                  <th style={{ ...carteiraTh, width: '120px', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {yearRecords.map((r) => (
                  <tr key={r.data} data-testid={`holiday-row-${r.data}`} style={{ opacity: r.ativo ? 1 : 0.7 }}>
                    <td style={{ ...carteiraTd, fontWeight: 700, color: '#0c326f' }}>{formatDateBR(r.data)}</td>
                    <td style={{ ...carteiraTd, color: '#64748b' }}>{weekdayOf(r.data)}</td>
                    <td style={carteiraTd}>{r.nome}</td>
                    <td style={carteiraTd}>
                      <StatusBadge size="sm" label={HOLIDAY_TIPO_LABEL[r.tipo]} variant={r.tipo === 'NACIONAL' ? 'info' : r.tipo === 'DISTRITAL' ? 'purple' : 'neutral'} />
                    </td>
                    <td style={carteiraTd}>
                      {!r.ativo ? (
                        <StatusBadge size="sm" label="Desativado: dia útil" variant="neutral" />
                      ) : r.meioExpediente ? (
                        <StatusBadge size="sm" label="Meio expediente: dia útil" variant="warning" />
                      ) : (
                        <StatusBadge size="sm" label="Sem expediente" variant="success" />
                      )}
                    </td>
                    <td style={{ ...carteiraTd, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => handleToggle(r)}
                          disabled={isBusy}
                          title={r.ativo ? 'Desativar (passa a contar como dia útil)' : 'Reativar'}
                          aria-label={`${r.ativo ? 'Desativar' : 'Reativar'} ${r.nome}`}
                          data-testid={`holiday-toggle-${r.data}`}
                          style={iconButton('#64748b')}
                        >
                          {r.ativo ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing({ original: r.data, form: { data: r.data, nome: r.nome, tipo: r.tipo, ativo: r.ativo, meioExpediente: r.meioExpediente } })}
                          disabled={isBusy}
                          title="Editar data"
                          aria-label={`Editar ${r.nome}`}
                          style={iconButton('#0ea5e9')}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r)}
                          disabled={isBusy}
                          title="Excluir data"
                          aria-label={`Excluir ${r.nome}`}
                          style={iconButton('#ef4444')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.original ? 'Editar data' : 'Nova data sem expediente'}
        subtitle="Pontos facultativos da portaria anual do MGI, feriados do DF ou qualquer outra data sem expediente."
        size="sm"
        testId="holiday-form"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <AppButton variant="outline" onClick={() => setEditing(null)} disabled={isBusy}>Cancelar</AppButton>
            <AppButton onClick={handleSaveForm} disabled={!formValid || isBusy} isLoading={isBusy} data-testid="holiday-form-save">Salvar</AppButton>
          </div>
        }
      >
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div>
              <label htmlFor="holiday-data" style={labelStyle}>Data</label>
              <input id="holiday-data" type="date" value={editing.form.data} onChange={(e) => setForm({ data: e.target.value })} style={fieldStyle} data-testid="holiday-form-data" />
            </div>
            <div>
              <label htmlFor="holiday-nome" style={labelStyle}>Nome</label>
              <input id="holiday-nome" type="text" maxLength={150} value={editing.form.nome} onChange={(e) => setForm({ nome: e.target.value })} placeholder="Ex.: Dia do Servidor Público" style={fieldStyle} data-testid="holiday-form-nome" />
            </div>
            <div>
              <label htmlFor="holiday-tipo" style={labelStyle}>Tipo</label>
              <select id="holiday-tipo" value={editing.form.tipo} onChange={(e) => setForm({ tipo: e.target.value as HolidayTipo })} style={fieldStyle} data-testid="holiday-form-tipo">
                {(Object.keys(HOLIDAY_TIPO_LABEL) as HolidayTipo[]).map((t) => (
                  <option key={t} value={t}>{HOLIDAY_TIPO_LABEL[t]}</option>
                ))}
              </select>
            </div>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.86rem', color: '#0f172a' }}>
              <input type="checkbox" checked={editing.form.meioExpediente} onChange={(e) => setForm({ meioExpediente: e.target.checked })} data-testid="holiday-form-meio" />
              <span>
                Meio expediente
                <span style={{ display: 'block', fontSize: '0.76rem', color: '#64748b' }}>Ex.: Quarta-feira de Cinzas até 14h. Conta como dia útil.</span>
              </span>
            </label>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.86rem', color: '#0f172a' }}>
              <input type="checkbox" checked={editing.form.ativo} onChange={(e) => setForm({ ativo: e.target.checked })} data-testid="holiday-form-ativo" />
              Ativo (descontar dos prazos)
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
};
