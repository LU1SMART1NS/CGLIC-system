import React from 'react';
import { Landmark } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ActionButton, DataTable, NoticeBar, useToast } from '../../design-system';
import { listarLimitesArt75II, type LimiteArt75II } from '../../config/limitesLei14133';
import { salvarLimiteArt75II } from '../../services/alertSettingsService';
import { formatCurrencyInputBR, parseCurrencyInputBR } from '../contracts/payment/paymentFormUtils';
import { AdminListShell } from './shared/AdminListShell';

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Limite do art. 75, II da Lei 14.133 por ano: até ele, os prazos de liquidação e pagamento caem pela metade
 * (IN 77, art. 7º, § 2º). Valor da lei, atualizado todo ano por decreto: o coordenador cadastra o ano novo aqui.
 */
export const LimitesArt75Card: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [limites, setLimites] = React.useState<LimiteArt75II[]>(() => listarLimitesArt75II());
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = React.useState(String(anoAtual));
  const [valor, setValor] = React.useState('');
  const [decreto, setDecreto] = React.useState('');
  const [salvando, setSalvando] = React.useState(false);

  const faltaAnoAtual = !limites.some((l) => l.ano === anoAtual);
  const editar = (l: LimiteArt75II) => {
    setAno(String(l.ano));
    setValor(formatCurrencyInputBR(String(Math.round(l.valor * 100))));
    setDecreto(l.decreto);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = parseCurrencyInputBR(valor);
    const a = Number(ano);
    if (!a || !v || !decreto.trim()) return;
    setSalvando(true);
    try {
      await salvarLimiteArt75II({ ano: a, valor: v, decreto: decreto.trim() });
      setLimites(listarLimitesArt75II());
      await queryClient.invalidateQueries();
      toast.success(`Limite de ${a} salvo.`);
      setValor('');
      setDecreto('');
    } catch (err: any) {
      toast.error(`Não foi possível salvar: ${err?.message || 'erro desconhecido'}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <AdminListShell
      testId="alert-rules-limite-art75"
      title="Limite do art. 75, II da Lei 14.133 (pequeno valor)"
      description="Até este valor, os prazos de liquidação e de pagamento caem pela metade (IN 77, art. 7º, § 2º). O valor é atualizado todo ano por decreto (art. 182 da lei): cadastre o ano novo quando o decreto sair. Cada ciclo usa o limite do ano do atesto."
      icon={<Landmark size={16} color="#334155" aria-hidden="true" />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem 1rem' }}>
        {faltaAnoAtual && (
          <NoticeBar tone="warning" testId="alert-rules-limite-falta-ano">
            Ainda não há limite cadastrado para {anoAtual}. Até cadastrar, os ciclos usam o do último ano conhecido.
          </NoticeBar>
        )}
        <form onSubmit={salvar} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }} data-testid="alert-rules-limite-form">
          <div className="form-group" style={{ width: '90px' }}>
            <label className="form-label" htmlFor="limite-ano">Ano</label>
            <input id="limite-ano" className="form-input" type="text" inputMode="numeric" maxLength={4} value={ano} onChange={(e) => setAno(e.target.value.replace(/\D/g, ''))} required />
          </div>
          <div className="form-group" style={{ width: '150px' }}>
            <label className="form-label" htmlFor="limite-valor">Valor (R$)</label>
            <input id="limite-valor" className="form-input" type="text" inputMode="numeric" placeholder="0,00" value={valor} onChange={(e) => setValor(formatCurrencyInputBR(e.target.value))} required />
          </div>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label" htmlFor="limite-decreto">Decreto</label>
            <input id="limite-decreto" className="form-input" type="text" placeholder="Ex.: Decreto 12.807/2025" value={decreto} onChange={(e) => setDecreto(e.target.value)} required />
          </div>
          <ActionButton action="salvar" type="submit" size="sm" disabled={salvando} isLoading={salvando} data-testid="alert-rules-limite-salvar" />
        </form>
        <DataTable<LimiteArt75II>
          testId="alert-rules-limite-table"
          className="data-table-container--flush"
          data={[...limites].sort((a, b) => b.ano - a.ano)}
          keyExtractor={(l) => String(l.ano)}
          columns={[
            { key: 'ano', header: 'Ano', priority: 'primary', render: (l) => <span style={{ fontWeight: 700 }}>{l.ano}</span> },
            { key: 'valor', header: 'Limite', align: 'right', render: (l) => moeda(l.valor) },
            { key: 'decreto', header: 'Fonte', render: (l) => <span style={{ color: '#64748b' }}>{l.decreto}</span> }
          ]}
          rowActions={(l) => <ActionButton action="editar" size="sm" onClick={() => editar(l)} label="Editar" />}
        />
      </div>
    </AdminListShell>
  );
};
