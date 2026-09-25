import React, { useState, useMemo } from 'react';
import {
  X,
  Building2,
  Search,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { useContractsDashboard } from '../../hooks/useContractsDashboard';
import { useLinkContractToItem } from '../../hooks/useLinkContractToItem';
import type { ContractDashboardRecord } from '../../types';

interface LinkContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemKey: string;
  numeroAta: string;
  numeroItem: number | string;
  uasg?: string;
  quantidadeDisponivelItem?: number;
  existingLinkedContractKeys?: string[];
}

function formatCnpjDisplay(cnpj?: string): string {
  if (!cnpj) return '';
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  return cnpj;
}

function formatDateBR(dateStr?: string): string {
  if (!dateStr) return 'Não informada';
  const clean = dateStr.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const LinkContractModal: React.FC<LinkContractModalProps> = ({
  isOpen,
  onClose,
  itemKey,
  numeroAta,
  numeroItem,
  uasg,
  quantidadeDisponivelItem,
  existingLinkedContractKeys = []
}) => {
  const cleanUasg = uasg?.trim() || '200331';

  // 1. Reúso do catálogo oficial via React Query (Zero chamadas de rede se em cache)
  const { data: officialContracts = [], isLoading: loadingContracts } = useContractsDashboard(cleanUasg);
  const linkMutation = useLinkContractToItem();

  // Estados locais do formulário
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContract, setSelectedContract] = useState<ContractDashboardRecord | null>(null);
  const [quantidadeContratada, setQuantidadeContratada] = useState<string>('');
  const [observacoes, setObservacoes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // 2. Filtragem dos contratos oficiais disponíveis da UASG
  const filteredContracts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const existingSet = new Set(existingLinkedContractKeys.map(k => k.toUpperCase()));

    return officialContracts.filter(c => {
      // Opcional: ignorar contratos já vinculados a este mesmo item
      const canKey = (c.id || `${c.uasg}-${c.numero}-${c.ano}`).toUpperCase();
      if (existingSet.has(canKey) && (!selectedContract || selectedContract.id?.toUpperCase() !== canKey)) {
        return false;
      }

      if (!term) return true;

      const numMatch = (c.numero || '').toLowerCase().includes(term);
      const numFmtMatch = (c.numeroFormatado || '').toLowerCase().includes(term);
      const fornecedorMatch = (c.fornecedorNome || '').toLowerCase().includes(term);
      const cnpjMatch = (c.fornecedorCnpjCpf || '').replace(/\D/g, '').includes(term.replace(/\D/g, ''));
      const anoMatch = String(c.ano || '').includes(term);

      return numMatch || numFmtMatch || fornecedorMatch || cnpjMatch || anoMatch;
    });
  }, [officialContracts, searchTerm, existingLinkedContractKeys, selectedContract]);

  if (!isOpen) return null;

  const handleSelectContract = (contract: ContractDashboardRecord) => {
    setSelectedContract(contract);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedContract) {
      setFormError('Por favor, selecione um contrato oficial da lista.');
      return;
    }

    const qtdNum = parseFloat(quantidadeContratada.replace(',', '.'));
    if (isNaN(qtdNum) || qtdNum <= 0) {
      setFormError('Informe uma quantidade contratada válida e maior que zero.');
      return;
    }

    if (quantidadeDisponivelItem && qtdNum > quantidadeDisponivelItem) {
      setFormError(
        `A quantidade contratada (${qtdNum}) excede a quantidade homologada disponível do item (${quantidadeDisponivelItem}).`
      );
      return;
    }

    const contractKey = selectedContract.id || `${selectedContract.uasg}-${selectedContract.numero}-${selectedContract.ano}`;

    try {
      await linkMutation.mutateAsync({
        itemKey,
        contractKey,
        quantidadeContratada: qtdNum,
        observacoes: observacoes.trim() || undefined
      });
      onClose();
    } catch (err: any) {
      setFormError(err?.message || 'Falha ao vincular contrato oficial.');
    }
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100, position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div
        className="modal-content"
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden'
        }}
      >
        {/* Cabeçalho do Modal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0c326f', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Building2 size={20} color="#0c326f" /> Vincular Contrato Oficial ao Item
            </h3>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>
              Ata {numeroAta} • Item {numeroItem} • UASG {cleanUasg}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}
            title="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Corpo do Modal (com scroll) */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
          {formError && (
            <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '0.65rem 0.85rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={16} color="#dc2626" />
              <span>{formError}</span>
            </div>
          )}

          {/* PASSO 1: Seleção do Contrato Oficial */}
          {!selectedContract ? (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
                1. Selecione o Contrato Oficial vigente da UASG {cleanUasg}:
              </label>

              {/* Barra de Pesquisa */}
              <div style={{ position: 'relative', marginBottom: '1rem' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Pesquisar por número, fornecedor ou CNPJ..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem 0.55rem 2.25rem',
                    fontSize: '0.88rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    outline: 'none'
                  }}
                  autoFocus
                />
              </div>

              {/* Lista com scroll dos contratos oficiais */}
              {loadingContracts ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
                  <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem auto', color: '#0c326f' }} />
                  Carregando contratos oficiais da UASG...
                </div>
              ) : filteredContracts.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
                  <p style={{ margin: '0 0 0.25rem 0', fontWeight: 600 }}>Nenhum contrato oficial encontrado.</p>
                  <span style={{ fontSize: '0.78rem' }}>Verifique se o contrato já foi sincronizado no módulo Contratos.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '280px', overflowY: 'auto' }}>
                  {filteredContracts.map((c) => (
                    <div
                      key={c.id || `${c.uasg}-${c.numero}-${c.ano}`}
                      onClick={() => handleSelectContract(c)}
                      style={{
                        padding: '0.75rem 1rem',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.75rem'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#0c326f';
                        e.currentTarget.style.backgroundColor = '#f8fafc';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e2e8f0';
                        e.currentTarget.style.backgroundColor = '#ffffff';
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                          <strong style={{ fontSize: '0.92rem', color: '#0c326f' }}>
                            {c.numeroFormatado || `Contrato ${c.numero}/${c.ano}`}
                          </strong>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                            {c.statusVigencia || 'Vigente'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.fornecedorNome || 'Fornecedor não informado'}
                          {c.fornecedorCnpjCpf && (
                            <span style={{ color: '#64748b', marginLeft: '0.4rem' }}>
                              ({formatCnpjDisplay(c.fornecedorCnpjCpf)})
                            </span>
                          )}
                        </div>
                        {c.objeto && (
                          <div style={{ fontSize: '0.74rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '0.15rem' }}>
                            {c.objeto}
                          </div>
                        )}
                      </div>

                      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>Valor Global</span>
                        <strong style={{ fontSize: '0.88rem', color: '#0c326f' }}>
                          {formatCurrency(c.valorGlobal || c.valorInicial)}
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* PASSO 2: Contrato Selecionado + Preenchimento da Quantidade */
            <form onSubmit={handleSubmit}>
              {/* Card Resumido do Contrato Selecionado */}
              <div style={{ background: '#f8fafc', border: '1.5px solid #bfdbfe', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Contrato Oficial Selecionado
                    </span>
                    <h4 style={{ margin: '0.15rem 0 0 0', fontSize: '1.05rem', fontWeight: 800, color: '#0c326f' }}>
                      {selectedContract.numeroFormatado || `Contrato ${selectedContract.numero}/${selectedContract.ano}`}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedContract(null)}
                    style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.2rem 0.5rem', fontSize: '0.74rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
                  >
                    Trocar contrato
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem', fontSize: '0.78rem', color: '#475569' }}>
                  <div>
                    <strong>Fornecedor:</strong> {selectedContract.fornecedorNome || 'N/A'}
                  </div>
                  <div>
                    <strong>CNPJ:</strong> {formatCnpjDisplay(selectedContract.fornecedorCnpjCpf)}
                  </div>
                  <div>
                    <strong>Vigência até:</strong> {formatDateBR(selectedContract.dataVigenciaFim)}
                  </div>
                  <div>
                    <strong>Valor Global:</strong> {formatCurrency(selectedContract.valorGlobal || selectedContract.valorInicial)}
                  </div>
                </div>
              </div>

              {/* Campo Quantidade Contratada deste Item */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.35rem' }}>
                  Quantidade Contratada deste Item <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="number"
                    step="any"
                    min="0.0001"
                    placeholder="Ex: 50"
                    value={quantidadeContratada}
                    onChange={(e) => setQuantidadeContratada(e.target.value)}
                    required
                    style={{
                      width: '200px',
                      padding: '0.55rem 0.75rem',
                      fontSize: '0.9rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      outline: 'none',
                      fontWeight: 700
                    }}
                    autoFocus
                  />
                  {quantidadeDisponivelItem != null && (
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      (Total registrado na ata: <strong>{quantidadeDisponivelItem}</strong>)
                    </span>
                  )}
                </div>
              </div>

              {/* Campo Observações */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#475569', marginBottom: '0.35rem' }}>
                  Observações / Justificativa Interna
                </label>
                <input
                  type="text"
                  placeholder="Ex: Aquisição emergencial para reforço operacional..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.45rem 0.65rem',
                    fontSize: '0.82rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1'
                  }}
                />
              </div>

              {/* Botões de Ação */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={linkMutation.isPending}
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.85rem',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: '#475569'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={linkMutation.isPending || !quantidadeContratada}
                  style={{
                    padding: '0.5rem 1.25rem',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    background: '#0c326f',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: linkMutation.isPending ? 'wait' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  {linkMutation.isPending ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                  Vincular Contrato Oficial
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
