import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GestaoInstrumentosDockStrip } from '../GestaoInstrumentosDockStrip';
import type { GestaoInstrumentosCounts } from '../GestaoInstrumentosSummaryCards';

const counts: GestaoInstrumentosCounts = {
  totalAtas: 156, itensCriticosArp: 31, itensProximosLimiteArp: 43,
  contratosAtivos: 413, contratosEmAtencao60a90d: 81, contratosEmProrrogacao: 200, contratosAVencer30d: 24,
  valorVigenteTotal: 1000, totalEmpenhado: 400,
  criticalCount: 6, totalAlertasAtivos: 68, urgenteCount: 22, atencaoCount: 40
};

const render = (saldosOnly: boolean) =>
  renderToStaticMarkup(
    <GestaoInstrumentosDockStrip counts={counts} activeCard="ARP" onSelectCard={() => {}} saldosOnly={saldosOnly} />
  );

describe('GestaoInstrumentosDockStrip — faixa dos cartões encolhidos', () => {
  it('coordenador vê os quatro números, com o filtro ativo marcado', () => {
    const html = render(false);
    for (const id of ['ARP', 'CONTRATOS', 'VALOR', 'ALERTAS']) expect(html).toContain(`instrumentos-dock-chip-${id}`);
    expect(html).toMatch(/aria-pressed="true"[^>]*instrumentos-dock-chip-ARP/);
    expect(html).toContain('Críticos');
  });

  it('Gestor de Saldo vê só Atas e Esgotados', () => {
    const html = render(true);
    expect(html).not.toContain('instrumentos-dock-chip-CONTRATOS');
    expect(html).not.toContain('instrumentos-dock-chip-VALOR');
    expect(html).toContain('Esgotados');
  });

  it('fora do bloco encolhido, a faixa fica escondida e fora do Tab', () => {
    const html = render(false);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('tabindex="0"');
  });
});
