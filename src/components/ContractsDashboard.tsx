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
  ArrowUpDown,
  UserCheck,
  AlertTriangle,
  Filter
} from 'lucide-react';
import type { ContractFilterParams } from '../types';
import { 
  calculateContractKPIs, 
  filterContracts 
} from '../services/contractService';
import { getContractManagementKey } from '../services/contractManagementService';
import { useContractsDashboard } from '../hooks/useContractsDashboard';
import { useAllContractManagers } from '../hooks/useAllContractManagers';
import { useUsers } from '../hooks/useUsers';
import { useRoles } from '../hooks/useRoles';
import { resolveRoleLabel } from '../services/roleService';
import { ContractCard } from './cards/ContractCard';
import { ContractCardSkeleton } from './cards/ContractCardSkeleton';

type ScopeFilter = 'TODOS' | 'MEUS' | 'NAO_ATRIBUIDOS';

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const ContractsDashboard: React.FC = () => {
  // Escopo de Gestão e Perfil de Visualização
  const [scope, setScope] = useState<ScopeFilter>('TODOS');
  const [selectedGestorFilter, setSelectedGestorFilter] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<{ id?: string; nome: string; role: string }>({
    nome: 'Coordenação Geral',
    role: 'coordenador'
  });

  const { data: systemUsers = [] } = useUsers();
  const { data: systemRoles = [] } = useRoles();

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
    refetch,
    refresh
  } = useContractsDashboard(filters.uasg);

  // Mapa de gestores atribuídos no banco Supabase
  const { data: managersMap = {} } = useAllContractManagers(filters.uasg);

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
    setSelectedGestorFilter('');
    setScope('TODOS');
  };

  // Contadores de Escopo (Meus, Todos, Não Atribuídos)
  const scopeCounts = useMemo(() => {
    let meusCount = 0;
    let naoAtribuidosCount = 0;
    const allGestores = new Set<string>();

    contracts.forEach(contract => {
      const key = getContractManagementKey(contract.uasg, contract.numero, contract.ano);
      const manager = managersMap[key];
      if (manager && manager.gestorNome && manager.gestorNome.trim() !== '') {
        allGestores.add(manager.gestorNome.trim());
        if (currentUser.nome && manager.gestorNome.toLowerCase().includes(currentUser.nome.toLowerCase())) {
          meusCount++;
        }
      } else {
        naoAtribuidosCount++;
      }
    });

    return {
      todos: contracts.length,
      meus: meusCount,
      naoAtribuidos: naoAtribuidosCount,
      gestores: Array.from(allGestores).sort()
    };
  }, [contracts, managersMap, currentUser]);

  // Aplicação do Filtro de Escopo e Filtros de Busca
  const filteredContracts = useMemo(() => {
    // 1. Filtrar pelo escopo de atribuição
    const inScope = contracts.filter(contract => {
      const key = getContractManagementKey(contract.uasg, contract.numero, contract.ano);
      const manager = managersMap[key];
      const hasManager = Boolean(manager && manager.gestorNome && manager.gestorNome.trim() !== '');

      if (scope === 'MEUS') {
        if (!hasManager) return false;
        return currentUser.nome && manager!.gestorNome.toLowerCase().includes(currentUser.nome.toLowerCase());
      }

      if (scope === 'NAO_ATRIBUIDOS') {
        return !hasManager;
      }

      if (selectedGestorFilter) {
        if (!hasManager) return false;
        return manager!.gestorNome.toLowerCase() === selectedGestorFilter.toLowerCase();
      }

      return true;
    });

    // 2. Filtrar por parâmetros de busca (número, fornecedor, vigência, etc.)
    const res = filterContracts(inScope, filters);

    // 3. Ordenação
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
  }, [contracts, managersMap, scope, selectedGestorFilter, currentUser, filters, sortBy]);

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', padding: '1rem 0' }}>
      
      {/* 1. BARRA DE ESCOPO DE GESTÃO (MEUS / TODOS / NÃO ATRIBUÍDOS) */}
      <section style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '1.25rem 1.5rem',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0, borderBottom: 'none', paddingBottom: 0 }}>
              Acompanhamento e Prazos
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0.15rem 0 0 0' }}>
              Gestão operacional, fiscalização e acompanhamento de vigências
            </p>
          </div>

          {/* Seletor de Perfil / Usuário */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: '#f8fafc', padding: '0.35rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Simular Operador:</span>
            <select
              value={currentUser.id || currentUser.role}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'coordenador') {
                  setCurrentUser({
                    nome: 'Coordenação Geral',
                    role: 'coordenador'
                  });
                  setScope('TODOS');
                } else {
                  const targetUser = systemUsers.find(u => u.id === val);
                  if (targetUser) {
                    setCurrentUser({
                      id: targetUser.id,
                      nome: targetUser.nome,
                      role: targetUser.perfil
                    });
                    if (targetUser.perfil === 'coordenador') {
                      setScope('TODOS');
                    } else {
                      setScope('MEUS');
                    }
                  }
                }
              }}
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                border: 'none',
                background: 'transparent',
                color: '#0c326f',
                cursor: 'pointer'
              }}
            >
              <option value="coordenador">👑 Coordenador Geral (Visão 100% da Pasta)</option>
              {systemUsers.filter(u => u.ativo).map(u => (
                <option key={u.id} value={u.id}>
                  👤 {u.nome} ({resolveRoleLabel(systemRoles, u.perfil)})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Pílulas de Alternância de Escopo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* Botão Todos */}
            <button
              type="button"
              onClick={() => { setScope('TODOS'); setSelectedGestorFilter(''); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.5rem 0.9rem',
                borderRadius: '8px',
                border: scope === 'TODOS' && !selectedGestorFilter ? '2px solid #0c326f' : '1px solid #cbd5e1',
                background: scope === 'TODOS' && !selectedGestorFilter ? '#eff6ff' : '#ffffff',
                color: scope === 'TODOS' && !selectedGestorFilter ? '#0c326f' : '#475569',
                fontWeight: scope === 'TODOS' && !selectedGestorFilter ? 800 : 600,
                fontSize: '0.84rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Users size={15} />
              <span>Todos os Contratos</span>
              <span style={{
                fontSize: '0.7rem',
                padding: '0.1rem 0.45rem',
                borderRadius: '999px',
                background: scope === 'TODOS' && !selectedGestorFilter ? '#0c326f' : '#f1f5f9',
                color: scope === 'TODOS' && !selectedGestorFilter ? '#ffffff' : '#64748b',
                fontWeight: 700
              }}>
                {scopeCounts.todos}
              </span>
            </button>

            {/* Botão Meus Contratos */}
            <button
              type="button"
              onClick={() => { setScope('MEUS'); setSelectedGestorFilter(''); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.5rem 0.9rem',
                borderRadius: '8px',
                border: scope === 'MEUS' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                background: scope === 'MEUS' ? '#e0f2fe' : '#ffffff',
                color: scope === 'MEUS' ? '#0369a1' : '#475569',
                fontWeight: scope === 'MEUS' ? 800 : 600,
                fontSize: '0.84rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <UserCheck size={15} />
              <span>Meus Contratos</span>
              <span style={{
                fontSize: '0.7rem',
                padding: '0.1rem 0.45rem',
                borderRadius: '999px',
                background: scope === 'MEUS' ? '#0284c7' : '#f1f5f9',
                color: scope === 'MEUS' ? '#ffffff' : '#64748b',
                fontWeight: 700
              }}>
                {scopeCounts.meus}
              </span>
            </button>

            {/* Botão Não Atribuídos */}
            <button
              type="button"
              onClick={() => { setScope('NAO_ATRIBUIDOS'); setSelectedGestorFilter(''); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.5rem 0.9rem',
                borderRadius: '8px',
                border: scope === 'NAO_ATRIBUIDOS' ? '2px solid #d97706' : '1px solid #cbd5e1',
                background: scope === 'NAO_ATRIBUIDOS' ? '#fef3c7' : '#ffffff',
                color: scope === 'NAO_ATRIBUIDOS' ? '#b45309' : '#475569',
                fontWeight: scope === 'NAO_ATRIBUIDOS' ? 800 : 600,
                fontSize: '0.84rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <AlertTriangle size={15} color={scope === 'NAO_ATRIBUIDOS' ? '#b45309' : '#f59e0b'} />
              <span>Não Atribuídos</span>
              <span style={{
                fontSize: '0.7rem',
                padding: '0.1rem 0.45rem',
                borderRadius: '999px',
                background: scope === 'NAO_ATRIBUIDOS' ? '#d97706' : '#fef3c7',
                color: scope === 'NAO_ATRIBUIDOS' ? '#ffffff' : '#b45309',
                fontWeight: 800
              }}>
                {scopeCounts.naoAtribuidos}
              </span>
            </button>
          </div>

          {/* Filtro por Gestor Específico (para Coordenadores) */}
          {scopeCounts.gestores.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Filter size={14} color="#64748b" />
              <select
                value={selectedGestorFilter}
                onChange={(e) => {
                  setSelectedGestorFilter(e.target.value);
                  if (e.target.value) setScope('TODOS');
                }}
                style={{
                  fontSize: '0.8rem',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#334155',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <option value="">Filtrar por Gestor Designado...</option>
                {scopeCounts.gestores.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      {/* 2. SEÇÃO DE KPIS DO DASHBOARD DE CONTRATOS */}
      <section className="kpi-grid">
        
        {/* KPI 1: Total de Contratos */}
        <div className="kpi-card" style={{ borderTop: '4px solid #0c326f' }}>
          <div className="kpi-header primary">
            <FileText size={16} /> Total de Contratos
          </div>
          <div className="kpi-value">
            {kpis.totalContratos}
          </div>
          <div className="kpi-footer">
            <div>
              <strong>No Escopo:</strong>
              <div className="kpi-footer-val">{filteredContracts.length} contratos</div>
            </div>
            <div>
              <strong>Atribuídos:</strong>
              <div className="kpi-footer-val">
                {scopeCounts.todos - scopeCounts.naoAtribuidos}
              </div>
            </div>
          </div>
        </div>

        {/* KPI 2: Contratos Vigentes */}
        <div className="kpi-card" style={{ borderTop: '4px solid #10b981' }}>
          <div className="kpi-header success">
            <CheckCircle2 size={16} /> Vigência Regular
          </div>
          <div className="kpi-value" style={{ color: '#059669' }}>
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
        <div className="kpi-card" style={{ borderTop: '4px solid #0284c7' }}>
          <div className="kpi-header primary">
            <Users size={16} /> Fornecedores Credenciados
          </div>
          <div className="kpi-value">
            {kpis.totalFornecedores}
          </div>
          <div className="kpi-footer">
            <div>
              <strong>Empresas:</strong>
              <div className="kpi-footer-val">CNPJs Distintos</div>
            </div>
            <div>
              <strong>Contratos:</strong>
              <div className="kpi-footer-val">{filteredContracts.length} registros</div>
            </div>
          </div>
        </div>

        {/* KPI 4: Valor Global Total */}
        <div className="kpi-card" style={{ borderTop: '4px solid #059669' }}>
          <div className="kpi-header primary">
            <DollarSign size={16} /> Valor Global Contratado
          </div>
          <div className="kpi-value" style={{ fontSize: '1.35rem', color: '#065f46' }}>
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
              <strong>Total:</strong>
              <div className="kpi-footer-val">Homologado</div>
            </div>
          </div>
        </div>

      </section>

      {/* 3. SEÇÃO DE FILTROS DE PESQUISA */}
      <section className="comprassusp-filter-card">
        <div className="filter-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h2 className="section-title" style={{ fontSize: '1.15rem', margin: 0, borderBottom: 'none', paddingBottom: 0 }}>
            <Search size={18} color="#0c326f" /> Filtros de Pesquisa
          </h2>
          
          <button
            type="button"
            onClick={() => refresh ? refresh() : refetch()}
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

      {/* 4. SEÇÃO DE RESULTADOS */}
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
          <div className="empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '2.5rem 1rem' }}>
            <FileText size={40} className="empty-state-icon" style={{ color: '#94a3b8' }} />
            <p style={{ fontSize: '0.95rem', color: '#475569', margin: 0, fontWeight: 600 }}>
              Nenhum contrato encontrado para a UASG {filters.uasg || '200331'} e filtros selecionados.
            </p>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0, maxWidth: '520px', textAlign: 'center' }}>
              Se as APIs do Governo Federal estiverem oscilando, você pode tentar atualizar os dados ou alternar a UASG para pesquisar outros contratos cadastrados.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => refresh ? refresh() : refetch()}
                disabled={isRefreshing || loading}
                className="btn btn-primary"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
                <span>{isRefreshing ? 'Consultando...' : 'Recarregar da API'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextUasg = filters.uasg === '200331' ? '200330' : '200331';
                  setFilters({ ...filters, uasg: nextUasg });
                }}
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
              >
                Alternar para UASG {filters.uasg === '200331' ? '200330' : '200331'}
              </button>
            </div>
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
