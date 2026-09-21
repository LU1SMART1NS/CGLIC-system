import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  Search, 
  Building2, 
  Calendar, 
  DollarSign, 
  Users, 
  CheckCircle2, 
  Clock, 
  RefreshCw,
  HelpCircle,
  ArrowUpDown
} from 'lucide-react';
import type { ContractFilterParams } from '../types';
import { 
  calculateContractKPIs, 
  filterContracts 
} from '../services/contractService';
import { useContractsDashboard } from '../hooks/useContractsDashboard';
import { ContractCard } from './cards/ContractCard';
import { ContractCardSkeleton } from './cards/ContractCardSkeleton';

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const ContractsDashboard: React.FC = () => {
  // Parâmetros de Filtro
  const [filters, setFilters] = useState<ContractFilterParams>({
    uasg: '200331',
    numeroAno: '',
    fornecedor: '',
    statusVigencia: 'todos',
    dataVigenciaMin: '',
    dataVigenciaMax: '',
    anoContrato: ''
  });

  // Estado de servidor via React Query
  const {
    data: contracts = [],
    isLoading: loading,
    isFetching: isRefreshing,
    error: contractsQueryError,
    refetch
  } = useContractsDashboard(filters.uasg);

  const error = contractsQueryError ? (contractsQueryError.message || 'Falha ao buscar contratos nas APIs governamentais.') : null;

  // Ordenação
  const [sortBy, setSortBy] = useState<'ano_desc' | 'valor_desc' | 'numero_asc'>('ano_desc');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    refetch();
  };

  const handleClearFilters = () => {
    const cleared: ContractFilterParams = {
      uasg: '200331',
      numeroAno: '',
      fornecedor: '',
      statusVigencia: 'todos',
      dataVigenciaMin: '',
      dataVigenciaMax: '',
      anoContrato: ''
    };
    setFilters(cleared);
  };

  // Aplicação dos filtros em memória
  const filteredContracts = useMemo(() => {
    const res = filterContracts(contracts, filters);

    // Ordenação
    return res.sort((a, b) => {
      if (sortBy === 'valor_desc') {
        const valA = a.valorGlobal || a.valorInicial || 0;
        const valB = b.valorGlobal || b.valorInicial || 0;
        return valB - valA;
      }
      if (sortBy === 'numero_asc') {
        const numA = parseInt(a.numero.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.numero.replace(/\D/g, ''), 10) || 0;
        return numA - numB;
      }
      // Padrão: ano_desc
      const anoA = parseInt(String(a.ano), 10) || 0;
      const anoB = parseInt(String(b.ano), 10) || 0;
      if (anoB !== anoA) return anoB - anoA;
      const numA = parseInt(a.numero.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.numero.replace(/\D/g, ''), 10) || 0;
      return numB - numA;
    });
  }, [contracts, filters, sortBy]);

  // KPIs dos contratos filtrados
  const kpis = useMemo(() => {
    return calculateContractKPIs(filteredContracts);
  }, [filteredContracts]);

  // Lista de anos disponíveis para o select de ano
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    contracts.forEach(c => {
      if (c.ano) years.add(String(c.ano));
    });
    return Array.from(years).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
  }, [contracts]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* SEÇÃO DE KPIS DO DASHBOARD DE CONTRATOS */}
      <section className="kpi-grid">
        
        {/* KPI 1: Total de Contratos */}
        <div className="kpi-card" style={{ borderTop: '4px solid var(--primary)' }}>
          <div className="kpi-header primary">
            <FileText size={16} /> Total de Contratos
          </div>
          <div className="kpi-value">
            {kpis.totalContratos}
          </div>
          <div className="kpi-footer">
            <div>
              <strong>UASG Atual:</strong>
              <div className="kpi-footer-val">{filters.uasg || '200331'}</div>
            </div>
            <div>
              <strong>Fontes:</strong>
              <div className="kpi-footer-val">Compras / Contratos.gov</div>
            </div>
          </div>
        </div>

        {/* KPI 2: Contratos Vigentes */}
        <div className="kpi-card" style={{ borderTop: '4px solid var(--success)' }}>
          <div className="kpi-header success">
            <CheckCircle2 size={16} /> Contratos Vigentes
          </div>
          <div className="kpi-value" style={{ color: 'var(--success)' }}>
            {kpis.contratosVigentes}
          </div>
          <div className="kpi-footer">
            <div>
              <strong>A Vencer (&lt;60d):</strong>
              <div className="kpi-footer-val" style={{ color: '#d97706', fontWeight: 700 }}>
                {kpis.contratosAVencer}
              </div>
            </div>
            <div>
              <strong>Expirados:</strong>
              <div className="kpi-footer-val" style={{ color: '#dc2626' }}>
                {kpis.contratosExpirados}
              </div>
            </div>
          </div>
        </div>

        {/* KPI 3: Fornecedores Contratados */}
        <div className="kpi-card" style={{ borderTop: '4px solid var(--primary)' }}>
          <div className="kpi-header primary">
            <Users size={16} /> Fornecedores Contratados
          </div>
          <div className="kpi-value">
            {kpis.totalFornecedores}
          </div>
          <div className="kpi-footer">
            <div>
              <strong>Empresas / Credores:</strong>
              <div className="kpi-footer-val">CNPJs Distintos</div>
            </div>
            <div>
              <strong>Status:</strong>
              <div className="kpi-footer-val">{filteredContracts.length} registros</div>
            </div>
          </div>
        </div>

        {/* KPI 4: Valor Global Total */}
        <div className="kpi-card" style={{ borderTop: '4px solid var(--primary-hover)' }}>
          <div className="kpi-header primary">
            <DollarSign size={16} /> Valor Global Total
          </div>
          <div className="kpi-value" style={{ fontSize: '1.4rem' }}>
            {formatCurrency(kpis.valorTotalGlobal)}
          </div>
          <div className="kpi-footer">
            <div>
              <strong>Média por Contrato:</strong>
              <div className="kpi-footer-val">
                {kpis.totalContratos > 0 ? formatCurrency(kpis.valorTotalGlobal / kpis.totalContratos) : 'R$ 0,00'}
              </div>
            </div>
            <div>
              <strong>Base:</strong>
              <div className="kpi-footer-val">Contratos Filtrados</div>
            </div>
          </div>
        </div>

      </section>

      {/* SEÇÃO DE FILTROS */}
      <section className="comprassusp-filter-card">
        <div className="filter-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0, borderBottom: 'none', paddingBottom: 0 }}>
            <Search size={20} color="var(--primary)" /> Filtrar Contratos Administrativos
          </h2>
          
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefreshing || loading}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            title="Atualizar dados diretamente das APIs do Governo"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? 'Atualizando...' : 'Atualizar Dados da API'}</span>
          </button>
        </div>

        <form onSubmit={handleSearchSubmit} className="filter-body">
          {/* Linha 1: UASG, Número/Ano e Ano */}
          <fieldset className="filter-row grid-3-cols">
            <div className="form-group">
              <label className="form-label">
                <Building2 size={14} style={{ marginRight: '4px' }} /> Unidade Gestora (UASG)
              </label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input 
                  type="text" 
                  className="form-input"
                  placeholder="Ex: 200331"
                  value={filters.uasg}
                  onChange={(e) => setFilters({ ...filters, uasg: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => {
                    const nextUasg = filters.uasg === '200331' ? '200330' : '200331';
                    setFilters({ ...filters, uasg: nextUasg });
                  }}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.72rem', padding: '0 0.5rem', whiteSpace: 'nowrap' }}
                  title="Alternar entre UASG 200331 e 200330"
                >
                  {filters.uasg === '200331' ? '200330' : '200331'}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                <FileText size={14} style={{ marginRight: '4px' }} /> Número / Ano do Contrato
              </label>
              <input 
                type="text" 
                className="form-input"
                placeholder="Ex: 12/2025 ou 00012"
                value={filters.numeroAno}
                onChange={(e) => setFilters({ ...filters, numeroAno: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <Calendar size={14} style={{ marginRight: '4px' }} /> Ano do Contrato
              </label>
              <select
                className="form-input"
                value={filters.anoContrato}
                onChange={(e) => setFilters({ ...filters, anoContrato: e.target.value })}
                style={{ fontWeight: 600, cursor: 'pointer' }}
              >
                <option value="">Todos os anos</option>
                {availableYears.map(yr => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
            </div>
          </fieldset>

          {/* Linha 2: Fornecedor, Status de Vigência e Ordenação */}
          <fieldset className="filter-row grid-3-cols">
            <div className="form-group">
              <label className="form-label">
                <Users size={14} style={{ marginRight: '4px' }} /> Fornecedor (Nome ou CNPJ)
              </label>
              <input 
                type="text" 
                className="form-input"
                placeholder="Razão social ou dígitos do CNPJ"
                value={filters.fornecedor}
                onChange={(e) => setFilters({ ...filters, fornecedor: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <Clock size={14} style={{ marginRight: '4px' }} /> Situação da Vigência
              </label>
              <select
                className="form-input"
                value={filters.statusVigencia}
                onChange={(e) => setFilters({ ...filters, statusVigencia: e.target.value as any })}
                style={{ fontWeight: 600, cursor: 'pointer' }}
              >
                <option value="todos">Todas as situações</option>
                <option value="vigente">Vigentes (Ativos)</option>
                <option value="a_vencer">A Vencer (&lt; 60 dias)</option>
                <option value="expirado">Expirados</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">
                <ArrowUpDown size={14} style={{ marginRight: '4px' }} /> Ordenar Por
              </label>
              <select
                className="form-input"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                style={{ fontWeight: 600, cursor: 'pointer' }}
              >
                <option value="ano_desc">Mais Recentes (Ano / Número)</option>
                <option value="valor_desc">Maior Valor Global</option>
                <option value="numero_asc">Número do Contrato (Crescente)</option>
              </select>
            </div>
          </fieldset>

          {/* Botões de Ação */}
          <div className="filter-actions">
            <button 
              type="button" 
              onClick={handleClearFilters}
              className="btn btn-secondary"
            >
              Limpar Filtros
            </button>

            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Search size={16} />
              <span>{loading ? 'Buscando...' : 'Aplicar Filtros'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* SEÇÃO DE RESULTADOS */}
      <section className="glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ padding: '0 0.5rem 1rem 0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0c326f', margin: 0 }}>
            Resultados ({filteredContracts.length} Contratos)
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>
              {kpis.contratosVigentes} vigentes • {kpis.totalFornecedores} fornecedores
            </span>
          </div>
        </div>

        {loading ? (
          <div className="ata-cards-container" aria-busy="true" aria-label="Carregando contratos...">
            <ContractCardSkeleton />
            <ContractCardSkeleton />
            <ContractCardSkeleton />
          </div>
        ) : error && filteredContracts.length === 0 ? (
          <div className="empty-state">
            <HelpCircle size={40} className="empty-state-icon" />
            <p style={{ fontSize: '0.95rem' }}>{error}</p>
          </div>
        ) : filteredContracts.length === 0 ? (
          <div className="empty-state">
            <FileText size={40} className="empty-state-icon" />
            <p style={{ fontSize: '0.95rem' }}>Nenhum contrato encontrado para os filtros especificados.</p>
          </div>
        ) : (
          <div className="ata-cards-container" role="feed" aria-label="Lista de Contratos Administrativos">
            {filteredContracts.map((contract) => (
              <ContractCard 
                key={contract.id} 
                contract={contract} 
              />
            ))}
          </div>
        )}
      </section>

    </div>
  );
};
