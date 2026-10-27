import { describe, it, expect } from 'vitest';
import { contratadoDoOrgao, destinoSugerido, documentoSeiValido, extratoDaCotaPropria, maximoParaConfirmar, textoDaSituacao } from '../quantitativos';
import { vazioDoItem, type OrgaoQuantitativo, type QuantitativosDoItem } from '../../services/quantitativosService';

// Tablet, ata 00059/2025 item 1: registrado e datas reais; ata assinada de exemplo do protótipo (ensaio de 13/10/2026).
const org = (p: Partial<OrgaoQuantitativo> & { uasg: string }): OrgaoQuantitativo => ({
  nomeOrgao: p.uasg, tipoUnidade: 'PARTICIPANTE', ehSenasp: false, quantidadeAssinada: 0, quantidadeRegistrada: 0, semRegistro: false,
  situacao: 'IGUAL', falta: 0, acima: 0, remanejadoConfirmado: 0, resto: 0, continuaDoOrgao: null, gerenciado: 0, mudou: false,
  mudouEm: null, atualizadoEm: null, ataDaSenasp: true,
  remanejadoNaoParticipante: 0, saidaNaoParticipante: 0, naoParticipanteAguardaFonte: 0, ...p
});
const ORGAOS: OrgaoQuantitativo[] = [
  org({ uasg: '200331', ehSenasp: true, situacao: 'SENASP', quantidadeAssinada: 755, quantidadeRegistrada: 801 }),
  org({ uasg: '200109', quantidadeAssinada: 70, quantidadeRegistrada: 70 }),
  org({ uasg: '450955', situacao: 'REMANEJADO_A_MENOS', quantidadeAssinada: 30, quantidadeRegistrada: 0, falta: 30, resto: 30, mudou: true, mudouEm: '2026-03-31T18:17:56', atualizadoEm: '2026-03-31T18:17:56' }),
  org({ uasg: '453079', situacao: 'GERENCIADO', quantidadeAssinada: 500, quantidadeRegistrada: 464, falta: 36, resto: 36, gerenciado: 36 }),
  org({ uasg: '925957', situacao: 'REMANEJADO_A_MAIS', quantidadeAssinada: 60, quantidadeRegistrada: 110, acima: 50, mudou: true, atualizadoEm: '2026-09-01T11:15:20', mudouEm: '2026-09-01T11:15:20' }),
  org({ uasg: '926016', situacao: 'GERENCIADO', quantidadeAssinada: 30, quantidadeRegistrada: null, semRegistro: true, falta: 30, resto: 30, gerenciado: 30 }),
  org({ uasg: '926477', situacao: 'REMANEJADO_A_MENOS', quantidadeAssinada: 40, quantidadeRegistrada: 0, falta: 40, resto: 40, mudou: true, atualizadoEm: '2026-03-11T09:58:12', mudouEm: '2026-03-11T09:58:12' }),
  org({ uasg: '926969', situacao: 'REMANEJADO_A_MAIS', quantidadeAssinada: 40, quantidadeRegistrada: 100, acima: 60, mudou: true, atualizadoEm: '2026-03-24T14:15:55', mudouEm: '2026-03-24T14:15:55' }),
  org({ uasg: '927134', situacao: 'REMANEJADO_A_MENOS', quantidadeAssinada: 20, quantidadeRegistrada: 0, falta: 20, resto: 20, mudou: true, atualizadoEm: '2026-03-24T14:15:55', mudouEm: '2026-03-24T14:15:55' })
];
const ITEM: QuantitativosDoItem = {
  ...vazioDoItem(), informado: true, documentoSei: '12345678', assinadaSenasp: 755, registradoSenasp: 801,
  gerenciadoParticipantes: 66, cotaPropria: 735, orgaos: ORGAOS
};
const nome = (u: string) => `UASG ${u}`;

describe('destinoSugerido', () => {
  it('liga quem mudou no mesmo segundo e está acima da ata', () => {
    expect(destinoSugerido(ORGAOS, '927134')).toBe('926969');
    expect(destinoSugerido(ORGAOS, '926477')).toBeNull();
    expect(destinoSugerido(ORGAOS, '450955')).toBeNull();
  });
});

