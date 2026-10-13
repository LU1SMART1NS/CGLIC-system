import { describe, it, expect } from 'vitest';
import { adesoesComInformadas, adesoesDaSenasp, mudaramComASenasp, papelDoItem, uasgDaAdesao } from '../quantitativosOutroOrgao';
import type { AdesaoItemRecord, UnidadeItemRecord } from '../../types';

const ad = (u: string, d: string, q: number | null): AdesaoItemRecord => ({ numeroAta: '00003/2025', unidadeGerenciadora: '200334', unidadeNaoParticipante: u, dataAprovacaoAnalise: d, quantidadeAprovadaAdesao: q });
const SENASP = '200331 - SECRETARIA NACIONAL DE SEGURANCA PUBLICA - SENASP';
const un = (codigoUnidade: string, tipoUnidade: string, dataHoraAtualizacao = '2025-10-30T14:52:41', dataHoraInclusao = '2025-10-30T14:52:41') =>
  ({ codigoUnidade, tipoUnidade, dataHoraAtualizacao, dataHoraInclusao, nomeUnidade: codigoUnidade } as UnidadeItemRecord);

describe('quantitativosOutroOrgao', () => {
  it('UASG de quem aderiu', () => {
    expect(uasgDaAdesao({ unidadeNaoParticipante: SENASP })).toBe('200331');
    expect(uasgDaAdesao({ unidadeNaoParticipante: 'sem código' })).toBe('');
  });

  it('só as adesões da SENASP, da mais antiga para a mais nova', () => {
    const l = adesoesDaSenasp([ad(SENASP, '2026-10-02T09:57:35', 4), ad('200326 - DEPEN', '2025-07-07T10:57:31', 5), ad(SENASP, '2026-07-10T11:29:13', 1)]);
    expect(l.map((a) => a.quantidadeAprovadaAdesao)).toEqual([1, 4]);
  });

  it('papel do item: participante pela lista de órgãos, adesão pelas adesões, senão o da ata', () => {
    expect(papelDoItem('GERENCIADORA', [], [])).toBe('GERENCIADORA');
    expect(papelDoItem('PARTICIPANTE', [un('200342', 'GERENCIADORA'), un('200331', 'PARTICIPANTE')], [])).toBe('PARTICIPANTE');
    expect(papelDoItem('PARTICIPANTE', [un('200334', 'GERENCIADORA')], [ad(SENASP, '2026-10-02T09:57:35', 4)])).toBe('ADESAO');
    expect(papelDoItem('ADESAO', [], [])).toBe('ADESAO');
  });

  it('a fonte vale; sem ela, a informada à mão; sem as duas, falta informar', () => {
    const l = adesoesComInformadas(
      [ad(SENASP, '2026-07-10T11:29:13', 1), ad(SENASP, '2026-10-02T09:57:35', null), ad('200330 - SENASP', '2026-10-05T08:00:00', null)],
      [{ uasg: '200331', aprovadaEm: '2026-10-02T09:57:35', quantidade: 4, documentoSei: '12345678', justificativa: null, informadoPorNome: 'Maria', informadoEm: 'x' },
       { uasg: '200331', aprovadaEm: '2026-07-10T11:29:13', quantidade: 9, documentoSei: '12345678', justificativa: null, informadoPorNome: 'Maria', informadoEm: 'x' }]
    );
    expect(l.map((a) => a.quantidade)).toEqual([1, 4, null]);
    expect(l[0].informada).toBeNull();
    expect(l[1].informada?.documentoSei).toBe('12345678');
  });

  it('quem mudou no mesmo segundo que a SENASP', () => {
    const l = mudaramComASenasp([un('200342', 'GERENCIADORA', '2026-07-09T17:12:22'), un('200005', 'PARTICIPANTE', '2026-10-06T16:47:39'), un('200331', 'PARTICIPANTE', '2026-10-06T16:47:39')]);
    expect(l.map((u) => u.codigoUnidade)).toEqual(['200005']);
    expect(mudaramComASenasp([un('200331', 'PARTICIPANTE'), un('200005', 'PARTICIPANTE')])).toEqual([]);
  });
});
