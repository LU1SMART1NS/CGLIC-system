import React, { useState, useEffect } from 'react';
import { Check, FileText, Building2, RotateCcw, Download, Sliders, Sparkles, ShoppingBag } from 'lucide-react';
import type { ArpRecord, ArpItemRecord } from '../../types';
import { Modal, ActionButton, AppButton, useToast } from '../../design-system';
import type { 
  ReportExportConfig, 
  ReportPreset, 
  ReportGranularity, 
  ReportScope, 
  ColumnGroup 
} from '../../types/reportTypes';
import { 
  ALL_REPORT_COLUMNS, 
  COLUMN_GROUPS, 
  getDefaultColumnsForPreset, 
  generateCustomExcelReport, 
  downloadExcelFile 
} from '../../services/excelExportService';

interface ExportExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  atas: ArpRecord[];
  itemsByAta?: Record<string, ArpItemRecord[]>;
  selectedAta?: ArpRecord | null;
  activeFiltersDesc?: string;
  defaultGranularity?: ReportGranularity;
}

const STORAGE_PREF_KEY = 'saldoarp-report-preferences-v1';

export const ExportExcelModal: React.FC<ExportExcelModalProps> = ({
  isOpen,
  onClose,
  atas,
  itemsByAta = {},
  selectedAta,
  activeFiltersDesc,
  defaultGranularity = 'BY_ITEM'
}) => {
  const toast = useToast();
  const [preset, setPreset] = useState<ReportPreset>('BALANCES');
  const [granularity, setGranularity] = useState<ReportGranularity>(defaultGranularity);
  const [scope, setScope] = useState<ReportScope>(selectedAta ? 'SELECTED_ATA' : 'CURRENT_FILTERED');
  const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>([]);
  const [includeHeaderMetadata, setIncludeHeaderMetadata] = useState<boolean>(true);
  const [includeTotalsSummary, setIncludeTotalsSummary] = useState<boolean>(true);
  const [activeGroupFilter, setActiveGroupFilter] = useState<ColumnGroup | 'all'>('all');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Inicializa configuração ao abrir
  useEffect(() => {
    if (isOpen) {
      setSuccessMsg(null);
      // Tenta ler preferências salvas se preset for CUSTOM
      try {
        const saved = localStorage.getItem(STORAGE_PREF_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.preset) setPreset(parsed.preset);
          if (parsed.granularity) setGranularity(parsed.granularity);
          if (parsed.selectedColumnIds && Array.isArray(parsed.selectedColumnIds)) {
            setSelectedColumnIds(parsed.selectedColumnIds);
            return;
          }
        }
      } catch {}

      // Padrão inicial
      const defaultCols = getDefaultColumnsForPreset('BALANCES');
      setSelectedColumnIds(defaultCols);
    }
  }, [isOpen]);

  // Atualiza colunas quando o preset muda (exceto se for CUSTOM)
  const handlePresetChange = (newPreset: ReportPreset) => {
    setPreset(newPreset);
    if (newPreset !== 'CUSTOM') {
      const cols = getDefaultColumnsForPreset(newPreset);
      setSelectedColumnIds(cols);
      
      // Ajusta granularidade sugerida
      if (newPreset === 'EXECUTIVE') setGranularity('BY_ATA');
      else if (newPreset === 'ALLOCATIONS') setGranularity('BY_ALLOCATION');
      else setGranularity('BY_ITEM');
    }
  };

  const handleToggleColumn = (colId: string) => {
    setPreset('CUSTOM');
    setSelectedColumnIds(prev => {
      const next = prev.includes(colId) 
        ? prev.filter(id => id !== colId) 
        : [...prev, colId];
      savePreferences(next, 'CUSTOM', granularity);
      return next;
    });
  };

  const handleSelectAll = () => {
    setPreset('CUSTOM');
    const allIds = ALL_REPORT_COLUMNS.map(c => c.id);
    setSelectedColumnIds(allIds);
    savePreferences(allIds, 'CUSTOM', granularity);
  };

  const handleClearAll = () => {
    setPreset('CUSTOM');
    setSelectedColumnIds([]);
    savePreferences([], 'CUSTOM', granularity);
  };

  const handleResetDefaults = () => {
    handlePresetChange('BALANCES');
  };

  const savePreferences = (cols: string[], pres: ReportPreset, gran: ReportGranularity) => {
    try {
      localStorage.setItem(STORAGE_PREF_KEY, JSON.stringify({
        selectedColumnIds: cols,
        preset: pres,
        granularity: gran
      }));
    } catch {}
  };

  const handleGenerateReport = () => {
    if (selectedColumnIds.length === 0 && granularity !== 'MULTI_SHEET') {
      toast.error('Selecione pelo menos 1 coluna para gerar o relatório.');
      return;
    }

    setIsExporting(true);
    setSuccessMsg(null);

    // Permite que o navegador renderize o spinner antes de iniciar a compilação do Excel
    setTimeout(async () => {
      try {
        const exportConfig: ReportExportConfig = {
          scope,
          granularity,
          preset,
          selectedColumnIds,
          includeHeaderMetadata,
          includeTotalsSummary
        };

        const payload = {
          atas,
          itemsByAta,
          selectedAta: scope === 'SELECTED_ATA' ? selectedAta : null,
          activeFiltersDesc
        };

        const blob = await generateCustomExcelReport(exportConfig, payload);
        
        const dateStr = new Date().toISOString().split('T')[0];
        const presetSuffix = 
          granularity === 'MULTI_SHEET' ? 'Consolidado_MultiAbas' :
          preset === 'EXECUTIVE' ? 'Resumo_Executivo' :
          preset === 'BALANCES' ? 'Balanco_Saldos' :
          preset === 'ALLOCATIONS' ? 'Alocacoes_Setoriais' :
          preset === 'PURCHASES' ? 'Catalogo_Compras' : 'Personalizado';

        const filename = `CGLIC_${presetSuffix}_${dateStr}`;
        downloadExcelFile(blob, filename);

        setSuccessMsg('Planilha Excel gerada e transferida com sucesso!');
        setIsExporting(false);
      } catch (err: any) {
        console.error('Erro ao gerar relatório Excel:', err);
        toast.error('Ocorreu um erro ao compilar a planilha Excel: ' + (err.message || err));
        setIsExporting(false);
      }
    }, 50);
  };

  if (!isOpen) return null;

  const filteredColumns = activeGroupFilter === 'all' 
    ? ALL_REPORT_COLUMNS 
    : ALL_REPORT_COLUMNS.filter(c => c.group === activeGroupFilter);

  const totalAtasCount = selectedAta ? 1 : atas.length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Exportar relatório Excel parametrizável (.xlsx)"
      subtitle="Personalize campos, escopos e granularidade contábil oficial da SENASP / MJSP"
      size="xl"
      dismissible={!isExporting}
      testId="export-excel-modal"
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={isExporting} />
          <AppButton
            type="button"
            onClick={handleGenerateReport}
            isLoading={isExporting}
            disabled={isExporting || (selectedColumnIds.length === 0 && granularity !== 'MULTI_SHEET')}
            icon={isExporting ? undefined : <Download size={16} />}
          >
            {isExporting ? 'Gerando planilha...' : 'Gerar e baixar planilha Excel (.xlsx)'}
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* SUCESSO / NOTIFICAÇÃO */}
          {successMsg && (
            <div style={{
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              color: '#065f46',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              fontSize: '0.88rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <Check size={18} color="var(--color-success)" /> {successMsg}
            </div>
          )}

          {/* SEÇÃO 1: PRESETS / MODELOS PRONTOS */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                1. Escolha um Modelo Pré-Configurado (Preset)
              </label>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Campos otimizados para cada perfil de usuário
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: '0.6rem' }}>
              
              {/* Preset Balanços */}
              <button
                type="button"
                onClick={() => handlePresetChange('BALANCES')}
                style={{
                  padding: '0.75rem 0.6rem',
                  borderRadius: '8px',
                  border: preset === 'BALANCES' ? '2px solid var(--primary)' : '1px solid #e2e8f0',
                  background: preset === 'BALANCES' ? 'var(--color-info-bg)' : '#ffffff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, fontSize: '0.82rem', color: 'var(--primary)' }}>
                  <Sliders size={16} /> Saldos Contábeis
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Itens, fornecedores, empenhos e saldo disponível
                </div>
              </button>

              {/* Preset Executivo */}
              <button
                type="button"
                onClick={() => handlePresetChange('EXECUTIVE')}
                style={{
                  padding: '0.75rem 0.6rem',
                  borderRadius: '8px',
                  border: preset === 'EXECUTIVE' ? '2px solid var(--primary)' : '1px solid #e2e8f0',
                  background: preset === 'EXECUTIVE' ? 'var(--color-info-bg)' : '#ffffff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, fontSize: '0.82rem', color: 'var(--primary)' }}>
                  <FileText size={16} /> Resumo Executivo
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Visão consolidada por Ata, vigências e valores
                </div>
              </button>

              {/* Preset Alocações */}
              <button
                type="button"
                onClick={() => handlePresetChange('ALLOCATIONS')}
                style={{
                  padding: '0.75rem 0.6rem',
                  borderRadius: '8px',
                  border: preset === 'ALLOCATIONS' ? '2px solid var(--primary)' : '1px solid #e2e8f0',
                  background: preset === 'ALLOCATIONS' ? 'var(--color-info-bg)' : '#ffffff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, fontSize: '0.82rem', color: 'var(--primary)' }}>
                  <Building2 size={16} /> Alocações Setoriais
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Cotas por diretoria, empenhos e processos SEI
                </div>
              </button>

              {/* Preset Compras */}
              <button
                type="button"
                onClick={() => handlePresetChange('PURCHASES')}
                style={{
                  padding: '0.75rem 0.6rem',
                  borderRadius: '8px',
                  border: preset === 'PURCHASES' ? '2px solid var(--primary)' : '1px solid #e2e8f0',
                  background: preset === 'PURCHASES' ? 'var(--color-info-bg)' : '#ffffff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, fontSize: '0.82rem', color: 'var(--primary)' }}>
                  <ShoppingBag size={16} /> Catálogo de Compras
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Itens, valores, caronas e links PNCP
                </div>
              </button>

              {/* Preset Custom */}
              <button
                type="button"
                onClick={() => setPreset('CUSTOM')}
                style={{
                  padding: '0.75rem 0.6rem',
                  borderRadius: '8px',
                  border: preset === 'CUSTOM' ? '2px solid var(--primary)' : '1px solid #e2e8f0',
                  background: preset === 'CUSTOM' ? 'var(--color-info-bg)' : '#ffffff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, fontSize: '0.82rem', color: 'var(--primary)' }}>
                  <Sparkles size={16} /> Personalizado
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Seleção livre de colunas personalizadas
                </div>
              </button>

            </div>
          </div>

          {/* SEÇÃO 2: ESCOPO E GRANULARIDADE */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '1rem' }}>
            
            {/* Granularidade */}
            <div style={{ background: '#f8fafc', padding: '0.9rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: '0.4rem' }}>
                Nível de Detalhamento da Planilha
              </label>
              <select
                className="form-input"
                value={granularity}
                onChange={(e) => setGranularity(e.target.value as ReportGranularity)}
                style={{ width: '100%', fontSize: '0.82rem', padding: '0.45rem 0.6rem', fontWeight: 600 }}
              >
                <option value="BY_ITEM">1 Linha por Item (Detalhado com Saldos)</option>
                <option value="BY_ATA">1 Linha por Ata (Resumo Gerencial)</option>
                <option value="BY_ALLOCATION">1 Linha por Alocação Setorial (Diretorias)</option>
                <option value="MULTI_SHEET">Pasta Completa com Múltiplas Abas</option>
              </select>
            </div>

            {/* Escopo */}
            <div style={{ background: '#f8fafc', padding: '0.9rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: '0.4rem' }}>
                Escopo dos Registros
              </label>
              <select
                className="form-input"
                value={scope}
                onChange={(e) => setScope(e.target.value as ReportScope)}
                style={{ width: '100%', fontSize: '0.82rem', padding: '0.45rem 0.6rem', fontWeight: 600 }}
              >
                {selectedAta && (
                  <option value="SELECTED_ATA">Somente a Ata Selecionada ({selectedAta.numeroAtaRegistroPreco})</option>
                )}
                <option value="CURRENT_FILTERED">Atas Filtradas Atualmente ({totalAtasCount} atas)</option>
                <option value="ALL_ATAS">Todas as Atas Cadastradas ({atas.length} atas)</option>
              </select>
            </div>

          </div>

          {/* SEÇÃO 3: SELEÇÃO PARAMETRIZÁVEL DE COLUNAS */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  2. Seleção de Colunas ({selectedColumnIds.length} selecionadas)
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                <AppButton
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={handleSelectAll}
                >
                  Marcar Todas
                </AppButton>
                <AppButton
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={handleClearAll}
                >
                  Desmarcar Todas
                </AppButton>
                <AppButton
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={handleResetDefaults}
                  icon={<RotateCcw size={14} />}
                >
                  Padrão
                </AppButton>
              </div>
            </div>

            {/* Abas de Filtro de Grupo de Coluna */}
            <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', paddingBottom: '0.4rem', borderBottom: '1px solid #e2e8f0' }}>
              <button
                type="button"
                onClick={() => setActiveGroupFilter('all')}
                style={{
                  padding: '0.35rem 0.7rem',
                  borderRadius: '20px',
                  border: 'none',
                  background: activeGroupFilter === 'all' ? 'var(--primary)' : '#f1f5f9',
                  color: activeGroupFilter === 'all' ? '#ffffff' : '#475569',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Todas ({ALL_REPORT_COLUMNS.length})
              </button>
              {COLUMN_GROUPS.map(g => {
                const countInGroup = ALL_REPORT_COLUMNS.filter(c => c.group === g.id).length;
                const selInGroup = ALL_REPORT_COLUMNS.filter(c => c.group === g.id && selectedColumnIds.includes(c.id)).length;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setActiveGroupFilter(g.id)}
                    style={{
                      padding: '0.35rem 0.7rem',
                      borderRadius: '20px',
                      border: 'none',
                      background: activeGroupFilter === g.id ? 'var(--primary)' : '#f1f5f9',
                      color: activeGroupFilter === g.id ? '#ffffff' : '#475569',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {g.title} ({selInGroup}/{countInGroup})
                  </button>
                );
              })}
            </div>

            {/* Grid de Checkboxes de Colunas */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
              gap: '0.5rem',
              maxHeight: '230px',
              overflowY: 'auto',
              padding: '0.6rem 0.2rem',
              background: '#ffffff'
            }}>
              {filteredColumns.map(col => {
                const isSelected = selectedColumnIds.includes(col.id);
                return (
                  <label
                    key={col.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      padding: '0.45rem 0.6rem',
                      borderRadius: '6px',
                      border: isSelected ? '1px solid var(--color-info-border)' : '1px solid #f1f5f9',
                      background: isSelected ? '#f8fafc' : '#ffffff',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background 0.1s ease'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleColumn(col.id)}
                      style={{ marginTop: '0.2rem', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: isSelected ? 'var(--primary)' : '#334155' }}>
                        {col.label}
                      </div>
                      {col.description && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.2, marginTop: '0.1rem' }}>
                          {col.description}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

          </div>

          {/* SEÇÃO 4: OPÇÕES ADICIONAIS */}
          <div style={{
            background: '#f8fafc',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            border: '1px solid #e2e8f0',
            display: 'flex',
            gap: '1.5rem',
            flexWrap: 'wrap'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeHeaderMetadata}
                onChange={(e) => setIncludeHeaderMetadata(e.target.checked)}
              />
              Incluir Cabeçalho Institucional MJSP / SENASP
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeTotalsSummary}
                onChange={(e) => setIncludeTotalsSummary(e.target.checked)}
              />
              Incluir Linha de Totais e Fórmulas de Sumário
            </label>
          </div>

        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
          Arquivo nativo Microsoft Excel (.xlsx) com formatação contábil
        </div>
      </div>
    </Modal>
  );
};
