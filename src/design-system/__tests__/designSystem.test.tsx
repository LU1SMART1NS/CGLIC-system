import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  colors,
  shapes,
  spacing,
  typography,
  severityTokens,
  operationalCategoryTokens,
  AppCard,
  KpiCard,
  StatusBadge,
  SeverityBadge,
  AlertCard,
  SectionHeader,
  FilterBar,
  DataTable,
  EmptyState,
  ErrorState,
  SkeletonLoader,
  Tabs,
  ProgressBar,
  Timeline,
  TaskCard,
  WorkflowStepper
} from '../index';

describe('SaldoARP 3.0 — Design System Foundation (Fase 9-C1)', () => {
  describe('1. Design Tokens', () => {
    it('deve exportar paleta completa de cores com contraste adequado', () => {
      expect(colors.background.surface).toBe('#ffffff');
      expect(colors.text.primary).toBe('#0f172a');
      expect(colors.brand.primary).toBe('#0284c7');
      expect(colors.semantic.success.solid).toBe('#16a34a');
      expect(colors.semantic.danger.solid).toBe('#ef4444');
      expect(colors.semantic.warning.solid).toBe('#f59e0b');
    });

    it('deve conter definições semânticas para as 4 severidades do Funil de Atenção', () => {
      expect(severityTokens.CRITICA.label).toBe('CRÍTICA');
      expect(severityTokens.URGENTE.label).toBe('URGENTE');
      expect(severityTokens.ATENCAO.label).toBe('ATENÇÃO');
      expect(severityTokens.INFO.label).toBe('INFO');
    });

    it('deve conter as 6 categorias operacionais canônicas do SaldoARP', () => {
      expect(operationalCategoryTokens.FATO_OFICIAL.label).toBe('Fato Oficial');
      expect(operationalCategoryTokens.ALERTA.label).toBe('Alerta Operacional');
      expect(operationalCategoryTokens.TAREFA.label).toBe('Tarefa Humana');
      expect(operationalCategoryTokens.WORKFLOW.label).toBe('Fluxo Processual');
      expect(operationalCategoryTokens.ACAO.label).toBe('Ação Disponível');
      expect(operationalCategoryTokens.CONFIRMACAO.label).toBe('Confirmação');
    });

    it('deve exportar escalas de tipografia, espaçamento e raios', () => {
      expect(spacing.md).toBe('0.75rem');
      expect(shapes.radius['2xl']).toBe('12px');
      expect(typography.fontWeight.extrabold).toBe(800);
    });
  });

  describe('2. Componente AppCard', () => {
    it('deve renderizar AppCard com variantes e bordas customizadas', () => {
      const html = renderToStaticMarkup(
        <AppCard variant="elevated" highlightBorderTop="#0284c7" data-testid="test-card">
          <span>Conteúdo Interno do Card</span>
        </AppCard>
      );
      expect(html).toContain('app-card');
      expect(html).toContain('Conteúdo Interno do Card');
      expect(html).toContain('border-top:4px solid #0284c7');
    });
  });

  describe('3. Componente KpiCard', () => {
    it('deve renderizar KpiCard em estado normal com valor e unidade', () => {
      const html = renderToStaticMarkup(
        <KpiCard
          title="Saldo Físico Total"
          value="1.250"
          unit="unidades"
          description="Disponível para contratação"
          variant="primary"
        />
      );
      expect(html).toContain('Saldo Físico Total');
      expect(html).toContain('1.250');
      expect(html).toContain('unidades');
      expect(html).toContain('Disponível para contratação');
    });

    it('deve renderizar skeleton quando isLoading=true', () => {
      const html = renderToStaticMarkup(
        <KpiCard title="Total Empenhado" isLoading={true} />
      );
      expect(html).toContain('kpi-card-loading');
      expect(html).toContain('aria-busy="true"');
      expect(html).not.toContain('R$ 0,00');
    });

    it('deve renderizar erro explícito quando isError=true com role="alert"', () => {
      const html = renderToStaticMarkup(
        <KpiCard title="Total Empenhado" isError={true} errorMessage="Falha no SIAFI" />
      );
      expect(html).toContain('kpi-card-error');
      expect(html).toContain('role="alert"');
      expect(html).toContain('Falha no SIAFI');
    });

    it('deve renderizar estado vazio quando isEmpty=true', () => {
      const html = renderToStaticMarkup(
        <KpiCard title="Reajustes" isEmpty={true} emptyMessage="Sem reajustes no período" />
      );
      expect(html).toContain('kpi-card-empty');
      expect(html).toContain('Sem reajustes no período');
    });
  });

  describe('4. Componente StatusBadge e SeverityBadge', () => {
    it('deve renderizar StatusBadge com cores semânticas e dot', () => {
      const html = renderToStaticMarkup(
        <StatusBadge label="Vigente" variant="success" size="md" />
      );
      expect(html).toContain('status-badge');
      expect(html).toContain('Vigente');
    });

    it('deve renderizar SeverityBadge com as 4 faixas do funil de atenção', () => {
      const htmlCritica = renderToStaticMarkup(<SeverityBadge severity="CRITICA" />);
      const htmlUrgente = renderToStaticMarkup(<SeverityBadge severity="URGENTE" />);
      const htmlAtencao = renderToStaticMarkup(<SeverityBadge severity="ATENCAO" />);
      const htmlInfo = renderToStaticMarkup(<SeverityBadge severity="INFO" />);

      expect(htmlCritica).toContain('CRÍTICA');
      expect(htmlUrgente).toContain('URGENTE');
      expect(htmlAtencao).toContain('ATENÇÃO');
      expect(htmlInfo).toContain('INFO');
    });
  });

  describe('5. Componente AlertCard (Suporte ao Funil Único de Atenção)', () => {
    it('deve renderizar AlertCard para Saldo Crítico de ARP com ação de drill-down', () => {
      const html = renderToStaticMarkup(
        <AlertCard
          id="alert-arp-1"
          title="Saldo físico da ARP próximo do esgotamento"
          severity="CRITICA"
          entityName="Ata 00049/2025"
          entityType="ARP"
          originSource="v_arp_item_saldo_detalhado"
          description="Item 1 (Servidores) atingiu 92.5% de consumo físico."
          badgeLabel="92.5% consumido"
          actionLabel="Ver Ata"
          targetUrl="#/atas/00049/2025"
        />
      );

      expect(html).toContain('alert-card');
      expect(html).toContain('CRÍTICA');
      expect(html).toContain('Ata 00049/2025');
      expect(html).toContain('v_arp_item_saldo_detalhado');
      expect(html).toContain('Item 1 (Servidores) atingiu 92.5% de consumo físico.');
      expect(html).toContain('Ver Ata');
    });
  });

  describe('6. Componente SectionHeader e FilterBar', () => {
    it('deve renderizar SectionHeader com título, subtítulo e contadores', () => {
      const html = renderToStaticMarkup(
        <SectionHeader
          title="Central de Atenção"
          subtitle="Itens que demandam ação tempestiva"
          countBadge="4 alertas"
        />
      );
      expect(html).toContain('Central de Atenção');
      expect(html).toContain('Itens que demandam ação tempestiva');
      expect(html).toContain('4 alertas');
    });

    it('deve renderizar FilterBar com busca, selects e chips', () => {
      const html = renderToStaticMarkup(
        <FilterBar
          searchValue="Alfa"
          onSearchChange={vi.fn()}
          searchPlaceholder="Buscar contratos..."
          selects={[
            {
              id: 'uasg',
              label: 'UASG',
              value: '200331',
              options: [{ value: '200331', label: '200331 - DTI' }],
              onChange: vi.fn()
            }
          ]}
          chips={[
            { id: 'criticos', label: 'Críticos', active: true, count: 3, onClick: vi.fn() }
          ]}
          hasActiveFilters={true}
          onClearFilters={vi.fn()}
        />
      );

      expect(html).toContain('filter-bar');
      expect(html).toContain('value="Alfa"');
      expect(html).toContain('200331 - DTI');
      expect(html).toContain('Críticos');
      expect(html).toContain('3');
      expect(html).toContain('Limpar Filtros');
    });
  });

  describe('7. Componente DataTable', () => {
    it('deve renderizar DataTable com dados tabulares e alinhamento', () => {
      interface ItemRow {
        id: string;
        nome: string;
        qtd: number;
      }
      const data: ItemRow[] = [
        { id: '1', nome: 'Item Alfa', qtd: 100 },
        { id: '2', nome: 'Item Beta', qtd: 200 }
      ];

      const html = renderToStaticMarkup(
        <DataTable<ItemRow>
          columns={[
            { key: 'nome', header: 'Descrição' },
            { key: 'qtd', header: 'Quantidade', align: 'right' }
          ]}
          data={data}
          keyExtractor={(item) => item.id}
        />
      );

      expect(html).toContain('data-table-container');
      expect(html).toContain('Descrição');
      expect(html).toContain('Quantidade');
      expect(html).toContain('Item Alfa');
      expect(html).toContain('Item Beta');
    });
  });

  describe('8. Componentes EmptyState e ErrorState', () => {
    it('deve renderizar EmptyState com título e descrição contextual', () => {
      const html = renderToStaticMarkup(
        <EmptyState
          title="Nenhum pagamento pendente"
          description="Todos os atestos e liquidações estão em conformidade."
        />
      );
      expect(html).toContain('empty-state');
      expect(html).toContain('Nenhum pagamento pendente');
      expect(html).toContain('Todos os atestos e liquidações estão em conformidade.');
    });

    it('deve renderizar ErrorState com role="alert" e botão de retry', () => {
      const html = renderToStaticMarkup(
        <ErrorState
          title="Falha de Comunicação"
          message="Não foi possível consultar o banco."
          onRetry={vi.fn()}
          retryLabel="Recarregar"
        />
      );
      expect(html).toContain('role="alert"');
      expect(html).toContain('Falha de Comunicação');
      expect(html).toContain('Não foi possível consultar o banco.');
      expect(html).toContain('Recarregar');
    });
  });

  describe('9. Componente SkeletonLoader', () => {
    it('deve renderizar SkeletonLoader com aria-busy="true"', () => {
      const html = renderToStaticMarkup(
        <SkeletonLoader variant="card" count={2} />
      );
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('animate-pulse');
    });
  });

  describe('10. Componente Tabs Acessível WCAG 2.1 AA', () => {
    it('deve renderizar tabs com atributos de acessibilidade (role="tablist", aria-selected)', () => {
      const html = renderToStaticMarkup(
        <Tabs
          tabs={[
            { id: 'geral', label: 'Visão Geral', count: 12 },
            { id: 'financeiro', label: 'Financeiro' },
            { id: 'bloqueada', label: 'Bloqueada', disabled: true }
          ]}
          activeTabId="geral"
          onTabChange={vi.fn()}
        />
      );

      expect(html).toContain('role="tablist"');
      expect(html).toContain('role="tab"');
      expect(html).toContain('aria-selected="true"');
      expect(html).toContain('Visão Geral');
      expect(html).toContain('12');
      expect(html).toContain('disabled=""');
    });
  });

  describe('11. Componente ProgressBar', () => {
    it('deve renderizar ProgressBar com valor, percentual e role="progressbar"', () => {
      const html = renderToStaticMarkup(
        <ProgressBar
          value={88}
          max={100}
          label="Consumo Físico"
          colorScheme="auto"
        />
      );
      expect(html).toContain('role="progressbar"');
      expect(html).toContain('aria-valuenow="88"');
      expect(html).toContain('88.0%');
      expect(html).toContain('Consumo Físico');
    });
  });

  describe('12. Componente Timeline', () => {
    it('deve renderizar timeline de eventos com distinção entre Fato Oficial e Operacional', () => {
      const html = renderToStaticMarkup(
        <Timeline
          events={[
            {
              id: 'ev-1',
              date: '2026-01-15',
              title: 'Assinatura do Contrato',
              category: 'FATO_OFICIAL',
              origin: 'Contratos.gov.br'
            },
            {
              id: 'ev-2',
              date: '2026-06-01',
              title: 'Atesto da Fatura',
              category: 'OPERACIONAL',
              origin: 'SEI'
            }
          ]}
        />
      );

      expect(html).toContain('timeline-container');
      expect(html).toContain('Fato Oficial');
      expect(html).toContain('Assinatura do Contrato');
      expect(html).toContain('Operacional');
      expect(html).toContain('Atesto da Fatura');
    });
  });

  describe('13. Componente TaskCard', () => {
    it('deve renderizar TaskCard com responsável, prazo e modo de execução', () => {
      const html = renderToStaticMarkup(
        <TaskCard
          id="task-1"
          title="Instruir termo aditivo de prorrogação"
          assigneeName="Carlos Silva"
          deadline="2026-10-30"
          daysRemaining={5}
          status="PENDENTE"
          executionMode="MANUAL"
          contextName="Contrato 15/2026"
          onAction={vi.fn()}
        />
      );

      expect(html).toContain('task-card');
      expect(html).toContain('Contrato 15/2026');
      expect(html).toContain('Instruir termo aditivo de prorrogação');
      expect(html).toContain('Carlos Silva');
      expect(html).toContain('2026-10-30');
      expect(html).toContain('Pendente');
      expect(html).toContain('Manual');
      expect(html).toContain('Tratar');
    });
  });

  describe('14. Componente WorkflowStepper', () => {
    it('deve renderizar etapas do workflow com estados (Completed, Current, Pending)', () => {
      const html = renderToStaticMarkup(
        <WorkflowStepper
          steps={[
            { id: '1', title: 'Atesto', state: 'COMPLETED' },
            { id: '2', title: 'Instrução', state: 'CURRENT' },
            { id: '3', title: 'Envio CGOFI', state: 'PENDING' }
          ]}
        />
      );

      expect(html).toContain('workflow-stepper');
      expect(html).toContain('Atesto');
      expect(html).toContain('Instrução');
      expect(html).toContain('Envio CGOFI');
    });
  });
});
