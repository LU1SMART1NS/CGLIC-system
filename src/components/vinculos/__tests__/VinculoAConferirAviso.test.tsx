import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { vinculoDaLinha } from '../../../services/vinculosAConferirService';

const ITEM = '00043/2026-200331-00003';
const CONTRATO = '200331-00297-2026';

const vinculo = vinculoDaLinha({
  item_key: ITEM,
  contract_key: CONTRATO,
  motivo: 'OUTRO_FORNECEDOR',
  detectado_em: '2026-10-13T14:00:00+00:00',
  gestor_ata: 'Alan Jonne',
  gestor_contrato: 'Alan Jonne',
  quantidade_fonte: 500,
  quantidade_ajustada: 480,
  ajuste_justificativa: 'Fonte atrasada, contrato aditivado',
  ajustado_por_nome: 'Daniel Espíndola',
  dividido_por_nome: 'Daniel Espíndola',
  quantidade_dividida: 480
});

const estado = { podeDecidir: false, vinculos: [vinculo] };
vi.mock('../../../hooks/useVinculosAConferir', () => ({
  useVinculosAConferir: () => ({
    vinculos: estado.vinculos,
    porPar: new Map(estado.vinculos.map((v) => [`${v.itemKey}|${v.contractKey}`, v])),
    isLoading: false,
    podeDecidir: estado.podeDecidir,
    manter: { isPending: false, mutateAsync: vi.fn() },
    retirar: { isPending: false, mutateAsync: vi.fn() }
  })
}));

import { VinculoAConferirAviso } from '../VinculoAConferirAviso';

beforeEach(() => {
  estado.podeDecidir = false;
  estado.vinculos = [vinculo];
});

const html = (props: Partial<React.ComponentProps<typeof VinculoAConferirAviso>> = {}) =>
  renderToStaticMarkup(<VinculoAConferirAviso itemKey={ITEM} contractKey={CONTRATO} {...props} />);

describe('VinculoAConferirAviso', () => {
  it('sem marca no par, não mostra nada', () => {
    estado.vinculos = [];
    expect(html()).toBe('');
    expect(html({ formato: 'selo' })).toBe('');
  });

  it('todos veem o aviso com o motivo e o trabalho do gestor, mas só o coordenador decide', () => {
    const out = html();
    expect(out).toContain('vinculo-a-conferir-aviso');
    expect(out).toContain('fornecedor do contrato não é o da ata');
    expect(out).toContain('quantidade ajustada para 480 por Daniel Espíndola');
    expect(out).toContain('O coordenador decide se mantém ou retira');
    expect(out).not.toContain('vinculo-conferir"');
  });

  it('o coordenador vê o botão Conferir', () => {
    estado.podeDecidir = true;
    const out = html();
    expect(out).toContain('Decida se mantém ou retira');
    expect(out).toContain('data-testid="vinculo-conferir"');
  });

  it('no formato selo mostra o selo pequeno; o botão só para o coordenador', () => {
    expect(html({ formato: 'selo' })).toContain('Vínculo a conferir');
    expect(html({ formato: 'selo' })).not.toContain('vinculo-conferir"');
    estado.podeDecidir = true;
    expect(html({ formato: 'selo' })).toContain('data-testid="vinculo-conferir"');
  });
});