describe('extratoDaCotaPropria', () => {
  it('sem confirmações: 755 − 90 cedidos + 70 recebidos = 735, igual à conta do banco', () => {
    const e = extratoDaCotaPropria(ITEM);
    expect(e.cedido).toEqual([{ uasg: '925957', quantidade: 50 }, { uasg: '926969', quantidade: 40 }]);
    expect(e.recebido.map((r) => [r.de, r.quantidade])).toEqual([['450955', 30], ['926477', 40]]);
    expect(e.entre).toEqual([{ de: '927134', para: '926969', quantidade: 20, automatico: true }]);
    expect(e.cota).toBe(735);
    expect(e.confere).toBe(true);
  });

  it('PM-AP confirmada para a SEJUSP-AP: os 60 da SEJUSP ficam explicados e só o Tocantins sai da cota', () => {
    const q: QuantitativosDoItem = {
      ...ITEM,
      orgaos: ORGAOS.map((o) => (o.uasg === '926477' ? { ...o, situacao: 'REMANEJAMENTO_CONFIRMADO', remanejadoConfirmado: 40, resto: 0 } : o)),
      remanejamentos: [{ id: '1', uasgOrigem: '926477', quantidade: 40, uasgDestino: '926969', justificativa: 'ofício', confirmadoPorNome: 'Maria', confirmadoEm: '2026-10-13' }]
    };
    const e = extratoDaCotaPropria(q);
    expect(e.cedido).toEqual([{ uasg: '925957', quantidade: 50 }]);
    expect(e.entre.map((x) => [x.de, x.para, x.quantidade, x.automatico])).toEqual([['926477', '926969', 40, false], ['927134', '926969', 20, true]]);
    expect(e.cota).toBe(735);
    expect(e.confere).toBe(true);
  });

  it('soma que não fecha: o extrato avisa que não confere', () => {
    expect(extratoDaCotaPropria({ ...ITEM, cotaPropria: 700 }).confere).toBe(false);
  });

  it('00062/2024 item 3: os +11 do PR e de GO são registrado acima do homologado, não saíram da SENASP (cota 71)', () => {
    const q: QuantitativosDoItem = {
      ...vazioDoItem(), informado: true, assinadaSenasp: 103, registradoSenasp: 106, cotaPropria: 74, saidaNaoParticipante: 32,
      orgaos: [
        org({ uasg: '200331', ehSenasp: true, situacao: 'SENASP', quantidadeAssinada: 103, quantidadeRegistrada: 106, saidaNaoParticipante: 32 }),
        org({ uasg: '453079', situacao: 'ACIMA_DA_ATA', quantidadeAssinada: 1, quantidadeRegistrada: 11, acima: 10 }),
        org({ uasg: '926903', situacao: 'ACIMA_DA_ATA', quantidadeAssinada: 1, quantidadeRegistrada: 2, acima: 1 })
      ]
    };
    const e = extratoDaCotaPropria(q, { excedente: 14, excedenteSenasp: 3, desconto: 3, resolvido: false });
    expect(e.semLastro).toEqual([{ uasg: '453079', quantidade: 10 }, { uasg: '926903', quantidade: 1 }]);
    expect(e.cedido).toEqual([]);
    expect(e.cota).toBe(71);
    expect(e.confere).toBe(true);
    // Aviso resolvido pelo gestor da ata: volta a valer o remanejamento da SENASP para os órgãos.
    expect(extratoDaCotaPropria(q, { excedente: 14, excedenteSenasp: 3, desconto: 0, resolvido: true }).cota).toBe(60);
  });
});

describe('textoDaSituacao', () => {
  it('usa os nomes aprovados', () => {
    const t = (u: string) => textoDaSituacao(ORGAOS.find((o) => o.uasg === u)!, ITEM, nome);
    expect(t('453079')).toMatchObject({ rotulo: 'Gerenciado pela SENASP · 36', tom: 'info', detalhe: 'desde o registro da ata' });
    expect(t('926016').detalhe).toBe('órgão sem registro no Compras.gov');
    expect(t('450955')).toMatchObject({ rotulo: 'Remanejado · 30 a menos', detalhe: 'em 31/03/2026 · destino não registrado, conta como devolvido à SENASP' });
    expect(t('927134').detalhe).toBe('em 24/03/2026 · para UASG 926969 (mesmo segundo)');
    expect(t('926969')).toMatchObject({ rotulo: 'Remanejado · 60 a mais', detalhe: 'em 24/03/2026 · 20 de UASG 927134 · 40 da cota da SENASP' });
    expect(t('200109').rotulo).toBe('Igual à ata assinada');
  });
});

describe('contratadoDoOrgao', () => {
  const q: QuantitativosDoItem = {
    ...ITEM,
    contratos: [{ uasg: '200122', contratoId: '1', numero: '2025NE000129', tipo: 'Empenho', situacao: 'Ativo', quantidade: 4, valorUnitario: 84.5, valorGlobal: 7071.44, vigenciaFim: '2026-11-25', vistoEm: '2026-10-13' }],
    leituras: new Map([['200122', { lidoEm: 'x', contratosNaUg: 118 }], ['200342', { lidoEm: 'x', contratosNaUg: 147 }], ['926477', { lidoEm: 'x', contratosNaUg: 0 }]])
  };
  it('distingue contrato, zero real, sem fonte e ainda não lido', () => {
    expect(contratadoDoOrgao('200331', true, q, 690)).toEqual({ tipo: 'SENASP', quantidade: 690 });
    expect(contratadoDoOrgao('200122', false, q, 690)).toMatchObject({ tipo: 'CONTRATOS', quantidade: 4 });
    expect(contratadoDoOrgao('200342', false, q, 690)).toEqual({ tipo: 'NENHUM', quantidade: 0 });
    expect(contratadoDoOrgao('926477', false, q, 690)).toEqual({ tipo: 'SEM_FONTE' });
    expect(contratadoDoOrgao('999999', false, q, 690)).toEqual({ tipo: 'NAO_LIDO' });
  });
});

describe('maximoParaConfirmar e documento SEI', () => {
  it('gerenciado: o resto; remanejado a menos: a parte definitiva', () => {
    expect(maximoParaConfirmar(ORGAOS[3])).toBe(36);
    expect(maximoParaConfirmar({ ...ORGAOS[2], gerenciado: 10 })).toBe(20);
    expect(maximoParaConfirmar(ORGAOS[1])).toBe(0);
  });
  it('documento SEI tem 8 dígitos', () => {
    expect(documentoSeiValido('12345678')).toBe(true);
    expect(documentoSeiValido('08020.000000/2025-00')).toBe(false);
  });
});
