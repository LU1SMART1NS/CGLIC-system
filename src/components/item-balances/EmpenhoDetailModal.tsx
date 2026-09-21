import React from 'react';
import { X, ArrowRightLeft, Building2, ExternalLink, DollarSign } from 'lucide-react';
import { formatNumber, formatCurrency, formatDate, getContractPncpUrl } from './itemBalanceUtils';
import type { EmpenhoSaldoItemRecord, PncpContract, PncpContractEmpenho } from '../../types';

export interface EmpenhoDetailModalProps {
  selectedEmpenhoDetail: EmpenhoSaldoItemRecord | null;
  onClose: () => void;
  arpNumeroAta: string;
  itemNumeroItem: string;
  contractsLoading: boolean;
  filteredContracts: PncpContract[];
  contractEmpenhos: Record<string, PncpContractEmpenho[]>;
  empenhosLoadingMap: Record<string, boolean>;
}

export const EmpenhoDetailModal: React.FC<EmpenhoDetailModalProps> = ({
  selectedEmpenhoDetail,
  onClose,
  arpNumeroAta,
  itemNumeroItem,
  contractsLoading,
  filteredContracts,
  contractEmpenhos,
  empenhosLoadingMap
}) => {
  if (!selectedEmpenhoDetail) return null;

  const beneficiariaUasg = selectedEmpenhoDetail.unidade.match(/^(\d+)/)?.[1] || '';
  const unidadeNome = selectedEmpenhoDetail.unidade.replace(/^\d+\s*-\s*/, '');

  return (
    <div className="modal-backdrop" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div className="glass-card" style={{
        width: '90%',
        maxWidth: '800px',
        maxHeight: '90vh',
        overflowY: 'auto',
        background: '#ffffff',
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        position: 'relative'
      }}>
        {/* Close Button */}
        <button 
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)'
          }}
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span className="badge badge-info" style={{ textTransform: 'uppercase', fontSize: '0.65rem' }}>
              {selectedEmpenhoDetail.tipo}
            </span>
            {beneficiariaUasg && (
              <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>
                UASG Beneficiária: {beneficiariaUasg}
              </span>
            )}
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            {unidadeNome}
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.25rem 0 0 0' }}>
            Ata n.º {arpNumeroAta} | Item {itemNumeroItem}
          </p>
        </div>

        {/* Section 1: Balanço de Saldos do SIASG */}
        <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <ArrowRightLeft size={14} color="var(--primary)" /> Balanço de Saldos (SIASG)
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>QUANTIDADE REGISTRADA</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                {formatNumber(selectedEmpenhoDetail.quantidadeRegistrada)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>QUANTIDADE EMPENHADA</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--warning)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                {formatNumber(selectedEmpenhoDetail.quantidadeEmpenhada)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>SALDO P/ EMPENHAR</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: selectedEmpenhoDetail.saldoEmpenho < 0 ? 'var(--danger)' : 'var(--success)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                {formatNumber(selectedEmpenhoDetail.saldoEmpenho)}
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Contratos & Empenhos Vinculados (PNCP) */}
        <div>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Building2 size={14} color="var(--primary)" /> Contratos & Empenhos Publicados no PNCP
          </h4>
          
          {contractsLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1.5rem', justifyContent: 'center' }}>
              <div className="spinner" style={{ width: '16px', height: '16px' }}></div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Buscando dados no PNCP...</span>
            </div>
          ) : filteredContracts.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', background: '#f8fafc', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
              Nenhum contrato cadastrado no PNCP para esta UASG nesta Ata.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {filteredContracts.map((c, cidx) => {
                const contractUrl = getContractPncpUrl(c);
                const emps = contractEmpenhos[c.numeroContrato] || [];
                const isLoadingEmps = empenhosLoadingMap[c.numeroContrato];
                
                return (
                  <div key={`${c.numeroContrato}-${cidx}`} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                    {/* Contract Header Row */}
                    <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Contrato {c.numeroContrato}
                        </span>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          CNPJ Contratado: {c.niFornecedor?.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") || '-'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Vigência: {formatDate(c.dataVigenciaInicial)} a {formatDate(c.dataVigenciaFinal)}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--success)' }}>
                          {formatCurrency(c.valorInicial || 0)}
                        </span>
                        {contractUrl && (
                          <a href={contractUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.72rem', color: 'var(--primary)', textDecoration: 'underline' }}>
                            PNCP <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Contract Object */}
                    <div style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--text-secondary)', borderBottom: '1px solid #f1f5f9', background: '#ffffff', textAlign: 'justify', lineHeight: '1.4' }}>
                      <strong>Objeto:</strong> {c.objeto}
                    </div>

                    {/* Contract Empenhos */}
                    <div style={{ padding: '0.75rem 1rem', background: '#ffffff' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <DollarSign size={11} /> Empenhos deste Contrato
                      </div>
                      
                      {isLoadingEmps ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-secondary)', padding: '0.25rem 0' }}>
                          <div className="spinner" style={{ width: '12px', height: '12px' }}></div>
                          <span>Carregando empenhos...</span>
                        </div>
                      ) : emps.length === 0 ? (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '0.25rem 0' }}>
                          Nenhum empenho publicado para este contrato no PNCP.
                        </div>
                      ) : (
                        <table style={{ width: '100%', fontSize: '0.72rem', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                              <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>N.º Empenho</th>
                              <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Data Emissão</th>
                              <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 600 }}>Valor do Empenho</th>
                            </tr>
                          </thead>
                          <tbody>
                            {emps.map((empItem, eidx) => (
                              <tr key={`${empItem.numeroEmpenho}-${eidx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '4px 6px', fontWeight: 600 }}>{empItem.numeroEmpenho}</td>
                                <td style={{ padding: '4px 6px', color: 'var(--text-muted)' }}>{formatDate(empItem.dataEmissaoEmpenho)}</td>
                                <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700, color: 'var(--success)', fontFamily: 'monospace' }}>
                                  {formatCurrency(empItem.valorTotal)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
          <button 
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '0.5rem 1rem' }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
