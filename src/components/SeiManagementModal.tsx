import React, { useState } from 'react';
import { FileText, Plus, Trash2, AlertCircle, X, RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import { useProcessosSei } from '../hooks/useProcessosSei';
import { useSaveProcessoSei } from '../hooks/useSaveProcessoSei';
import { useDeleteProcessoSei } from '../hooks/useDeleteProcessoSei';
import type { ProcessoSei } from '../types';

interface SeiManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSei?: (processo: ProcessoSei) => void;
}

export const SeiManagementModal: React.FC<SeiManagementModalProps> = ({ isOpen, onClose, onSelectSei }) => {
  const { data: processos = [], isLoading: loading } = useProcessosSei();
  const saveMutation = useSaveProcessoSei();
  const deleteMutation = useDeleteProcessoSei();

  const [isAdding, setIsAdding] = useState<boolean>(false);

  // Form State
  const [numeroSei, setNumeroSei] = useState<string>('');
  const [objeto, setObjeto] = useState<string>('');
  const [unidade, setUnidade] = useState<string>('');
  const [responsavel, setResponsavel] = useState<string>('');
  const [status, setStatus] = useState<'Em Instrução' | 'Aprovado' | 'Empenhado' | 'Concluído'>('Em Instrução');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isSubmitting = saveMutation.isPending || deleteMutation.isPending;

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanNumero = numeroSei.trim();
    if (!cleanNumero) {
      setErrorMsg('O Número do Processo SEI é obrigatório.');
      return;
    }

    try {
      await saveMutation.mutateAsync({
        numeroProcessoSei: cleanNumero,
        descricaoObjeto: objeto.trim() || undefined,
        unidadeRequisitante: unidade.trim() || undefined,
        responsavelNome: responsavel.trim() || undefined,
        statusProcesso: status
      });

      setNumeroSei('');
      setObjeto('');
      setUnidade('');
      setResponsavel('');
      setStatus('Em Instrução');
      setIsAdding(false);
      setSuccessMsg(`Processo SEI "${cleanNumero}" cadastrado com sucesso!`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao salvar processo SEI.');
    }
  };

  const handleDelete = async (id: string, numero: string) => {
    if (window.confirm(`Deseja realmente excluir o Processo SEI ${numero}?`)) {
      setErrorMsg(null);
      setSuccessMsg(null);
      try {
        await deleteMutation.mutateAsync(id);
        setSuccessMsg(`Processo SEI "${numero}" excluído com sucesso.`);
      } catch (err: any) {
        setErrorMsg(err.message || 'Falha ao excluir processo SEI.');
      }
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(2px)'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        width: '90%',
        maxWidth: '850px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        overflow: 'hidden',
        fontFamily: 'var(--font-family, sans-serif)'
      }}>
        {/* Header */}
        <div style={{
          backgroundColor: '#0c326f',
          color: '#ffffff',
          padding: '1rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <FileText size={22} color="#00cc55" />
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'white' }}>
              Gestão de Processos SEI Internos
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
          {errorMsg && (
            <div style={{
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              padding: '0.75rem',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <AlertCircle size={16} />
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div style={{
              backgroundColor: 'var(--success-bg, #dcfce7)',
              color: 'var(--success-text, #15803d)',
              padding: '0.75rem',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <CheckCircle2 size={16} />
              {successMsg}
            </div>
          )}

          {/* Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569' }}>
              Cadastre e gerencie os números de Processos SEI para vincular com Atas de Registro de Preço e Empenhos.
            </p>
            <button
              onClick={() => setIsAdding(!isAdding)}
              disabled={isSubmitting}
              style={{
                backgroundColor: isAdding ? '#64748b' : '#1351b4',
                color: '#ffffff',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              {isAdding ? 'Cancelar' : <><Plus size={16} /> Novo Processo SEI</>}
            </button>
          </div>

          {/* New SEI Form */}
          {isAdding && (
            <form onSubmit={handleSubmit} style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              padding: '1.25rem',
              marginBottom: '1.5rem'
            }}>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: '#0f172a' }}>Novo Processo SEI</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                    Número do Processo SEI *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 10154.000123/2024-11"
                    value={numeroSei}
                    onChange={(e) => setNumeroSei(e.target.value)}
                    disabled={isSubmitting}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #94a3b8',
                      borderRadius: '4px',
                      fontSize: '0.9rem'
                    }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                    Status do Processo
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    disabled={isSubmitting}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #94a3b8',
                      borderRadius: '4px',
                      fontSize: '0.9rem',
                      backgroundColor: '#ffffff'
                    }}
                  >
                    <option value="Em Instrução">Em Instrução</option>
                    <option value="Aprovado">Aprovado</option>
                    <option value="Empenhado">Empenhado</option>
                    <option value="Concluído">Concluído</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                    Unidade Requisitante / Órgão
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: SENASP / CGOE"
                    value={unidade}
                    onChange={(e) => setUnidade(e.target.value)}
                    disabled={isSubmitting}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #94a3b8',
                      borderRadius: '4px',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                    Servidor Responsável
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Cap. Oliveira"
                    value={responsavel}
                    onChange={(e) => setResponsavel(e.target.value)}
                    disabled={isSubmitting}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #94a3b8',
                      borderRadius: '4px',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                  Descrição / Objeto da Instrução
                </label>
                <textarea
                  rows={2}
                  placeholder="Descreva a finalidade ou itens vinculados a esta instrução SEI..."
                  value={objeto}
                  onChange={(e) => setObjeto(e.target.value)}
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #94a3b8',
                    borderRadius: '4px',
                    fontSize: '0.9rem',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  disabled={isSubmitting}
                  style={{
                    backgroundColor: '#e2e8f0',
                    color: '#334155',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    backgroundColor: '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '4px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  Salvar Processo SEI
                </button>
              </div>
            </form>
          )}

          {/* Process List */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
              <RefreshCw className="animate-spin" size={24} style={{ marginBottom: '0.5rem' }} />
              <p>Carregando processos SEI...</p>
            </div>
          ) : processos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
              <FileText size={32} color="#94a3b8" style={{ marginBottom: '0.5rem' }} />
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>Nenhum processo SEI cadastrado até o momento.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {processos.map((p) => (
                <div
                  key={p.id}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '1rem',
                    backgroundColor: '#ffffff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                      <span style={{
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        fontSize: '1rem',
                        color: '#0f172a',
                        backgroundColor: '#f1f5f9',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px'
                      }}>
                        {p.numeroProcessoSei}
                      </span>

                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        padding: '0.2rem 0.6rem',
                        borderRadius: '12px',
                        backgroundColor: p.statusProcesso === 'Empenhado' ? '#dcfce7' : p.statusProcesso === 'Aprovado' ? '#e0f2fe' : '#fef3c7',
                        color: p.statusProcesso === 'Empenhado' ? '#15803d' : p.statusProcesso === 'Aprovado' ? '#0369a1' : '#b45309'
                      }}>
                        {p.statusProcesso}
                      </span>
                    </div>

                    {p.descricaoObjeto && (
                      <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: '#334155' }}>
                        {p.descricaoObjeto}
                      </p>
                    )}

                    <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.78rem', color: '#64748b', marginTop: '0.35rem' }}>
                      {p.unidadeRequisitante && <span><strong>Unidade:</strong> {p.unidadeRequisitante}</span>}
                      {p.responsavelNome && <span><strong>Responsável:</strong> {p.responsavelNome}</span>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '1rem' }}>
                    {onSelectSei && (
                      <button
                        onClick={() => {
                          onSelectSei(p);
                          onClose();
                        }}
                        style={{
                          backgroundColor: '#0284c7',
                          color: '#ffffff',
                          border: 'none',
                          padding: '0.4rem 0.75rem',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Selecionar
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(p.id, p.numeroProcessoSei)}
                      disabled={isSubmitting}
                      style={{
                        backgroundColor: '#fff1f2',
                        color: '#e11d48',
                        border: '1px solid #fecdd3',
                        padding: '0.4rem 0.6rem',
                        borderRadius: '4px',
                        cursor: isSubmitting ? 'not-allowed' : 'pointer'
                      }}
                      title="Excluir Processo SEI"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          backgroundColor: '#f8fafc',
          padding: '0.75rem 1.5rem',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              backgroundColor: '#64748b',
              color: '#ffffff',
              border: 'none',
              padding: '0.5rem 1.25rem',
              borderRadius: '4px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
