import React, { useState } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink, 
  Building2, 
  Calendar, 
  FileText, 
  Package, 
  Receipt,
  Loader2
} from 'lucide-react';
import type { ContractDashboardRecord } from '../../types';
import { useContractDetails } from '../../hooks/useContractDetails';

interface ContractCardProps {
  contract: ContractDashboardRecord;
}

function formatCnpjDisplay(cnpj?: string): string {
  if (!cnpj) return '';
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  } else if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return cnpj;
}

function formatDateBR(dateStr?: string): string {
  if (!dateStr) return 'Não informada';
  const clean = dateStr.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const ContractCard: React.FC<ContractCardProps> = ({ contract }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'itens' | 'empenhos'>('itens');

  const {
    data: details,
    isLoading: isLoadingDetails
  } = useContractDetails(contract, isExpanded);

  const items = details?.items || [];
  const empenhos = details?.empenhos || [];

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const formattedCnpj = formatCnpjDisplay(contract.fornecedorCnpjCpf);
  const displayNum = contract.numeroFormatado ? `CONTRATO ${contract.numeroFormatado}` : `CONTRATO ${contract.numero}/${contract.ano}`;

  // Link do PNCP se disponível
  const pncpUrl = contract.linkPncp || (contract.numeroControlePncp 
    ? `https://pncp.gov.br/app/contratos/${contract.numeroControlePncp}` 
    : undefined);

  return (
    <article className="ata-card" style={{ marginBottom: '1.25rem', transition: 'box-shadow 0.2s ease', border: '1px solid #e2e8f0' }}>
      {/* Header do Card */}
      <header className="ata-card-header" style={{ padding: '1rem 1.25rem' }}>
        <div className="ata-card-header-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <h3 className="ata-card-number" style={{ fontSize: '1.15rem', color: '#0f172a', fontWeight: 700 }}>
              {displayNum}
            </h3>

            {/* Badge de Status de Vigência */}
            {contract.statusVigencia === 'Expirado' ? (
              <span 
                className="badge danger" 
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#dc2626' }}
              >
                <AlertTriangle size={12} /> EXPIRADO
              </span>
            ) : contract.statusVigencia === 'A Vencer (60d)' ? (
              <span 
                className="badge warning" 
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#d97706' }}
              >
                <Clock size={12} /> VENCE EM &lt; 60 DIAS
              </span>
            ) : contract.statusVigencia === 'Vigente' ? (
              <span 
                className="badge success" 
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#059669' }}
              >
                <CheckCircle2 size={12} /> VIGENTE
              </span>
            ) : (
              <span 
                className="badge" 
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, backgroundColor: '#f1f5f9', color: '#64748b' }}
              >
                VIGÊNCIA NÃO INFORMADA
              </span>
            )}

            {/* Badge da Fonte */}
            <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', backgroundColor: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', fontWeight: 500 }}>
              {contract.fonteDados}
            </span>
          </div>

          {/* Linha de Fornecedor */}
          <p className="ata-card-supplier" style={{ marginTop: '0.4rem', color: '#334155' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Building2 size={14} style={{ color: '#003399' }} />
              Fornecedor: <strong style={{ color: '#0f172a' }}>{contract.fornecedorNome || 'Não informado'}</strong>
            </span>
            {formattedCnpj && (
              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500, marginLeft: '0.5rem' }}>
                • CNPJ/CPF: {formattedCnpj}
              </span>
            )}
          </p>
        </div>

        {/* Lado Direito do Header (Valor e Ações) */}
        <div className="ata-card-header-right" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: 500 }}>Valor Global</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#003399', letterSpacing: '-0.02em' }}>
              {formatCurrency(contract.valorGlobal || contract.valorInicial)}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {pncpUrl && (
              <a 
                href={pncpUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="btn btn-secondary"
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                title="Abrir no Portal Nacional de Contratações Públicas (PNCP)"
              >
                <span>PNCP</span>
                <ExternalLink size={12} />
              </a>
            )}

            <button
              onClick={handleToggleExpand}
              className="btn btn-secondary"
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              aria-expanded={isExpanded}
            >
              <span>{isExpanded ? 'Recolher' : 'Detalhes'}</span>
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>
      </header>

      {/* Dados Rápidos (Vigência, Processo, UASG) */}
      <div style={{ padding: '0.75rem 1.25rem', backgroundColor: '#f8fafc', borderTop: '1px solid #edf2f7', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', fontSize: '0.82rem', color: '#475569' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Calendar size={14} style={{ color: '#003399' }} />
          <span>
            Vigência: <strong style={{ color: '#1e293b' }}>{formatDateBR(contract.dataVigenciaInicio)}</strong> até <strong style={{ color: '#1e293b' }}>{formatDateBR(contract.dataVigenciaFim)}</strong>
          </span>
        </div>

        {contract.processo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <FileText size={14} style={{ color: '#003399' }} />
            <span>Processo: <strong style={{ color: '#1e293b' }}>{contract.processo}</strong></span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span>UASG: <strong style={{ color: '#1e293b' }}>{contract.uasg}</strong> {contract.nomeUnidadeGestora ? `(${contract.nomeUnidadeGestora})` : ''}</span>
        </div>
      </div>

      {/* Objeto do Contrato */}
      {contract.objeto && (
        <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid #edf2f7', fontSize: '0.84rem', color: '#334155', lineHeight: '1.45' }}>
          <span style={{ fontWeight: 600, color: '#1e293b', marginRight: '0.4rem' }}>Objeto:</span>
          <span>{contract.objeto}</span>
        </div>
      )}

      {/* Painel Expansível (Itens e Empenhos) */}
      {isExpanded && (
        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
          {isLoadingDetails ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', gap: '0.75rem', color: '#003399' }}>
              <Loader2 className="animate-spin" size={20} />
              <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>Carregando itens e empenhos vinculados...</span>
            </div>
          ) : (
            <div>
              {/* Abas Itens / Empenhos */}
              <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #e2e8f0', marginBottom: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('itens')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '0.5rem 1rem',
                    border: 'none',
                    background: 'none',
                    borderBottom: activeTab === 'itens' ? '2px solid #003399' : '2px solid transparent',
                    color: activeTab === 'itens' ? '#003399' : '#64748b',
                    fontWeight: activeTab === 'itens' ? 700 : 500,
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  <Package size={15} />
                  <span>Itens do Contrato ({items.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('empenhos')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '0.5rem 1rem',
                    border: 'none',
                    background: 'none',
                    borderBottom: activeTab === 'empenhos' ? '2px solid #003399' : '2px solid transparent',
                    color: activeTab === 'empenhos' ? '#003399' : '#64748b',
                    fontWeight: activeTab === 'empenhos' ? 700 : 500,
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  <Receipt size={15} />
                  <span>Empenhos ({empenhos.length})</span>
                </button>
              </div>

              {/* Conteúdo da Aba Itens */}
              {activeTab === 'itens' && (
                <div>
                  {items.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic', padding: '0.5rem 0' }}>
                      Nenhum item detalhado foi retornado pela API para este contrato.
                    </p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                            <th style={{ padding: '0.5rem 0.75rem', width: '50px' }}>Item</th>
                            <th style={{ padding: '0.5rem 0.75rem' }}>Descrição</th>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Qtd. Contratada</th>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Valor Unit.</th>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Valor Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it, idx) => {
                            const numItem = it.numero_item || it.numeroItem || it.codigoItem || (idx + 1);
                            const desc = it.descricao || it.descricaoIitem || it.material_ou_servico_nome || 'Item sem descrição';
                            const qtd = it.quantidade || it.quantidadeItem || 0;
                            const vUnit = it.valor_unitario || it.valorUnitarioItem || 0;
                            const vTotal = it.valor_total || it.valorTotalItem || (qtd * vUnit);

                            return (
                              <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{numItem}</td>
                                <td style={{ padding: '0.5rem 0.75rem', color: '#334155' }}>{desc}</td>
                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 500 }}>
                                  {qtd ? qtd.toLocaleString('pt-BR') : '-'}
                                </td>
                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                                  {vUnit ? formatCurrency(vUnit) : '-'}
                                </td>
                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#003399' }}>
                                  {vTotal ? formatCurrency(vTotal) : '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Conteúdo da Aba Empenhos */}
              {activeTab === 'empenhos' && (
                <div>
                  {empenhos.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic', padding: '0.5rem 0' }}>
                      Nenhum empenho foi retornado pela API para este contrato.
                    </p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                            <th style={{ padding: '0.5rem 0.75rem' }}>Número Empenho</th>
                            <th style={{ padding: '0.5rem 0.75rem' }}>Emissão</th>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>A Liquidar</th>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Liquidado</th>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Pago</th>
                          </tr>
                        </thead>
                        <tbody>
                          {empenhos.map((emp, idx) => {
                            const vAliq = parseFloat(String(emp.aliquidar || '0').replace(',', '.'));
                            const vLiq = parseFloat(String(emp.liquidado || '0').replace(',', '.'));
                            const vPago = parseFloat(String(emp.pago || '0').replace(',', '.'));

                            return (
                              <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: '#0f172a' }}>
                                  {emp.numero || '-'}
                                </td>
                                <td style={{ padding: '0.5rem 0.75rem', color: '#475569' }}>
                                  {formatDateBR(emp.data_emissao)}
                                </td>
                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                                  {formatCurrency(vAliq)}
                                </td>
                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                                  {formatCurrency(vLiq)}
                                </td>
                                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#059669', fontWeight: 500 }}>
                                  {formatCurrency(vPago)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
};
