import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import { ManagerCell, canAssignManager, destinoContratoSemGestor } from '../ManagerAssign';

describe('ManagerCell — coluna Gestor das carteiras', () => {
  it('só o coordenador (admin) atribui gestor', () => {
    expect(canAssignManager('admin')).toBe(true);
    expect(canAssignManager('gestor')).toBe(false);
    expect(canAssignManager('leitor')).toBe(false);
    expect(canAssignManager('gestor_saldos')).toBe(false);
  });

  it('mostra só o nome, sem ação de atribuir, mesmo para o coordenador', () => {
    const html = renderToStaticMarkup(<ManagerCell gestorNome="Maria" canAssign testId="t" />);
    expect(html).toContain('Maria');
    expect(html).not.toContain('<button');
  });

  it('sem gestor: traço para quem não atribui; atalho para a Central para o coordenador', () => {
    expect(renderToStaticMarkup(<ManagerCell canAssign={false} testId="t" />)).toContain('—');
    const coordenador = renderToStaticMarkup(<ManagerCell canAssign testId="t" />);
    expect(coordenador).toContain('atribuir na Central');
  });

  it('com destino, o atalho usa o rótulo e o endereço dele', () => {
    const html = renderToStaticMarkup(<ManagerCell canAssign testId="t" destino={{ rotulo: 'Sem ata · vincular', para: '/x', dica: 'd' }} />);
    expect(html).toContain('Sem ata · vincular');
    expect(html).not.toContain('atribuir na Central');
  });
});

describe('destinoContratoSemGestor — para onde vai o contrato sem gestor', () => {
  const comGestor = new Set(['00001/2025']);
  const ataTemGestor = (n: string) => comGestor.has(n);

  it('sem vínculo: Vinculação › Contratos à ata, filtrada pelo número', () => {
    const d = destinoContratoSemGestor({ numero: '00156/2025', atas: [], naoPertenceAAta: false, ataTemGestor });
    expect(d.rotulo).toBe('Sem ata · vincular');
    expect(d.para).toBe('/vinculacao/contratos?busca=00156%2F2025');
  });

  it('marcado "não pertence a ata": Vinculação já na situação dos marcados', () => {
    const d = destinoContratoSemGestor({ numero: '00156/2025', atas: [], naoPertenceAAta: true, ataTemGestor });
    expect(d.rotulo).toBe('Sem gestor · atribuir');
    expect(d.para).toBe('/vinculacao/contratos?situacao=NAO_PERTENCE&busca=00156%2F2025');
  });

  it('vinculado a ata sem gestor: Central, dizendo qual ata', () => {
    const d = destinoContratoSemGestor({ numero: '00156/2025', atas: ['00001/2025', '00002/2025'], naoPertenceAAta: false, ataTemGestor });
    expect(d.rotulo).toBe('Ata sem gestor · Central');
    expect(d.para).toBe('/atas/distribuicao');
    expect(d.dica).toContain('00002/2025');
  });

  it('vínculo vale mais que a marcação antiga de "não pertence"', () => {
    const d = destinoContratoSemGestor({ numero: '1/2025', atas: ['00009/2025'], naoPertenceAAta: true, ataTemGestor });
    expect(d.para).toBe('/atas/distribuicao');
  });
});
