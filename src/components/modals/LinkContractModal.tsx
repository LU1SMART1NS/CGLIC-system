import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Loader2,
  Sparkles
} from 'lucide-react';
import { useContractsDashboard } from '../../hooks/useContractsDashboard';
import { useLinkContractToItem } from '../../hooks/useLinkContractToItem';
import { useLinkContractToItems } from '../../hooks/useLinkContractToItems';
import type { ContractDashboardRecord } from '../../types';
import { formatCnpj } from '../../utils/format';
import { Modal, AlertCard } from '../../design-system';
import {
  rankContractsBySuggestion,
  type ContractSuggestionCriteria,
  type ContractSuggestionReason
} from './linkContractSuggestions';

/** Item da Ata selecionável quando o modal é aberto a partir da Ata 360 (vários itens). */
export interface LinkableAtaItemOption {
  itemKey: string;
  numeroItem: string;
  descricao?: string;
  fornecedorNome?: string;
  fornecedorCnpj?: string;
  quantidadeHomologada?: number;
  /** Contratos já vinculados a este item (contractKey). */
  linkedContractKeys?: string[];
}

interface LinkContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Item fixo (tela de saldo do item). Ignorado quando `itemOptions` é informado. */
  itemKey?: string;
  numeroAta: string;
  numeroItem?: number | string;
  uasg?: string;
  quantidadeDisponivelItem?: number;
  existingLinkedContractKeys?: string[];
  /** Modo Ata: o usuário escolhe a qual item da Ata o contrato será vinculado. */
  itemOptions?: LinkableAtaItemOption[];
  /** Destaca e ordena primeiro os contratos da mesma compra / mesmos fornecedores. */
  suggestionCriteria?: ContractSuggestionCriteria;
  /** Abre direto no passo 2 com este contrato (vindo de uma sugestão). */
  initialContract?: ContractDashboardRecord | null;
  /** Quantidade sugerida para pré-preencher o passo 2. */
  initialQuantidade?: number;
}

const SUGGESTION_LABEL: Record<ContractSuggestionReason, string> = {
  compra: 'Mesma compra',
  fornecedor: 'Mesmo fornecedor'
};

