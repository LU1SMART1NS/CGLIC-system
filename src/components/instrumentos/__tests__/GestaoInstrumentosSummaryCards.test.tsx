import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GestaoInstrumentosSummaryCards, type GestaoInstrumentosCounts } from '../GestaoInstrumentosSummaryCards';

const counts: GestaoInstrumentosCounts = {
  totalAtas: 156, itensCriticosArp: 31, itensProximosLimiteArp: 43,
  contratosAtivos: 413, contratosEmAtencao60a90d: 81, contratosEmProrrogacao: 200, contratosAVencer30d: 24,
  valorVigenteTotal: 1000, totalEmpenhado: 400,
  criticalCount: 6, totalAlertasAtivos: 68, urgenteCount: 22, atencaoCount: 40
};

const render = (saldosOnly: boolean) =>
  renderToStaticMarkup(
    <GestaoInstrumentosSummaryCards counts={counts} activeCard={null} onSelectCard={() => {}} saldosOnly={saldosOnly} />
  );

describe('GestaoInstrumentosSummaryCards — cards da Visão Geral', () => {
  it('coordenador vê os 4 cards, com o card de Alertas Críticos', () => {
    const html = render(false);
    for (const id of ['arp', 'contratos', 'valor', 'alertas']) expect(html).toContain(`instrumentos-card-${id}`);
    expect(html).toContain('Alertas Críticos');
    expect(html).toContain('Pendências totais');
  });

  it('Gestor de Saldo vê Atas e Alertas de Saldo, sem contratos e valor', () => {
    const html = render(true);
    expect(html).toContain('instrumentos-card-arp');
    expect(html).toContain('instrumentos-card-alertas');
    expect(html).not.toContain('instrumentos-card-contratos');
    expect(html).not.toContain('instrumentos-card-valor');
    expect(html).toContain('Alertas de Saldo');
    expect(html).toContain('itens esgotados');
    expect(html).toContain('Pendências de saldo');
    expect(html).toContain('Urgentes (acima de 80%)');
    expect(html).toContain('Em atenção (50–80%)');
    expect(html).not.toContain('Alertas Críticos');
  });
});
