import React, { useState } from 'react';
import { X, Plus, Check } from 'lucide-react';
import type { Empenho } from '../../types';

interface ManualEmpenhoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (empenho: Omit<Empenho, 'id' | 'criadoEm' | 'atualizadoEm'>) => void;
  arpId: string;
  itemId: string;
  defaultUasg: string;
  defaultFornecedor?: string;
  defaultCnpj?: string;
  defaultValorUnitario?: number;
  initialEmpenho?: Empenho | null;
  isLoading?: boolean;
}

export const ManualEmpenhoModal: React.FC<ManualEmpenhoModalProps> = ({
  isOpen,
  onClose,
  onSave,
  arpId,
  itemId,
  defaultUasg,
  defaultFornecedor = '',
  defaultCnpj = '',
  defaultValorUnitario = 0,
  initialEmpenho,
  isLoading = false
}) => {
  const currentYear = new Date().getFullYear();

  const [numero, setNumero] = useState(initialEmpenho?.numero || '');
  const [ano, setAno] = useState<number>(initialEmpenho?.ano || currentYear);
  const [uasg, setUasg] = useState(initialEmpenho?.uasg || defaultUasg || '200331');
  const [quantidade, setQuantidade] = useState<number | ''>(initialEmpenho?.quantidade || '');
  const [data, setData] = useState(initialEmpenho?.data || new Date().toISOString().split('T')[0]);
  const [fornecedor, setFornecedor] = useState(initialEmpenho?.fornecedor || defaultFornecedor);
  const [cnpjFornecedor, setCnpjFornecedor] = useState(initialEmpenho?.cnpjFornecedor || defaultCnpj);
  const [valorUnitario, setValorUnitario] = useState<number | ''>(initialEmpenho?.valorUnitario ?? defaultValorUnitario);
  const [valorTotal, setValorTotal] = useState<number | ''>(
    initialEmpenho?.valorTotal ?? (typeof quantidade === 'number' && typeof valorUnitario === 'number' ? quantidade * valorUnitario : '')
  );
  const [observacao, setObservacao] = useState(initialEmpenho?.observacao || '');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleQtdChange = (val: number | '') => {
    setQuantidade(val);
    if (typeof val === 'number' && typeof valorUnitario === 'number' && valorUnitario > 0) {
      setValorTotal(val * valorUnitario);
    }
  };

  const handleUnitChange = (val: number | '') => {
    setValorUnitario(val);
    if (typeof quantidade === 'number' && typeof val === 'number') {
      setValorTotal(quantidade * val);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!numero.trim()) {
      setError('O número do empenho é obrigatório.');
      return;
    }
    if (!ano || ano < 2000 || ano > 2100) {
      setError('Informe um ano válido.');
      return;
    }
    if (!uasg.trim()) {
      setError('A UASG é obrigatória.');
      return;
    }
    if (!quantidade || Number(quantidade) <= 0) {
      setError('A quantidade deve ser maior que zero.');
      return;
    }

    onSave({
      numero: numero.trim().toUpperCase(),
      ano: Number(ano),
      arpId,
      itemId,
      uasg: uasg.trim(),
      quantidade: Number(quantidade),
      data: data || undefined,
      fornecedor: fornecedor.trim() || undefined,
      cnpjFornecedor: cnpjFornecedor.trim() || undefined,
      valorUnitario: valorUnitario !== '' ? Number(valorUnitario) : undefined,
      valorTotal: valorTotal !== '' ? Number(valorTotal) : undefined,
      observacao: observacao.trim() || undefined,
      origem: 'MANUAL',
      status: 'CONFIRMADO'
    });

    onClose();
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100 }}>
      <div className="modal-content" style={{ maxWidth: '550px', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={20} color="var(--primary)" />
            {initialEmpenho ? 'Editar Empenho Manual' : 'Adicionar Empenho Manual'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
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
                Número do Empenho *
              </label>
              <input
                type="text"
                value={numero}
                onChange={e => setNumero(e.target.value)}
                placeholder="Ex: 2026NE000142"
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
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                UASG Emitente *
              </label>
              <input
                type="text"
                value={uasg}
                onChange={e => setUasg(e.target.value)}
                placeholder="Ex: 200331"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Quantidade Física (Item) *
              </label>
              <input
                type="number"
                value={quantidade}
                onChange={e => handleQtdChange(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0"
                min="0.01"
                step="any"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem', fontWeight: 700 }}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Data de Emissão
              </label>
              <input
                type="date"
                value={data}
                onChange={e => setData(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Valor Unitário (R$)
              </label>
              <input
                type="number"
                value={valorUnitario}
                onChange={e => handleUnitChange(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0.00"
                step="0.01"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Valor Total (R$)
              </label>
              <input
                type="number"
                value={valorTotal}
                onChange={e => setValorTotal(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0.00"
                step="0.01"
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
                placeholder="00.000.000/0000-00"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              Observações / Justificativa
            </label>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              placeholder="Ex: Nota de Empenho emitida no SIAFI, aguardando integração no PNCP."
              rows={2}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="btn btn-secondary"
              style={{ padding: '0.5rem 1rem', borderRadius: '6px' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary"
              style={{ padding: '0.5rem 1.25rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}
            >
              {isLoading ? (
                <>
                  <div className="spinner" style={{ width: '14px', height: '14px' }} />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>Salvar Empenho</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
