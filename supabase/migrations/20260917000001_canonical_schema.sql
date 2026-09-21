-- ==============================================================================
-- MIGRATION 01: SCHEMA CANÔNICO RELACIONAL — SALDOARP 3.0
-- Versão: 20260917000001_canonical_schema.sql
-- Invariantes: P1 (SSOT), P3 (Database Integrity), P4 (Atomicidade)
-- ==============================================================================

-- 1. Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CACHE DE ATAS DE REGISTRO DE PREÇOS (L2)
CREATE TABLE IF NOT EXISTS public.atas_registro_preco (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_ata VARCHAR(30) NOT NULL,
  codigo_uasg VARCHAR(10) NOT NULL,
  nome_uasg VARCHAR(255),
  ano_compra VARCHAR(4),
  numero_compra VARCHAR(20),
  modalidade VARCHAR(100) DEFAULT 'Pregão',
  objeto TEXT,
  valor_total NUMERIC(18, 4) DEFAULT 0 CHECK (valor_total >= 0),
  data_vigencia_inicial DATE,
  data_vigencia_final DATE,
  status_ata VARCHAR(50) DEFAULT 'Ata de Registro de Preços',
  numero_controle_pncp VARCHAR(100),
  data_hora_atualizacao_api TIMESTAMPTZ,
  ultimo_sync_em TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_ata_uasg UNIQUE (numero_ata, codigo_uasg)
);

-- 3. CACHE DE ITENS DA ATA (L2)
CREATE TABLE IF NOT EXISTS public.itens_ata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ata_id UUID NOT NULL REFERENCES public.atas_registro_preco(id) ON DELETE CASCADE,
  numero_item VARCHAR(10) NOT NULL, -- Padrão 5 dígitos: '00001'
  codigo_pdm INTEGER,
  descricao_item TEXT NOT NULL,
  fornecedor_cnpj_cpf VARCHAR(20),
  fornecedor_razao_social VARCHAR(255),
  quantidade_homologada NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (quantidade_homologada >= 0),
  valor_unitario NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
  valor_total NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (valor_total >= 0),
  maximo_adesao NUMERIC(18, 4) DEFAULT 0 CHECK (maximo_adesao >= 0),
  ultimo_sync_em TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_item_por_ata UNIQUE (ata_id, numero_item)
);

