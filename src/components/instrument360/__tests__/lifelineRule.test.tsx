import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LifelineRule } from '../HealthStripParts';
import type { ContractLifeline, LifelineMilestone } from '../../../services/contractLifelineService';

const marco = (over: Partial<LifelineMilestone>): LifelineMilestone => ({
  id: 'm',
  label: 'Início da Análise de Prorrogação (180d)',
  date: '2027-01-08',
  pct: 50.7,
  diasRestantes: 98,
  state: 'FUTURO',
  ...over
});

const vida = (over: Partial<ContractLifeline> = {}): ContractLifeline => ({
  start: '2026-07-07',
  end: '2027-07-07',
  todayPct: 23.8,
  diasParaFim: 278,
  milestones: [],
  ...over
});

const render = (lifeline: ContractLifeline | null) => renderToStaticMarkup(<LifelineRule lifeline={lifeline} testId="lr" />);

describe('LifelineRule', () => {
  it('sem vigência, avisa em texto', () => {
    expect(render(null)).toContain('Vigência não informada.');
  });

  it('mostra só "Hoje" e o texto do próximo marco; não há legenda nem lista de marcos', () => {
    const html = render(
      vida({
        milestones: [
          marco({ id: 'a', label: 'Reajuste (12 meses)', date: '2026-06-01', pct: -5, diasRestantes: -123, state: 'PASSADO' }),
          marco({ id: 'b' }),
          marco({ id: 'c', label: 'Remessa aos Órgãos de Controle (60d)', date: '2027-05-08', pct: 83.6, diasRestantes: 218 })
        ]
      })
    );
    expect(html).toContain('Hoje');
    expect(html).toContain('Início da análise de prorrogação · 08/01/2027');
    expect(html).toContain('1 marco já passou');
    // marcos além do próximo viram só traço, com nome e data na dica
    expect(html).toContain('Remessa aos Órgãos de Controle (60d) · 08/05/2027 · em 218 dias');
    expect(html).not.toContain('cumprido');
    expect(html).not.toContain('atrasado');
  });

  it('com todos os marcos já passados, não inventa próximo marco', () => {
    const html = render(
      vida({
        todayPct: 97.8,
        milestones: [
          marco({ id: 'a', label: 'Planejamento de Prorrogação da Ata (180d)', pct: 50.7, diasRestantes: -172, state: 'PASSADO' }),
          marco({ id: 'b', label: 'Alerta de Exaustão de Vigência da ARP (90d)', pct: 75.3, diasRestantes: -82, state: 'PASSADO' })
        ]
      })
    );
    expect(html).toContain('2 marcos já passaram');
    expect(html).not.toMatch(/Planejar nova licitação ·/);
    expect(html).toContain('Planejamento de Prorrogação da Ata (180d)');
  });

  it('marco colado no fim vira o próprio marcador de fim, sem anel separado', () => {
    const colado = render(vida({ milestones: [marco({ id: 'r', label: 'Reajuste (24 meses)', date: '2026-11-14', pct: 99.9, diasRestantes: 43, state: 'PROXIMO' })] }));
    expect(colado).toContain('Fim da vigência · 07/07/2027. Reajuste (24 meses) · 14/11/2026');
    const separado = render(vida({ milestones: [marco({ id: 'r', pct: 50 })] }));
    expect(separado).toContain('Fim da vigência · 07/07/2027');
    expect(separado).not.toContain('Fim da vigência · 07/07/2027. ');
  });

  it('termos do histórico viram losangos e a contagem substitui "marcos já passaram"', () => {
    const html = render(
      vida({
        milestones: [marco({ id: 'a', state: 'PASSADO', diasRestantes: -10, pct: 10 })],
        events: [
          { id: 'a', label: 'Termo de Apostilamento 00001/2025', date: '2025-05-07', pct: 14.1 },
          { id: 'b', label: 'Termo Aditivo 00002/2026', date: '2026-04-28', pct: 33.6 }
        ]
      })
    );
    expect(html).toContain('2 termos registrados');
    expect(html).not.toContain('marco já passou');
    expect(html).toContain('Termo de Apostilamento 00001/2025 · 07/05/2025');
  });

  it('termos próximos viram uma marca com a contagem', () => {
    const html = render(
      vida({
        events: [
          { id: 'a', label: 'Termo A', date: '2025-08-22', pct: 20 },
          { id: 'b', label: 'Termo B', date: '2025-08-30', pct: 20.3 }
        ]
      })
    );
    expect(html.match(/role="img"/g)).toHaveLength(2); // a barra e a marca única
    expect(html).toContain('Termo A · 22/08/2025');
    expect(html).toContain('Termo B · 30/08/2025');
  });

  it('não desenha "Hoje" fora da vigência', () => {
    expect(render(vida({ todayPct: 100 }))).not.toContain('Hoje');
    expect(render(vida({ todayPct: 0 }))).not.toContain('Hoje');
  });
});
