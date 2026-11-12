import { describe, expect, it } from 'vitest';
import type { AdesaoItemRecord } from '../../types';
import type { OrgaoQuantitativo, RemanejamentoNaoParticipante } from '../../services/quantitativosService';
import { adesoesNoLimite, livreNaOrigem, regrasDoRemanejamento, uasgDaAdesao, usadoNoLimite } from '../remanejamentoNaoParticipante';

// Munição calibre 12, ata 00047/2024 item 104 (dados reais de 27/10/2026): homologado 258.000, limite 516.000.
const ADESOES: AdesaoItemRecord[] = [
  { numeroAta: '00047/2024', unidadeGerenciadora: '200331', unidadeNaoParticipante: '933027 - ESP-Coord. de Administração - Polícia Penal ', dataAprovacaoAnalise: '2025-10-14T11:44:55', quantidadeAprovadaAdesao: 129000 },
  { numeroAta: '00047/2024', unidadeGerenciadora: '200331', unidadeNaoParticipante: '927505 - SECRETARIA EXECUTIVA DE RESSOCIALIZAÇÃO', dataAprovacaoAnalise: '2025-09-19T11:55:11', quantidadeAprovadaAdesao: 7000 }
];
const rem = (p: Partial<RemanejamentoNaoParticipante>): RemanejamentoNaoParticipante => ({
  id: 'r1', uasgOrigem: '927555', uasgDestino: '927505', nomeDestino: 'Secretaria Executiva de Ressocialização', quantidade: 5000,
  documentoSei: '30203768', justificativa: 'ofício do órgão pedindo', adesoesConhecidas: ['2025-09-19T11:55:11'],
  registradoPorNome: 'Maria', registradoEm: '2026-10-27T12:00:00Z', ...p
});
const org = (p: Partial<OrgaoQuantitativo>): OrgaoQuantitativo => ({
  uasg: '927555', nomeOrgao: null, tipoUnidade: 'PARTICIPANTE', ehSenasp: false, quantidadeAssinada: 20000, quantidadeRegistrada: 20000, semRegistro: false,
  situacao: 'IGUAL', falta: 0, acima: 0, remanejadoConfirmado: 0, resto: 0, continuaDoOrgao: null, gerenciado: 0, mudou: false,
  mudouEm: null, atualizadoEm: null, ataDaSenasp: true, remanejadoNaoParticipante: 0, saidaNaoParticipante: 0, naoParticipanteAguardaFonte: 0, ...p
});
const fmt = (n: number) => String(n);

describe('adesões no limite', () => {
  it('tira a UASG do texto da adesão', () => {
    expect(uasgDaAdesao(ADESOES[0])).toBe('933027');
    expect(uasgDaAdesao({ unidadeNaoParticipante: 'SEM CÓDIGO' })).toBe('');
  });

  it('sem remanejamento, todas contam', () => {
    expect(adesoesNoLimite(ADESOES, [], []).map((a) => a.situacao)).toEqual(['CONTA', 'CONTA']);
  });

  it('adesão que a UASG já tinha quando o remanejamento foi registrado continua contando', () => {
    expect(adesoesNoLimite(ADESOES, [rem({})], [])[1].situacao).toBe('CONTA');
  });

  it('adesão nova da mesma UASG fica a conferir até o gestor decidir', () => {
    const r = rem({ adesoesConhecidas: [] });
    expect(adesoesNoLimite(ADESOES, [r], [])[1].situacao).toBe('A_CONFERIR');
    const mesmo = adesoesNoLimite(ADESOES, [r], [{ uasg: '927505', aprovadaEm: '2025-09-19T11:55:11', remanejamentoId: 'r1', decisao: 'MESMO', decididoPorNome: 'Maria', decididoEm: 'x' }]);
    expect(mesmo[1].situacao).toBe('MESMO');
    const dif = adesoesNoLimite(ADESOES, [r], [{ uasg: '927505', aprovadaEm: '2025-09-19T11:55:11', remanejamentoId: 'r1', decisao: 'DIFERENTES', decididoPorNome: 'Maria', decididoEm: 'x' }]);
    expect(dif[1].situacao).toBe('CONTA');
  });

  it('o usado soma as adesões que contam e os remanejamentos, no total e por UASG', () => {
    const r = rem({});
    const lista = adesoesNoLimite(ADESOES, [r], []);
    expect(usadoNoLimite(lista, [r])).toEqual({ adesoes: 136000, remanejado: 5000, total: 141000 });
    expect(usadoNoLimite(lista, [r], '927505').total).toBe(12000);
    // A conferir não conta: o remanejamento conta uma vez só.
    const conferir = rem({ adesoesConhecidas: [] });
    expect(usadoNoLimite(adesoesNoLimite(ADESOES, [conferir], []), [conferir], '927505').total).toBe(5000);
  });
});

describe('livre na origem', () => {
  it('SENASP: cota (base do saldo) menos o alocado', () => {
    // Haltere, ata 00094/2024 item 48: cota 379, CAEP 340.
    expect(livreNaOrigem({ orgao: org({ uasg: '200331', ehSenasp: true }), baseSaldo: 379, alocado: 340, contratado: 0 })).toBe(39);
  });

  it('participante: registrado + redução sem destino − contratado − já remanejado', () => {
    expect(livreNaOrigem({ orgao: org({}), baseSaldo: 0, alocado: 0, contratado: 0 })).toBe(20000);
    expect(livreNaOrigem({ orgao: org({ naoParticipanteAguardaFonte: 5000 }), baseSaldo: 0, alocado: 0, contratado: 1000 })).toBe(14000);
    expect(livreNaOrigem({ orgao: org({ quantidadeRegistrada: 0, resto: 87000, situacao: 'REMANEJADO_A_MENOS' }), baseSaldo: 0, alocado: 0, contratado: 0 })).toBe(87000);
  });
});

describe('regras do remanejamento', () => {
  const base = { origem: { livre: 20000, conta: 'registrado 20000' }, homologado: 258000, limiteAdesao: 516000, remanejamentos: [], fmt };

  it('sem destino, só a regra da origem', () => {
    expect(regrasDoRemanejamento({ ...base, destino: null, adesoes: adesoesNoLimite(ADESOES, [], []) }).map((r) => r.chave)).toEqual(['ORIGEM']);
  });

  it('UASG que já tem 50% do item não recebe mais', () => {
    const regras = regrasDoRemanejamento({ ...base, destino: '933027', adesoes: adesoesNoLimite(ADESOES, [], []) });
    expect(regras.find((r) => r.chave === 'POR_ORGAO')).toMatchObject({ livre: 0, conta: 'máximo 129000 − já tem 129000' });
    expect(regras.find((r) => r.chave === 'TOTAL')).toMatchObject({ livre: 380000 });
  });

  it('UASG com 7.000 pode receber até 122.000 pelos 50%', () => {
    const regras = regrasDoRemanejamento({ ...base, destino: '927505', adesoes: adesoesNoLimite(ADESOES, [], []) });
    expect(regras.find((r) => r.chave === 'POR_ORGAO')?.livre).toBe(122000);
  });
});