-- 4. CATÁLOGO OFICIAL DE DEPARTAMENTOS / UNIDADES
CREATE TABLE IF NOT EXISTS public.internal_departments (
  id VARCHAR(50) PRIMARY KEY,
  sigla VARCHAR(30) NOT NULL UNIQUE,
  nome_completo VARCHAR(255) NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. PROCESSOS ADMINISTRATIVOS SEI
CREATE TABLE IF NOT EXISTS public.processos_sei (
  id VARCHAR(50) PRIMARY KEY,
  numero_processo_sei VARCHAR(50) NOT NULL UNIQUE,
  descricao_objeto TEXT,
  unidade_requisitante VARCHAR(100),
  responsavel_nome VARCHAR(150),
  status_processo VARCHAR(50) DEFAULT 'Em Instrução' 
    CHECK (status_processo IN ('Em Instrução', 'Aprovado', 'Empenhado', 'Concluído')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. CONTROLE DE VERSÃO DO AGREGADO DE ALOCAÇÃO (OPTIMISTIC LOCKING NO AGREGADO)
CREATE TABLE IF NOT EXISTS public.item_allocation_state (
  item_key VARCHAR(100) PRIMARY KEY, -- Formato canônico: {numeroAta}-{uasg}-{00001}
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. ALOCAÇÕES INTERNAS (COTAS DEPARTAMENTAIS POR ITEM)
CREATE TABLE IF NOT EXISTS public.arp_allocations (
  id VARCHAR(100) PRIMARY KEY,
  item_key VARCHAR(100) NOT NULL,
  unit_name VARCHAR(50) NOT NULL REFERENCES public.internal_departments(sigla) ON UPDATE CASCADE,
  allocated_qty NUMERIC(18, 4) NOT NULL CHECK (allocated_qty >= 0),
  empenhada_qty NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (empenhada_qty >= 0),
  processo_sei_id VARCHAR(50) REFERENCES public.processos_sei(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_alloc_item_unit UNIQUE (item_key, unit_name)
);

-- 8. VÍNCULOS DE EMPENHOS A ALOCAÇÕES
CREATE TABLE IF NOT EXISTS public.empenho_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key VARCHAR(100) NOT NULL,
  empenho_numero VARCHAR(50) NOT NULL,
  allocation_id VARCHAR(100) NOT NULL REFERENCES public.arp_allocations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_link_item_empenho UNIQUE (item_key, empenho_numero)
);

-- 9. OVERRIDES MANUAIS DE QUANTIDADE DE EMPENHO
CREATE TABLE IF NOT EXISTS public.empenho_manual_quantidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key VARCHAR(100) NOT NULL,
  emp_key VARCHAR(50) NOT NULL,
  quantidade NUMERIC(18, 4) NOT NULL CHECK (quantidade >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_emp_manual_qty UNIQUE (item_key, emp_key)
);

-- 10. EMPENHOS MANUAIS CANÔNICOS
CREATE TABLE IF NOT EXISTS public.empenhos_manuais (
  id VARCHAR(100) PRIMARY KEY,
  item_key VARCHAR(100) NOT NULL,
  numero VARCHAR(50) NOT NULL,
  ano INTEGER NOT NULL CHECK (ano >= 2000 AND ano <= 2100),
  arp_id VARCHAR(30) NOT NULL,
  item_id VARCHAR(10) NOT NULL,
  uasg VARCHAR(10) NOT NULL,
  quantidade NUMERIC(18, 4) NOT NULL CHECK (quantidade > 0),
  valor_unitario NUMERIC(18, 4) CHECK (valor_unitario >= 0),
  valor_total NUMERIC(18, 4) CHECK (valor_total >= 0),
  data DATE,
  fornecedor VARCHAR(255),
  cnpj_fornecedor VARCHAR(20),
  unidade_interna_id VARCHAR(100),
  observacao TEXT,
  origem VARCHAR(20) NOT NULL DEFAULT 'MANUAL' CHECK (origem IN ('API', 'MANUAL', 'SINCRONIZADO')),
  status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMADO' CHECK (status IN ('CONFIRMADO', 'PENDENTE', 'DIVERGENTE')),
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_manual_emp UNIQUE (item_key, numero, ano)
);

-- 11. CONTRATOS MANUAIS CANÔNICOS
CREATE TABLE IF NOT EXISTS public.contratos_manuais (
  id VARCHAR(150) PRIMARY KEY,
  item_key VARCHAR(100) NOT NULL,
  numero VARCHAR(50) NOT NULL,
  ano INTEGER NOT NULL CHECK (ano >= 2000 AND ano <= 2100),
  arp_id VARCHAR(30) NOT NULL,
  item_id VARCHAR(10),
  uasg VARCHAR(10) NOT NULL,
  numero_controle_pncp VARCHAR(100),
  link_pncp TEXT,
  fornecedor VARCHAR(255),
  cnpj_fornecedor VARCHAR(20),
  objeto TEXT,
  quantidade_contratada NUMERIC(18, 4) CHECK (quantidade_contratada >= 0),
  valor_total NUMERIC(18, 4) CHECK (valor_total >= 0),
  origem VARCHAR(20) NOT NULL DEFAULT 'MANUAL' CHECK (origem IN ('API', 'MANUAL')),
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_manual_contrato UNIQUE (item_key, numero, ano)
);

-- 12. VÍNCULOS ASSOCIATIVOS CONTRATO <-> EMPENHO (N:N)
CREATE TABLE IF NOT EXISTS public.contrato_empenho_links (
  id VARCHAR(150) PRIMARY KEY,
  item_key VARCHAR(100) NOT NULL,
  contrato_id VARCHAR(150) NOT NULL REFERENCES public.contratos_manuais(id) ON DELETE CASCADE,
  empenho_id VARCHAR(100) NOT NULL, -- Chave Canônica do Empenho (sem FK física artificial p/ suportar API)
  quantidade_vinculada NUMERIC(18, 4) CHECK (quantidade_vinculada >= 0),
  data_vinculo TIMESTAMPTZ DEFAULT NOW(),
  origem VARCHAR(20) NOT NULL DEFAULT 'MANUAL' CHECK (origem IN ('API', 'MANUAL')),
  CONSTRAINT uq_contrato_empenho UNIQUE (contrato_id, empenho_id)
);

-- 13. ÍNDICES DE ALTA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_itens_ata_ata_id ON public.itens_ata (ata_id);
CREATE INDEX IF NOT EXISTS idx_alloc_item_key ON public.arp_allocations (item_key);
CREATE INDEX IF NOT EXISTS idx_empenho_links_item_key ON public.empenho_links (item_key);
CREATE INDEX IF NOT EXISTS idx_emp_man_qty_item_key ON public.empenho_manual_quantidades (item_key);
CREATE INDEX IF NOT EXISTS idx_man_emp_item_key ON public.empenhos_manuais (item_key);
CREATE INDEX IF NOT EXISTS idx_man_ctr_item_key ON public.contratos_manuais (item_key);
CREATE INDEX IF NOT EXISTS idx_ctr_emp_links_item_key ON public.contrato_empenho_links (item_key);
CREATE INDEX IF NOT EXISTS idx_ctr_emp_links_contrato ON public.contrato_empenho_links (contrato_id);
