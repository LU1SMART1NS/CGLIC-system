import { describe, it, expect } from 'vitest';
import {
  resumirSincronizacao,
  podeForcarAtualizacao,
  podeSincronizarContratos
} from '../useSincronizacaoContratos';
import type { SincronizacaoFonteStatus } from '../../services/contratosOficiaisService';

const UASGS = ['200330', '200331'] as const;

function status(uasg: string, extra: Partial<SincronizacaoFonteStatus> = {}): SincronizacaoFonteStatus {
  return {
    recurso: 'contratos',
    uasg,
    emAndamentoDesde: null,
    ultimaTentativaEm: '2026-10-06T10:00:00Z',
    ultimoSucessoEm: '2026-10-06T10:00:00Z',
    ultimoStatus: 'SUCESSO',
    fontesComFalha: [],
    totalRegistros: 10,
    mensagem: null,
    ...extra
  };
}

describe('resumirSincronizacao', () => {
  it('"atualizado em" é o último sucesso mais antigo entre as UASGs', () => {
    const r = resumirSincronizacao(
      [status('200330', { ultimoSucessoEm: '2026-10-06T08:00:00Z' }), status('200331', { ultimoSucessoEm: '2026-10-06T12:00:00Z' })],
      UASGS
    );
    expect(r.ultimoSucessoEm).toBe('2026-10-06T08:00:00Z');
    expect(r.nuncaSincronizado).toBe(false);
    expect(r.incompleta).toBe(false);
  });

  it('sem sucesso em alguma UASG, não informa data (a carteira não está toda em dia)', () => {
    const r = resumirSincronizacao([status('200330')], UASGS);
    expect(r.ultimoSucessoEm).toBeNull();
    expect(resumirSincronizacao([], UASGS).nuncaSincronizado).toBe(true);
  });

  it('última tentativa PARCIAL ou ERRO: aviso de incompleta com as fontes que falharam, sem repetir', () => {
    const r = resumirSincronizacao(
      [
        status('200330', { ultimoStatus: 'PARCIAL', fontesComFalha: ['Contratos.gov.br'] }),
        status('200331', { ultimoStatus: 'ERRO', fontesComFalha: ['Contratos.gov.br', 'Compras.gov.br'] })
      ],
      UASGS
    );
    expect(r.incompleta).toBe(true);
    expect(r.fontesComFalha).toEqual(['Contratos.gov.br', 'Compras.gov.br']);
  });

  it('trava com menos de 10 minutos conta como sincronização em andamento; trava velha não', () => {
    const agora = new Date().toISOString();
    const velha = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    expect(resumirSincronizacao([status('200330', { emAndamentoDesde: agora })], UASGS).emAndamentoNoBanco).toBe(true);
    expect(resumirSincronizacao([status('200330', { emAndamentoDesde: velha })], UASGS).emAndamentoNoBanco).toBe(false);
  });
});

describe('perfis', () => {
  it('gestor e coordenador sincronizam em segundo plano; consulta e gestor de saldos não', () => {
    expect(podeSincronizarContratos('gestor')).toBe(true);
    expect(podeSincronizarContratos('admin')).toBe(true);
    expect(podeSincronizarContratos('leitor')).toBe(false);
    expect(podeSincronizarContratos('gestor_saldos')).toBe(false);
    expect(podeSincronizarContratos(null)).toBe(false);
  });

  it('só o coordenador (admin) força a atualização', () => {
    expect(podeForcarAtualizacao('admin')).toBe(true);
    expect(podeForcarAtualizacao('gestor')).toBe(false);
  });
});
