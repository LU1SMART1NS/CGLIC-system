import React, { useState, useMemo, useEffect } from 'react';
import { Search, Loader2, Sparkles } from 'lucide-react';
import { useContractsDashboard } from '../../hooks/useContractsDashboard';
import { useAllAtaManagers, useArpItemContractLinks } from '../../hooks/useAtaManagers';
import { useAllContractManagers } from '../../hooks/useAllContractManagers';
import { useContratosSemAta } from '../../hooks/useContratosSemAta';
import { useLinkContractToItem } from '../../hooks/useLinkContractToItem';
import { useLinkContractToItems } from '../../hooks/useLinkContractToItems';
import { useContractItemQuantities } from '../../hooks/useContractItemQuantities';
import { useSyncItemContractEmpenhos } from '../../hooks/useSyncItemContractEmpenhos';
import { useSyncContractItemQuantity } from '../../hooks/useSyncContractItemQuantity';
import type { ContractDashboardRecord } from '../../types';
import { formatCnpj } from '../../utils/format';
import { displayContractNumber } from '../../utils/contractNumber';
import { useDescartesAtaContrato } from '../../hooks/useDescartesAtaContrato';
import { Modal, AlertCard, useToast, ActionButton, AppButton } from '../../design-system';
import {
  rankContractsBySuggestion,
  aplicarRestricoesDeVinculo,
  ataLinkCoverage,
  type ContractSuggestionCriteria,
  type ContractSuggestionReason
} from './linkContractSuggestions';
import { formatStatusVigencia } from '../../utils/statusVigencia';
import { chaveDoContrato } from '../../utils/contractKeyUtils';

