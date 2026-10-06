import React from 'react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { CalendarOff, CopyPlus, Download } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../design-system/components/PageHeader';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
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
import { DataTable } from '../../design-system/components/DataTable';
import { AppInput, AppSelect } from '../../design-system/components/FormFields';
import { AdminListShell } from './shared/AdminListShell';

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

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

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Feriados"
        subtitle="Datas sem expediente descontadas dos prazos em dias úteis."
        icon={<CalendarOff size={26} color="var(--primary)" aria-hidden="true" />}
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
            <ActionButton action="novo" label="Nova data" onClick={() => setEditing({ form: emptyForm(year) })} disabled={isBusy} data-testid="holidays-new" />
          </>
        }
      />

      {!isLoading && pendingBaseline.length > 0 && (
        <NoticeBar tone="info" testId="holidays-pending-baseline">
          {pendingBaseline.length} {pendingBaseline.length === 1 ? 'feriado nacional ou distrital ainda não cadastrado já é descontado' : 'feriados nacionais ou distritais ainda não cadastrados já são descontados'} pelo
          calendário do sistema ({pendingBaseline.map((h) => formatDateBR(h.data).slice(0, 5)).join(', ')}). Use "Importar {year}" para trazê-los para a lista.
        </NoticeBar>
      )}

      <AdminListShell
        testId="holidays-list"
        title={`Datas cadastradas em ${year}`}
        countLabel={String(yearRecords.length)}
        stripActions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ActionButton action="anterior" iconOnly label="Ano anterior" onClick={() => setYear((y) => y - 1)} />
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--primary)', minWidth: '4ch', textAlign: 'center' }} data-testid="holidays-year">{year}</span>
            <ActionButton action="proximo" iconOnly label="Próximo ano" onClick={() => setYear((y) => y + 1)} />
          </div>
        }
        isLoading={isLoading}
        isEmpty={yearRecords.length === 0}
        emptyTitle={`Nenhuma data cadastrada para ${year}.`}
        emptyDescription={`Use "Importar ${year}" para trazer os feriados nacionais, o feriado distrital do DF e os pontos facultativos usuais.`}
      >
        <DataTable<HolidayRecord>
          testId="holidays-table"
          className="data-table-container--flush"
          data={yearRecords}
          keyExtractor={(r) => r.data}
          rowStyle={(r) => (r.ativo ? undefined : { opacity: 0.7 })}
          columns={[
            {
              key: 'data',
              header: 'Data',
              sortValue: (r) => r.data,
              width: '120px',
              priority: 'primary',
              render: (r) => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{formatDateBR(r.data)}</span>
            },
            { key: 'dia', header: 'Dia', width: '110px', sortValue: (r) => new Date(`${r.data}T12:00:00`).getDay(), render: (r) => <span style={{ color: '#64748b' }}>{weekdayOf(r.data)}</span> },
            { key: 'nome', header: 'Nome', sortValue: (r) => r.nome, render: (r) => r.nome },
            {
              key: 'tipo',
              header: 'Tipo',
              sortValue: (r) => HOLIDAY_TIPO_LABEL[r.tipo],
              width: '170px',
              render: (r) => (
                <StatusBadge size="sm" label={HOLIDAY_TIPO_LABEL[r.tipo]} variant={r.tipo === 'NACIONAL' ? 'info' : r.tipo === 'DISTRITAL' ? 'purple' : 'neutral'} />
              )
            },
            {
              key: 'prazos',
              header: 'Nos prazos',
              width: '220px',
              render: (r) =>
                !r.ativo ? (
                  <StatusBadge size="sm" label="Desativado: dia útil" variant="neutral" />
                ) : r.meioExpediente ? (
                  <StatusBadge size="sm" label="Meio expediente: dia útil" variant="warning" />
                ) : (
                  <StatusBadge size="sm" label="Sem expediente" variant="success" />
                )
            }
          ]}
          rowActions={(r) => (
            <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
              <ActionButton
                action={r.ativo ? 'ocultar' : 'verDetalhes'}
                iconOnly
                label={`${r.ativo ? 'Desativar' : 'Reativar'} ${r.nome}`}
                title={r.ativo ? 'Desativar (passa a contar como dia útil)' : 'Reativar'}
                onClick={() => handleToggle(r)}
                disabled={isBusy}
                data-testid={`holiday-toggle-${r.data}`}
              />
              <ActionButton
                action="editar"
                iconOnly
                label={`Editar ${r.nome}`}
                onClick={() => setEditing({ original: r.data, form: { data: r.data, nome: r.nome, tipo: r.tipo, ativo: r.ativo, meioExpediente: r.meioExpediente } })}
                disabled={isBusy}
              />
              <ActionButton
                action="excluir"
                iconOnly
                label={`Excluir ${r.nome}`}
                onClick={() => handleDelete(r)}
                disabled={isBusy}
              />
            </div>
          )}
        />
      </AdminListShell>

      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.original ? 'Editar data' : 'Nova data sem expediente'}
        subtitle="Pontos facultativos da portaria anual do MGI, feriados do DF ou qualquer outra data sem expediente."
        size="sm"
        testId="holiday-form"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <ActionButton action="cancelar" onClick={() => setEditing(null)} disabled={isBusy} />
            <ActionButton action="salvar" onClick={handleSaveForm} disabled={!formValid || isBusy} isLoading={isBusy} data-testid="holiday-form-save" />
          </div>
        }
      >
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <AppInput label="Data" type="date" value={editing.form.data} onChange={(e) => setForm({ data: e.target.value })} data-testid="holiday-form-data" />
            <AppInput label="Nome" type="text" maxLength={150} value={editing.form.nome} onChange={(e) => setForm({ nome: e.target.value })} placeholder="Ex.: Dia do Servidor Público" data-testid="holiday-form-nome" />
            <AppSelect label="Tipo" value={editing.form.tipo} onChange={(e) => setForm({ tipo: e.target.value as HolidayTipo })} data-testid="holiday-form-tipo">
              {(Object.keys(HOLIDAY_TIPO_LABEL) as HolidayTipo[]).map((t) => (
                <option key={t} value={t}>{HOLIDAY_TIPO_LABEL[t]}</option>
              ))}
            </AppSelect>
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
    </PageContainer>
  );
};
