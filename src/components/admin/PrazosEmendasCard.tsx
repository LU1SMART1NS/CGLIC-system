import React from 'react';
import { CalendarClock } from 'lucide-react';
import { ActionButton, DataTable, useToast } from '../../design-system';
import { usePrazosEmendas } from '../../hooks/usePrevisaoMensal';
import type { PrazoEmenda } from '../../services/previsaoMensalService';
import { isoToBR, maskDateInputBR, parseDateInputBR } from '../contracts/payment/paymentFormUtils';
import { rotuloDoMes } from '../financeiro/financeiroFormat';
import { AdminListShell } from './shared/AdminListShell';

/**
 * Prazo das emendas parlamentares na previsão mensal (Portaria DGFNSP 50/2025, art. 5º, § 3º): vem da portaria anual
 * que fixa os prazos dos processos orçamentários e financeiros. O coordenador cadastra o prazo de cada mês.
 */
export const PrazosEmendasCard: React.FC = () => {
  const toast = useToast();
  const { prazos, salvar } = usePrazosEmendas();
  const hoje = new Date();
  const [ano, setAno] = React.useState(String(hoje.getFullYear()));
  const [mes, setMes] = React.useState(String(hoje.getMonth() + 2 > 12 ? 1 : hoje.getMonth() + 2));
  const [data, setData] = React.useState('');
  const [portaria, setPortaria] = React.useState('');
  const [salvando, setSalvando] = React.useState(false);

  const editar = (p: PrazoEmenda) => {
    setAno(String(p.ano));
    setMes(String(p.mes));
    setData(isoToBR(p.dataLimite));
    setPortaria(p.portaria);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const dataISO = parseDateInputBR(data);
    if (!dataISO || !portaria.trim()) return;
    setSalvando(true);
    try {
      await salvar({ ano: Number(ano), mes: Number(mes), dataLimite: dataISO, portaria: portaria.trim() });
      toast.success('Prazo das emendas salvo.');
      setData('');
    } catch (err: any) {
      toast.error(`Não foi possível salvar: ${err?.message || 'erro desconhecido'}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <AdminListShell
      testId="alert-rules-prazos-emendas"
      title="Prazo das emendas na previsão de pagamentos"
      description="As emendas parlamentares têm prazo próprio para entrar na previsão mensal (Portaria 50, art. 5º, § 3º), fixado pela portaria anual dos prazos orçamentários e financeiros. Cadastre o prazo de cada mês; a previsão mostra o prazo e marca as linhas de emenda."
      icon={<CalendarClock size={16} color="#334155" aria-hidden="true" />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem 1rem' }}>
        <form onSubmit={enviar} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }} data-testid="prazos-emendas-form">
          <div className="form-group" style={{ width: '90px' }}>
            <label className="form-label" htmlFor="emenda-ano">Ano</label>
            <input id="emenda-ano" className="form-input" type="text" inputMode="numeric" maxLength={4} value={ano} onChange={(e) => setAno(e.target.value.replace(/\D/g, ''))} required />
          </div>
          <div className="form-group" style={{ width: '150px' }}>
            <label className="form-label" htmlFor="emenda-mes">Mês dos pagamentos</label>
            <select id="emenda-mes" className="form-input" value={mes} onChange={(e) => setMes(e.target.value)}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>{rotuloDoMes(`2000-${String(i + 1).padStart(2, '0')}`).split('/')[0]}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ width: '140px' }}>
            <label className="form-label" htmlFor="emenda-data">Informar até</label>
            <input id="emenda-data" className="form-input" type="text" inputMode="numeric" placeholder="dd/mm/aaaa" maxLength={10} value={data} onChange={(e) => setData(maskDateInputBR(e.target.value))} required />
          </div>
          <div className="form-group" style={{ flex: '1 1 220px' }}>
            <label className="form-label" htmlFor="emenda-portaria">Portaria</label>
            <input id="emenda-portaria" className="form-input" type="text" placeholder="Ex.: Portaria que fixa os prazos de 2026" value={portaria} onChange={(e) => setPortaria(e.target.value)} required />
          </div>
          <ActionButton action="salvar" type="submit" size="sm" disabled={salvando} isLoading={salvando} data-testid="prazos-emendas-salvar" />
        </form>
        <DataTable<PrazoEmenda>
          testId="prazos-emendas-table"
          className="data-table-container--flush"
          data={[...prazos].sort((a, b) => b.ano - a.ano || b.mes - a.mes)}
          keyExtractor={(p) => `${p.ano}-${p.mes}`}
          emptyMessage="Nenhum prazo cadastrado."
          columns={[
            { key: 'mes', header: 'Pagamentos de', priority: 'primary', render: (p) => <span style={{ fontWeight: 700 }}>{rotuloDoMes(`${p.ano}-${String(p.mes).padStart(2, '0')}`)}</span> },
            { key: 'data', header: 'Informar até', render: (p) => isoToBR(p.dataLimite) },
            { key: 'portaria', header: 'Fonte', render: (p) => <span style={{ color: '#64748b' }}>{p.portaria}</span> }
          ]}
          rowActions={(p) => <ActionButton action="editar" size="sm" onClick={() => editar(p)} label="Editar" />}
        />
      </div>
    </AdminListShell>
  );
};