/** Item da Ata selecionável quando o modal é aberto a partir da Ata 360 (vários itens). */
export interface LinkableAtaItemOption {
  itemKey: string;
  numeroItem: string;
  descricao?: string;
  fornecedorNome?: string;
  fornecedorCnpj?: string;
  quantidadeHomologada?: number;
  /** Preço unitário do item (base da estimativa de quantidade dos empenhos). */
  valorUnitario?: number;
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
  existingLinkedContractKeys?: string[];
  /** Preço unitário do item no modo Item. */
  itemUnitPrice?: number;
  /** Modo Ata: o usuário escolhe a qual item da Ata o contrato será vinculado. */
  itemOptions?: LinkableAtaItemOption[];
  /** Destaca e ordena primeiro os contratos da mesma compra / mesmos fornecedores. */
  suggestionCriteria?: ContractSuggestionCriteria;
  /** Abre direto no passo 2 com este contrato (vindo de uma sugestão). */
  initialContract?: ContractDashboardRecord | null;
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
  existingLinkedContractKeys = [],
  itemUnitPrice,
  itemOptions,
  suggestionCriteria,
  initialContract
}) => {
  const isAtaMode = Boolean(itemOptions && itemOptions.length > 0);
  const cleanUasg = (uasg || '').trim();

  // 1. Reúso do catálogo oficial via React Query (Zero chamadas de rede se em cache)
  const { data: officialContracts = [], isLoading: loadingContracts } = useContractsDashboard(cleanUasg);
  const linkMutation = useLinkContractToItem();
  const linkItemsMutation = useLinkContractToItems();
  const syncEmpenhosMutation = useSyncItemContractEmpenhos();
  const syncQuantityMutation = useSyncContractItemQuantity();
  const toast = useToast();

  // Estados locais do formulário
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContract, setSelectedContract] = useState<ContractDashboardRecord | null>(null);
  const [observacoes, setObservacoes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  // Modo Ata: marcações feitas pelo usuário (sobrescrevem a marcação sugerida pela API)
  const [checkedOverrides, setCheckedOverrides] = useState<Record<string, boolean>>({});
  const itemQuantities = useContractItemQuantities(isAtaMode ? selectedContract : null);

  // Regras de vínculo da CGLIC: um contrato pertence a uma só ata (o banco recusa vincular a outra) e o
  // contrato marcado pelo coordenador como "não pertence a ata" sai das sugestões. Ao vincular, o contrato
  // herda o gestor da ata (gatilho no banco, migration 69) — o passo 2 avisa.
  const { data: todosVinculos = [] } = useArpItemContractLinks(isOpen);
  const { data: semAta = {} } = useContratosSemAta();
  const { data: ataManagers } = useAllAtaManagers();
  const { data: contractManagers } = useAllContractManagers(cleanUasg);
  const ataDeOutroVinculo = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of todosVinculos) {
      if (l.ataKey !== numeroAta) map.set(l.contractKey.toUpperCase(), l.ataKey);
    }
    return map;
  }, [todosVinculos, numeroAta]);
  const { data: descartesAta = {} } = useDescartesAtaContrato();
  const descartadosParaEstaAta = useMemo(() => {
    const ataKey = `${numeroAta}-${(uasg || '').trim()}`;
    return new Set(Object.values(descartesAta).filter((d) => d.ataKey === ataKey).map((d) => d.contractKey.toUpperCase()));
  }, [descartesAta, numeroAta, uasg]);
  const naoPertencemAAta = useMemo(() => new Set(Object.keys(semAta).map((k) => k.toUpperCase())), [semAta]);

  useEffect(() => {
    if (!isOpen || !initialContract) return;
    setSelectedContract(initialContract);
    setFormError(null);
  }, [isOpen, initialContract]);

  const targetItemKey = itemKey || '';

  // 2. Filtragem dos contratos oficiais disponíveis da UASG
  const filteredContracts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const existingSet = new Set(existingLinkedContractKeys.map(k => k.toUpperCase()));

    const filtered = officialContracts.filter(c => {
      // Modo Item: ignora o contrato já vinculado ao item. Modo Ata: um contrato pode cobrir vários itens,
      // então só some quando já está vinculado a todos os itens da ata.
      const canKey = chaveDoContrato(c).toUpperCase();
      if (!isAtaMode && existingSet.has(canKey) && (!selectedContract || selectedContract.id?.toUpperCase() !== canKey)) {
        return false;
      }
      if (isAtaMode && ataLinkCoverage(canKey, itemOptions!).completo) {
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

    return aplicarRestricoesDeVinculo(rankContractsBySuggestion(filtered, suggestionCriteria), {
      contractKeyOf: chaveDoContrato,
      ataDeOutroVinculo,
      naoPertencemAAta,
      descartadosParaEstaAta
    });
  }, [officialContracts, searchTerm, existingLinkedContractKeys, selectedContract, isAtaMode, suggestionCriteria, ataDeOutroVinculo, naoPertencemAAta, descartadosParaEstaAta]);

  const isPending = linkMutation.isPending || linkItemsMutation.isPending;

  const suggestedCount = filteredContracts.filter((r) => r.reasons.length > 0).length;

  if (!isOpen) return null;

  const contractKeyOf = (c: ContractDashboardRecord) => chaveDoContrato(c);

  const handleClose = () => {
    setSearchTerm('');
    setSelectedContract(null);
    setObservacoes('');
    setFormError(null);
    setCheckedOverrides({});
    onClose();
  };

  // Contrato escolhido já vinculado a outra ata (ex.: veio pronto de uma sugestão): o banco recusaria o vínculo.
  const ataBloqueandoSelecionado = selectedContract ? ataDeOutroVinculo.get(contractKeyOf(selectedContract).toUpperCase()) : undefined;
  const gestorDaAta = ataManagers?.[numeroAta]?.gestorNome;
  const gestorAtualDoContrato = selectedContract ? contractManagers?.[contractKeyOf(selectedContract)]?.gestorNome : undefined;

  const handleSelectContract = (contract: ContractDashboardRecord) => {
    setSelectedContract(contract);
    setCheckedOverrides({});
    setFormError(null);
  };

  const isItemLinked = (i: LinkableAtaItemOption) =>
    Boolean(selectedContract && i.linkedContractKeys?.some((k) => k.toUpperCase() === contractKeyOf(selectedContract).toUpperCase()));

  // Itens do contrato segundo a API oficial (número do item da compra = número do item da ata)
  const apiQuantities = itemQuantities.data;
  const apiListsItems = Boolean(apiQuantities && apiQuantities.size > 0);
  const itemNumber = (i: LinkableAtaItemOption) => parseInt(i.numeroItem, 10);
  const isListedByApi = (i: LinkableAtaItemOption) => apiListsItems && apiQuantities!.has(itemNumber(i));
  const apiQuantityOf = (i: LinkableAtaItemOption) => apiQuantities?.get(itemNumber(i)) ?? null;
  const isSameSupplier = (i: LinkableAtaItemOption) =>
    Boolean(selectedContract) &&
    onlyDigits(i.fornecedorCnpj) !== '' &&
    onlyDigits(i.fornecedorCnpj) === onlyDigits(selectedContract!.fornecedorCnpjCpf);

  // Marcação inicial: os itens que a API lista; sem dados da API, os do mesmo fornecedor
  const isItemChecked = (i: LinkableAtaItemOption) =>
    !isItemLinked(i) && (checkedOverrides[i.itemKey] ?? (apiListsItems ? isListedByApi(i) : isSameSupplier(i)));

  const checkedItems = isAtaMode && !itemQuantities.isLoading ? itemOptions!.filter(isItemChecked) : [];

  // Depois de vincular, lê da API a quantidade contratada (que entra no saldo do item) e os empenhos
  // do contrato, para cada item, sem travar o fechamento do modal.
  const syncEmpenhosInBackground = (
    contract: ContractDashboardRecord,
    targets: Array<{ numeroItem: string; unitPrice?: number }>
  ) => {
    void (async () => {
      let failedQty = 0;
      let failedEmp = 0;
      for (const t of targets) {
        // O preço unitário do próprio contrato (lido junto com a quantidade) é a base certa da estimativa dos empenhos.
        let unitPrice = t.unitPrice;
        try {
          const q = await syncQuantityMutation.mutateAsync({
            numeroAta,
            uasg: cleanUasg,
            numeroItem: t.numeroItem,
            contractKey: contractKeyOf(contract),
            contract
          });
          if (q.valorUnitario) unitPrice = q.valorUnitario;
        } catch (err) {
          failedQty++;
          console.warn('Quantidade contratada não sincronizada para o item', t.numeroItem, err);
        }
        try {
          await syncEmpenhosMutation.mutateAsync({
            numeroAta,
            uasg: cleanUasg,
            numeroItem: t.numeroItem,
            contract: {
              contractKey: contractKeyOf(contract),
              uasg: contract.uasg,
              numero: contract.numero,
              ano: contract.ano,
              contratoId: contract.contratoId
            },
            unitPrice
          });
        } catch (err) {
          failedEmp++;
          console.warn('Empenhos do contrato não sincronizados para o item', t.numeroItem, err);
        }
      }
      if (failedQty > 0) {
        toast.error(`Contrato vinculado, mas a quantidade contratada de ${failedQty} ${failedQty === 1 ? 'item' : 'itens'} não pôde ser lida da API; o saldo só considera o contrato depois disso. Ela é lida de novo ao abrir o item.`);
      } else if (failedEmp > 0) {
        toast.error(`Contrato vinculado, mas os empenhos de ${failedEmp} ${failedEmp === 1 ? 'item' : 'itens'} não puderam ser lidos da API. Tente novamente mais tarde.`);
      }
    })();
  };

  const handleSubmitBatch = async () => {
    if (!selectedContract) return;

    if (checkedItems.length === 0) {
      setFormError('Marque ao menos um item da ata coberto por este contrato.');
      return;
    }

    try {
      await linkItemsMutation.mutateAsync({
        contractKey: contractKeyOf(selectedContract),
        itemKeys: checkedItems.map((i) => i.itemKey),
        observacoes: observacoes.trim() || undefined
      });
      syncEmpenhosInBackground(
        selectedContract,
        checkedItems.map((i) => ({ numeroItem: i.numeroItem, unitPrice: i.valorUnitario }))
      );
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

    const contractKey = contractKeyOf(selectedContract);

    try {
      await linkMutation.mutateAsync({
        itemKey: targetItemKey,
        contractKey,
        observacoes: observacoes.trim() || undefined
      });
      if (numeroItem != null) {
        syncEmpenhosInBackground(selectedContract, [{ numeroItem: String(numeroItem), unitPrice: itemUnitPrice }]);
      }
      handleClose();
    } catch (err: any) {
      setFormError(err?.message || 'Falha ao vincular contrato oficial.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Vincular Contrato"
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
                  <Sparkles size={13} color="var(--color-warning-text)" />
                  {suggestedCount > 0
                    ? `${suggestedCount} ${suggestedCount === 1 ? 'contrato sugerido' : 'contratos sugeridos'} (mesma compra ou mesmo fornecedor da ata) no topo da lista. Confirme antes de vincular.`
                    : 'Nenhum contrato da mesma compra ou dos mesmos fornecedores desta ata foi encontrado.'}
                </p>
              )}

              {/* Lista com scroll dos contratos oficiais */}
              {loadingContracts ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
                  <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem auto', color: 'var(--primary)' }} />
                  Carregando contratos oficiais da UASG...
                </div>
              ) : filteredContracts.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
                  <p style={{ margin: '0 0 0.25rem 0', fontWeight: 600 }}>Nenhum contrato oficial encontrado.</p>
                  <span style={{ fontSize: '0.78rem' }}>Verifique se o contrato já foi sincronizado no módulo Contratos.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '280px', overflowY: 'auto' }} className="link-contract-list">
                  {filteredContracts.map(({ contract: c, reasons, vinculadoAOutraAta, naoPertenceAAta, descartadoParaEstaAta }) => (
                    <div
                      key={contractKeyOf(c)}
                      data-testid="link-contract-option"
                      aria-disabled={vinculadoAOutraAta ? true : undefined}
                      title={vinculadoAOutraAta ? `Este contrato já está vinculado à ata ${vinculadoAOutraAta}. Um contrato pertence a uma só ata.` : undefined}
                      onClick={() => {
                        if (!vinculadoAOutraAta) handleSelectContract(c);
                      }}
                      style={{
                        padding: '0.75rem 1rem',
                        background: vinculadoAOutraAta ? '#f8fafc' : '#ffffff',
                        border: reasons.length > 0 ? '1px solid var(--color-warning-border)' : '1px solid #e2e8f0',
                        borderRadius: '8px',
                        cursor: vinculadoAOutraAta ? 'not-allowed' : 'pointer',
                        opacity: vinculadoAOutraAta ? 0.6 : 1,
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.75rem'
                      }}
                      onMouseEnter={(e) => {
                        if (vinculadoAOutraAta) return;
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        e.currentTarget.style.backgroundColor = '#f8fafc';
                      }}
                      onMouseLeave={(e) => {
                        if (vinculadoAOutraAta) return;
                        e.currentTarget.style.borderColor = reasons.length > 0 ? 'var(--color-warning-border)' : '#e2e8f0';
                        e.currentTarget.style.backgroundColor = '#ffffff';
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.2rem' }}>
                          <strong style={{ fontSize: '0.92rem', color: 'var(--primary)' }}>
                            {displayContractNumber(c) || `Contrato ${c.numero}/${c.ano}`}
                          </strong>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success-text)', border: '1px solid var(--color-success-border)' }}>
                            {formatStatusVigencia(c.statusVigencia)}
                          </span>
                          {isAtaMode && (() => {
                            const cov = ataLinkCoverage(contractKeyOf(c), itemOptions!);
                            return cov.vinculados > 0 ? (
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>
                                Vinculado a {cov.vinculados} de {cov.total} itens
                              </span>
                            ) : null;
                          })()}
                          {vinculadoAOutraAta && (
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>
                              Vinculado à ata {vinculadoAOutraAta}
                            </span>
                          )}
                          {descartadoParaEstaAta && (
                            <span
                              title="O coordenador descartou esta ata para o contrato na Central de Distribuição. Se vincular, o descarte é desfeito."
                              style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}
                            >
                              Descartado para esta ata
                            </span>
                          )}
                          {naoPertenceAAta && (
                            <span
                              title="O coordenador marcou que este contrato não pertence a ata. Se vincular, a marcação é desfeita."
                              style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}
                            >
                              Não pertence a ata
                            </span>
                          )}
                          {reasons.map((r) => (
                            <span
                              key={r}
                              style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', border: '1px solid var(--color-warning-border)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
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
                          <div style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '0.15rem' }}>
                            {c.objeto}
                          </div>
                        )}
                      </div>

                      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Valor Global</span>
                        <strong style={{ fontSize: '0.88rem', color: 'var(--primary)' }}>
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
              <div style={{ background: '#f8fafc', border: '1.5px solid var(--color-info-border)', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-info-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Contrato Oficial Selecionado
                    </span>
                    <h4 style={{ margin: '0.15rem 0 0 0', fontSize: '1.05rem', fontWeight: 800, color: 'var(--primary)' }}>
                      {displayContractNumber(selectedContract) || `Contrato ${selectedContract.numero}/${selectedContract.ano}`}
                    </h4>
                  </div>
                  <AppButton type="button" variant="outline" size="xs" onClick={() => setSelectedContract(null)}>
                    Trocar contrato
                  </AppButton>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '0.5rem', fontSize: '0.78rem', color: '#475569' }}>
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

              {/* Regra de vínculo: contrato de outra ata é recusado; vincular leva o gestor da ata para o contrato */}
              {ataBloqueandoSelecionado ? (
                <div style={{ marginBottom: '1rem' }} data-testid="link-contract-outra-ata">
                  <AlertCard
                    severity="CRITICA"
                    title={`Este contrato já está vinculado à ata ${ataBloqueandoSelecionado}. Um contrato pertence a uma só ata; desvincule lá antes, se for o caso.`}
                  />
                </div>
              ) : (
                <p
                  data-testid="link-contract-heranca"
                  style={{ margin: '0 0 1rem 0', fontSize: '0.8rem', color: 'var(--color-info-text-strong)', background: 'var(--color-info-bg)', border: '1px solid var(--color-info-border)', borderRadius: '6px', padding: '0.5rem 0.65rem' }}
                >
                  {gestorDaAta ? (
                    <>
                      Ao vincular, este contrato passa a ser gerido por <strong>{gestorDaAta}</strong>, gestor da ata.
                      {gestorAtualDoContrato && gestorAtualDoContrato !== gestorDaAta && (
                        <> Hoje ele está com <strong>{gestorAtualDoContrato}</strong>; o coordenador será avisado da mudança.</>
                      )}
                    </>
                  ) : gestorAtualDoContrato ? (
                    <>
                      A ata ainda não tem gestor: ao vincular, ela passa a ser de <strong>{gestorAtualDoContrato}</strong>, gestor deste contrato,
                      e os outros contratos da ata acompanham. O coordenador será avisado.
                    </>
                  ) : (
                    <>A ata e o contrato ainda não têm gestor: eles recebem o gestor quando o coordenador atribuir a ata.</>
                  )}
                </p>
              )}

              {/* Item fixo (modo Item) */}
              {!isAtaMode && (
                <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.8rem', color: '#475569' }}>
                  Este contrato será vinculado ao <strong>item {numeroItem}</strong> da ata {numeroAta}. A quantidade contratada é lida da API oficial.
                </p>
              )}

              {/* Itens da Ata cobertos pelo contrato (modo Ata) */}
              {isAtaMode && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.35rem' }}>
                    Itens cobertos por este contrato <span style={{ color: 'var(--color-danger)' }}>*</span>
                  </div>
                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.76rem', color: '#64748b' }}>
                    {itemQuantities.isLoading
                      ? 'Consultando os itens deste contrato na API oficial...'
                      : apiListsItems
                        ? 'Os itens que a API oficial lista neste contrato já vêm marcados. A quantidade contratada é lida da API.'
                        : 'A API oficial não retornou os itens deste contrato. Marque os itens que ele atende; a quantidade será lida da API quando estiver disponível.'}
                  </p>
                  {itemQuantities.isLoading ? (
                    <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b' }}>
                      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '260px', overflowY: 'auto' }} className="link-contract-list">
                      {itemOptions!.map((i) => {
                        const linked = isItemLinked(i);
                        const checked = isItemChecked(i);
                        const listed = isListedByApi(i);
                        const apiQty = apiQuantityOf(i);
                        return (
                          <div
                            key={i.itemKey}
                            data-testid="link-contract-item-row"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.65rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: linked ? '#f8fafc' : '#ffffff', opacity: linked ? 0.7 : 1 }}
                          >
                            <input
                              type="checkbox"
                              aria-label={`Item ${i.numeroItem}`}
                              checked={checked}
                              disabled={linked}
                              onChange={(e) => setCheckedOverrides((prev) => ({ ...prev, [i.itemKey]: e.target.checked }))}
                            />
                            <div style={{ flex: 1, minWidth: 0, fontSize: '0.8rem' }}>
                              <div style={{ fontWeight: 700, color: 'var(--primary)' }}>
                                Item {i.numeroItem}
                                {isSameSupplier(i) && <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', color: 'var(--color-warning-text)' }}>mesmo fornecedor</span>}
                                {linked && <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', color: '#64748b' }}>já vinculado</span>}
                              </div>
                              <div style={{ color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {i.descricao || 'Sem descrição'}
                                {i.fornecedorNome ? ` (${i.fornecedorNome})` : ''}
                              </div>
                              {!linked && checked && apiListsItems && !listed && (
                                <div style={{ color: 'var(--color-warning-text)', fontSize: '0.75rem' }}>A API oficial não lista este item neste contrato.</div>
                              )}
                            </div>
                            <div style={{ textAlign: 'right', whiteSpace: 'nowrap', fontSize: '0.78rem', color: '#64748b' }}>
                              Qtd contratada
                              <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 700, color: listed && apiQty != null ? 'var(--primary)' : '#94a3b8' }}>
                                {listed && apiQty != null ? apiQty.toLocaleString('pt-BR') : 'N/D'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
              <div className="link-contract-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <ActionButton action="cancelar" type="button" onClick={handleClose} disabled={isPending} />
                <ActionButton action="vincular"
                  type="submit"
                  disabled={isPending || Boolean(ataBloqueandoSelecionado) || (isAtaMode && checkedItems.length === 0)}
                  isLoading={isPending}
                >
                  {isAtaMode && checkedItems.length > 1 ? `Vincular a ${checkedItems.length} itens` : 'Vincular Contrato'}
                </ActionButton>
              </div>
            </form>
          )}
        </div>
    </Modal>
  );
};