const onlyDigits = (v?: string) => (v || '').replace(/\D/g, '');

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
  existingLinkedContractKeys = [],
  itemOptions,
  suggestionCriteria,
  initialContract,
  initialQuantidade
}) => {
  const isAtaMode = Boolean(itemOptions && itemOptions.length > 0);
  const cleanUasg = (uasg || '').trim();

  // 1. Reúso do catálogo oficial via React Query (Zero chamadas de rede se em cache)
  const { data: officialContracts = [], isLoading: loadingContracts } = useContractsDashboard(cleanUasg);
  const linkMutation = useLinkContractToItem();
  const linkItemsMutation = useLinkContractToItems();

  // Estados locais do formulário
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContract, setSelectedContract] = useState<ContractDashboardRecord | null>(null);
  const [quantidadeContratada, setQuantidadeContratada] = useState<string>('');
  const [observacoes, setObservacoes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  // Modo Ata: itens marcados e a quantidade do contrato em cada um
  const [itemRows, setItemRows] = useState<Record<string, { checked: boolean; qty: string }>>({});

  useEffect(() => {
    if (!isOpen || !initialContract) return;
    setSelectedContract(initialContract);
    setQuantidadeContratada(initialQuantidade != null ? String(initialQuantidade) : '');
    setFormError(null);
  }, [isOpen, initialContract, initialQuantidade]);

  const targetItemKey = itemKey || '';
  const targetQuantidadeDisponivel = quantidadeDisponivelItem;

  // 2. Filtragem dos contratos oficiais disponíveis da UASG
  const filteredContracts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const existingSet = new Set(existingLinkedContractKeys.map(k => k.toUpperCase()));

    const filtered = officialContracts.filter(c => {
      // Ignorar contratos já vinculados a este mesmo item (no modo Ata o mesmo
      // contrato pode ser vinculado a outros itens, então não filtra aqui)
      const canKey = (c.id || `${c.uasg}-${c.numero}-${c.ano}`).toUpperCase();
      if (!isAtaMode && existingSet.has(canKey) && (!selectedContract || selectedContract.id?.toUpperCase() !== canKey)) {
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

    return rankContractsBySuggestion(filtered, suggestionCriteria);
  }, [officialContracts, searchTerm, existingLinkedContractKeys, selectedContract, isAtaMode, suggestionCriteria]);

  const isPending = linkMutation.isPending || linkItemsMutation.isPending;

  const suggestedCount = filteredContracts.filter((r) => r.reasons.length > 0).length;

  if (!isOpen) return null;

  const contractKeyOf = (c: ContractDashboardRecord) => c.id || `${c.uasg}-${c.numero}-${c.ano}`;

  const handleClose = () => {
    setSearchTerm('');
    setSelectedContract(null);
    setQuantidadeContratada('');
    setObservacoes('');
    setFormError(null);
    setItemRows({});
    onClose();
  };

  const handleSelectContract = (contract: ContractDashboardRecord) => {
    setSelectedContract(contract);
    setFormError(null);

    if (isAtaMode) {
      // Pré-marca os itens do mesmo fornecedor do contrato que ainda não o têm vinculado
      const cnpj = onlyDigits(contract.fornecedorCnpjCpf);
      const key = contractKeyOf(contract).toUpperCase();
      const rows: Record<string, { checked: boolean; qty: string }> = {};
      itemOptions!.forEach((i) => {
        const linked = i.linkedContractKeys?.some((k) => k.toUpperCase() === key);
        const sameSupplier = cnpj !== '' && onlyDigits(i.fornecedorCnpj) === cnpj;
        rows[i.itemKey] = { checked: !linked && sameSupplier, qty: '' };
      });
      setItemRows(rows);
    }
  };

  const isItemLinked = (i: LinkableAtaItemOption) =>
    Boolean(selectedContract && i.linkedContractKeys?.some((k) => k.toUpperCase() === contractKeyOf(selectedContract).toUpperCase()));

  const checkedItems = isAtaMode ? itemOptions!.filter((i) => itemRows[i.itemKey]?.checked && !isItemLinked(i)) : [];

  const handleSubmitBatch = async () => {
    if (!selectedContract) return;

    if (checkedItems.length === 0) {
      setFormError('Marque ao menos um item da ata coberto por este contrato.');
      return;
    }

    const links: { itemKey: string; quantidadeContratada: number }[] = [];
    for (const i of checkedItems) {
      const qtd = parseFloat((itemRows[i.itemKey]?.qty || '').replace(',', '.'));
      if (isNaN(qtd) || qtd <= 0) {
        setFormError(`Informe uma quantidade válida e maior que zero para o item ${i.numeroItem}.`);
        return;
      }
      if (i.quantidadeHomologada && qtd > i.quantidadeHomologada) {
        setFormError(`A quantidade do item ${i.numeroItem} (${qtd}) excede a quantidade homologada (${i.quantidadeHomologada}).`);
        return;
      }
      links.push({ itemKey: i.itemKey, quantidadeContratada: qtd });
    }

    try {
      await linkItemsMutation.mutateAsync({
        contractKey: contractKeyOf(selectedContract),
        links,
        observacoes: observacoes.trim() || undefined
      });
      handleClose();
    } catch (err: any) {
      setFormError(err?.message || 'Falha ao vincular contrato oficial.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedContract) {
      setFormError('Por favor, selecione um contrato oficial da lista.');
      return;
    }

    if (isAtaMode) {
      await handleSubmitBatch();
      return;
    }

    if (!targetItemKey) {
      setFormError('Selecione o item da ata ao qual o contrato será vinculado.');
      return;
    }

    const qtdNum = parseFloat(quantidadeContratada.replace(',', '.'));
    if (isNaN(qtdNum) || qtdNum <= 0) {
      setFormError('Informe uma quantidade contratada válida e maior que zero.');
      return;
    }

    if (targetQuantidadeDisponivel && qtdNum > targetQuantidadeDisponivel) {
      setFormError(
        `A quantidade contratada (${qtdNum}) excede a quantidade homologada disponível do item (${targetQuantidadeDisponivel}).`
      );
      return;
    }

    const contractKey = contractKeyOf(selectedContract);

    try {
      await linkMutation.mutateAsync({
        itemKey: targetItemKey,
        contractKey,
        quantidadeContratada: qtdNum,
        observacoes: observacoes.trim() || undefined
      });
      handleClose();
    } catch (err: any) {
      setFormError(err?.message || 'Falha ao vincular contrato oficial.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isAtaMode ? 'Vincular contrato oficial à Ata' : 'Vincular contrato oficial ao item'}
      subtitle={`Ata ${numeroAta}${isAtaMode ? '' : ` • Item ${numeroItem}`} • UASG ${cleanUasg}`}
      size="lg"
      testId="link-contract-modal"
    >
        <div>
          {formError && (
            <div style={{ marginBottom: '1rem' }}>
              <AlertCard severity="CRITICA" title={formError} />
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

              {suggestionCriteria && !loadingContracts && (
                <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.76rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Sparkles size={13} color="#b45309" />
                  {suggestedCount > 0
                    ? `${suggestedCount} ${suggestedCount === 1 ? 'contrato sugerido' : 'contratos sugeridos'} (mesma compra ou mesmo fornecedor da ata) no topo da lista. Confirme antes de vincular.`
                    : 'Nenhum contrato da mesma compra ou dos mesmos fornecedores desta ata foi encontrado.'}
                </p>
              )}

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
                  {filteredContracts.map(({ contract: c, reasons }) => (
                    <div
                      key={contractKeyOf(c)}
                      data-testid="link-contract-option"
                      onClick={() => handleSelectContract(c)}
                      style={{
                        padding: '0.75rem 1rem',
                        background: '#ffffff',
                        border: reasons.length > 0 ? '1px solid #fde68a' : '1px solid #e2e8f0',
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
                        e.currentTarget.style.borderColor = reasons.length > 0 ? '#fde68a' : '#e2e8f0';
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
                          {reasons.map((r) => (
                            <span
                              key={r}
                              style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', backgroundColor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                            >
                              <Sparkles size={10} /> {SUGGESTION_LABEL[r]}
                            </span>
                          ))}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.fornecedorNome || 'Fornecedor não informado'}
                          {c.fornecedorCnpjCpf && (
                            <span style={{ color: '#64748b', marginLeft: '0.4rem' }}>
                              ({formatCnpj(c.fornecedorCnpjCpf)})
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
                    <strong>CNPJ:</strong> {formatCnpj(selectedContract.fornecedorCnpjCpf)}
                  </div>
                  <div>
                    <strong>Vigência até:</strong> {formatDateBR(selectedContract.dataVigenciaFim)}
                  </div>
                  <div>
                    <strong>Valor Global:</strong> {formatCurrency(selectedContract.valorGlobal || selectedContract.valorInicial)}
                  </div>
                </div>
              </div>

              {/* Itens da Ata cobertos pelo contrato (modo Ata) */}
              {isAtaMode && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.35rem' }}>
                    Itens cobertos por este contrato <span style={{ color: '#dc2626' }}>*</span>
                  </div>
                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.76rem', color: '#64748b' }}>
                    Marque cada item que o contrato atende e informe a quantidade contratada nele.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '260px', overflowY: 'auto' }}>
                    {itemOptions!.map((i) => {
                      const linked = isItemLinked(i);
                      const row = itemRows[i.itemKey] || { checked: false, qty: '' };
                      const sameSupplier =
                        onlyDigits(i.fornecedorCnpj) !== '' &&
                        onlyDigits(i.fornecedorCnpj) === onlyDigits(selectedContract.fornecedorCnpjCpf);
                      return (
                        <div
                          key={i.itemKey}
                          data-testid="link-contract-item-row"
                          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.65rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: linked ? '#f8fafc' : '#ffffff', opacity: linked ? 0.7 : 1 }}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Item ${i.numeroItem}`}
                            checked={linked ? false : row.checked}
                            disabled={linked}
                            onChange={(e) => setItemRows((prev) => ({ ...prev, [i.itemKey]: { ...row, checked: e.target.checked } }))}
                          />
                          <div style={{ flex: 1, minWidth: 0, fontSize: '0.8rem' }}>
                            <div style={{ fontWeight: 700, color: '#0c326f' }}>
                              Item {i.numeroItem}
                              {sameSupplier && <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: '#b45309' }}>mesmo fornecedor</span>}
                              {linked && <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: '#64748b' }}>já vinculado</span>}
                            </div>
                            <div style={{ color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {i.descricao || 'Sem descrição'}
                              {i.fornecedorNome ? ` (${i.fornecedorNome})` : ''}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}>
                            <input
                              type="number"
                              step="any"
                              min="0.0001"
                              placeholder="Qtd"
                              aria-label={`Quantidade do item ${i.numeroItem}`}
                              value={row.qty}
                              disabled={linked || !row.checked}
                              onChange={(e) => setItemRows((prev) => ({ ...prev, [i.itemKey]: { ...row, qty: e.target.value } }))}
                              style={{ width: '110px', padding: '0.35rem 0.5rem', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700 }}
                            />
                            {i.quantidadeHomologada != null && (
                              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>de {i.quantidadeHomologada}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Campo Quantidade Contratada deste Item */}
              {!isAtaMode && (
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
                  {targetQuantidadeDisponivel != null && (
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      (Total registrado na ata: <strong>{targetQuantidadeDisponivel}</strong>)
                    </span>
                  )}
                </div>
              </div>
              )}

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
                  onClick={handleClose}
                  disabled={isPending}
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
                  disabled={isPending || (isAtaMode ? checkedItems.length === 0 : !quantidadeContratada)}
                  style={{
                    padding: '0.5rem 1.25rem',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    background: '#0c326f',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: isPending ? 'wait' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  {isPending ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                  {isAtaMode && checkedItems.length > 1 ? `Vincular a ${checkedItems.length} itens` : 'Vincular Contrato Oficial'}
                </button>
              </div>
            </form>
          )}
        </div>
    </Modal>
  );
};
