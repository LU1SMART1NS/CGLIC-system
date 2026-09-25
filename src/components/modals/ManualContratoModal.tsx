import React, { useState } from 'react';
import { X, Check, Building2, AlertCircle, DollarSign } from 'lucide-react';
import type { Contrato, Empenho } from '../../types';
import { AppButton } from '../../design-system/components/AppButton';

interface ManualContratoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    contrato: Omit<Contrato, 'id' | 'criadoEm' | 'atualizadoEm'>,
    selectedEmpenhoIds: string[]
  ) => Promise<void> | void;
  arpId: string;
  itemId?: string;
  defaultUasg: string;
  defaultFornecedor?: string;
  defaultCnpj?: string;
  availableEmpenhos: Empenho[];
  isLoading?: boolean;
}

export const ManualContratoModal: React.FC<ManualContratoModalProps> = ({
  isOpen,
  onClose,
  onSave,
  arpId,
  itemId,
  defaultUasg,
  defaultFornecedor = '',
  defaultCnpj = '',
  availableEmpenhos,
  isLoading = false
}) => {
  const currentYear = new Date().getFullYear();

  const [numero, setNumero] = useState('');
  const [ano, setAno] = useState<number>(currentYear);
  const [uasg, setUasg] = useState(defaultUasg || '200331');
  const [objeto, setObjeto] = useState('');
  const [fornecedor, setFornecedor] = useState(defaultFornecedor);
  const [cnpjFornecedor, setCnpjFornecedor] = useState(defaultCnpj);
  const [numeroControlePncp, setNumeroControlePncp] = useState('');
  const [linkPncp, setLinkPncp] = useState('');
  const [selectedEmpenhoIds, setSelectedEmpenhoIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleEmpenhoSelection = (empId: string) => {
    if (isLoading) return;
    setSelectedEmpenhoIds(prev =>
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    );
  };

  const handleSelectAll = () => {
    if (isLoading) return;
    if (selectedEmpenhoIds.length === availableEmpenhos.length) {
      setSelectedEmpenhoIds([]);
    } else {
      setSelectedEmpenhoIds(availableEmpenhos.map(e => e.id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    if (!numero.trim()) {
      setError('O número do contrato é obrigatório.');
      return;
    }
    if (!ano || ano < 2000 || ano > 2100) {
      setError('Informe um ano válido.');
      return;
    }
    if (selectedEmpenhoIds.length === 0) {
      setError('Um contrato deve possuir pelo menos uma Nota de Empenho vinculada como lastro orçamentário.');
      return;
    }

    try {
      await onSave(
        {
          numero: numero.trim(),
          ano: Number(ano),
          arpId,
          itemId,
          uasg: uasg.trim(),
          objeto: objeto.trim() || undefined,
          fornecedor: fornecedor.trim() || undefined,
          cnpjFornecedor: cnpjFornecedor.trim() || undefined,
          numeroControlePncp: numeroControlePncp.trim() || undefined,
          linkPncp: linkPncp.trim() || undefined,
          origem: 'MANUAL'
        },
        selectedEmpenhoIds
      );
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar contrato manual.');
    }
  };

  const isSaveDisabled = selectedEmpenhoIds.length === 0 || !numero.trim() || isLoading;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
    >
      <div
        className="modal-content"
        style={{
          maxWidth: '600px',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '1.5rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0c326f', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Building2 size={20} color="#0c326f" /> Adicionar Contrato Manual
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.25rem' }}
            title="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '0.6rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Número do Contrato *
              </label>
              <input
                type="text"
                value={numero}
                onChange={e => setNumero(e.target.value)}
                disabled={isLoading}
                placeholder="Ex: 00045/2026 ou 45"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Ano *
              </label>
              <input
                type="number"
                value={ano}
                onChange={e => setAno(parseInt(e.target.value, 10) || currentYear)}
                disabled={isLoading}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                UASG *
              </label>
              <input
                type="text"
                value={uasg}
                onChange={e => setUasg(e.target.value)}
                disabled={isLoading}
                placeholder="Ex: 200331"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Objeto Resumido
              </label>
              <input
                type="text"
                value={objeto}
                onChange={e => setObjeto(e.target.value)}
                disabled={isLoading}
                placeholder="Ex: Aquisição de viaturas operacionais"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Fornecedor
              </label>
              <input
                type="text"
                value={fornecedor}
                onChange={e => setFornecedor(e.target.value)}
                disabled={isLoading}
                placeholder="Razão Social"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                CNPJ
              </label>
              <input
                type="text"
                value={cnpjFornecedor}
                onChange={e => setCnpjFornecedor(e.target.value)}
                disabled={isLoading}
                placeholder="00.000.000/0000-00"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Nº Controle PNCP (Opcional)
              </label>
              <input
                type="text"
                value={numeroControlePncp}
                onChange={e => setNumeroControlePncp(e.target.value)}
                disabled={isLoading}
                placeholder="Ex: 00394494000136-1-000001/2026"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Link PNCP / Visualização (Opcional)
              </label>
              <input
                type="url"
                value={linkPncp}
                onChange={e => setLinkPncp(e.target.value)}
                disabled={isLoading}
                placeholder="https://pncp.gov.br/app/contratos/..."
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
              />
            </div>
          </div>

          {/* Seção Obrigatória de Vinculação de Empenhos */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <DollarSign size={16} color="var(--primary)" />
                Vincular Notas de Empenho (Obrigatório) *
              </label>
              {availableEmpenhos.length > 1 && (
                <button
                  type="button"
                  onClick={handleSelectAll}
                  disabled={isLoading}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer' }}
                >
                  {selectedEmpenhoIds.length === availableEmpenhos.length ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
              )}
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem 0' }}>
              Todo contrato formal deve possuir lastro orçamentário. Selecione os empenhos correspondentes:
            </p>

            {availableEmpenhos.length === 0 ? (
              <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', color: '#92400e', padding: '0.75rem', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle size={18} />
                <span>Nenhuma Nota de Empenho cadastrada neste item. Cadastre primeiro o Empenho antes de criar o Contrato.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto' }}>
                {availableEmpenhos.map(emp => {
                  const isChecked = selectedEmpenhoIds.includes(emp.id);
                  return (
                    <label
                      key={emp.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        border: isChecked ? '1px solid var(--primary)' : '1px solid #cbd5e1',
                        background: isChecked ? '#eff6ff' : '#ffffff',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        fontSize: '0.82rem',
                        opacity: isLoading ? 0.7 : 1
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleEmpenhoSelection(emp.id)}
                          disabled={isLoading}
                          style={{ cursor: isLoading ? 'not-allowed' : 'pointer' }}
                        />
                        <span style={{ fontWeight: 700, color: '#0c326f' }}>{emp.numero}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({emp.ano})</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontWeight: 700, color: 'var(--success)' }}>{emp.quantidade} un</span>
                        <span className={`badge ${emp.origem === 'MANUAL' ? 'badge-warning' : 'badge-info'}`} style={{ fontSize: '0.68rem' }}>
                          {emp.origem}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {selectedEmpenhoIds.length === 0 && availableEmpenhos.length > 0 && (
              <div style={{ color: '#b91c1c', fontSize: '0.75rem', fontWeight: 600, marginTop: '0.5rem' }}>
                🔒 Selecione pelo menos 1 empenho para liberar o salvamento.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
            <AppButton
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancelar
            </AppButton>
            <AppButton
              type="submit"
              variant="primary"
              size="sm"
              icon={isLoading ? undefined : <Check size={16} />}
              disabled={isSaveDisabled}
              isLoading={isLoading}
            >
              Salvar Contrato
            </AppButton>
          </div>
        </form>
      </div>
    </div>
  );
};
