import { describe, it, expect } from 'vitest';
import type { ArpRecord } from '../../types';
import type { ResumoReajusteAta } from '../reajusteAtasService';
import { avisosDoReajusteDasAtas, chaveAvisoReajusteAta } from '../reajusteAtasAvisos';

const HOJE = new Date('2026-10-23T12:00:00Z');
const arp = (numero: string, uasg = '200331') => ({ numeroAtaRegistroPreco: numero, codigoUnidadeGerenciadora: uasg, objeto: `Objeto da ata ${numero}` }) as ArpRecord;
const resumo = (r: Partial<ResumoReajusteAta> & { numeroAta: string }): ResumoReajusteAta => ({
  ataId: `id-${r.numeroAta}`, codigoUasg: '200331', ataKey: r.numeroAta, indice: 'IPCA', clausula: 'COM_REAJUSTE', dataBaseOrigem: 'APOSTILAMENTO',
  dataBase: '2025-02-01', itens: 1, percentualAInformar: 0, indiceIndisponivel: 0, precoDesatualizado: 0, devido: 0, previsto: 0, seProrrogar: 0,
  emDia: 1, proximoEfeito: null, proximoSituacao: null, proximoPercentual: null, situacao: 'EM_DIA', fonteDiferente: 0, reservasDeEmenda: 0, ...r
});

describe('avisosDoReajusteDasAtas', () => {
  it('só as atas que estão no painel (escopo do gestor e UASG)', () => {
    const r = [resumo({ numeroAta: '00032/2025', situacao: 'PRECO_DESATUALIZADO', precoDesatualizado: 1 }), resumo({ numeroAta: '00099/2025', situacao: 'DEVIDO', devido: 2 })];
    const avisos = avisosDoReajusteDasAtas(r, [arp('00032/2025')], HOJE);
    expect(avisos.map((a) => a.numeroAta)).toEqual(['00032/2025']);
    expect(avisosDoReajusteDasAtas(r, [arp('00032/2025', '200330')], HOJE)).toEqual([]);
  });

  it('preço sem o reajuste: informar o preço do apostilamento, com link para a aba Reajuste e chave de resolvido', () => {
    const [a] = avisosDoReajusteDasAtas([resumo({ numeroAta: '00032/2025', situacao: 'PRECO_DESATUALIZADO', precoDesatualizado: 1, proximoEfeito: null })], [arp('00032/2025')], HOJE);
    expect(a).toMatchObject({
      category: 'REAJUSTE_ATA',
      severity: 'ATENCAO',
      title: 'Informar o preço do apostilamento',
      targetUrl: '/atas/detalhe/00032%2F2025-200331?aba=reajuste',
      motivoDetalhe: { chave: 'preco-sem-reajuste', label: 'Ata: preço do apostilamento a informar' },
      avisoChave: 'REAJUSTE::ATA-00032/2025-200331::preco-sem-reajuste-2025-02-01'
    });
  });

  it('preço do apostilamento é urgente quando há reserva de emenda esperando (migration 247)', () => {
    const [a] = avisosDoReajusteDasAtas([resumo({ numeroAta: '00032/2025', situacao: 'PRECO_DESATUALIZADO', precoDesatualizado: 1, reservasDeEmenda: 3 })], [arp('00032/2025')], HOJE);
    expect(a).toMatchObject({ severity: 'URGENTE', badgeLabel: '3 reservas' });
    expect(a.description).toContain('3 reservas de emenda esperam o preço');
  });

  it('preço da fonte diferente do informado: conferir', () => {
    const [a] = avisosDoReajusteDasAtas([resumo({ numeroAta: '00032/2025', fonteDiferente: 1 })], [arp('00032/2025')], HOJE);
    expect(a).toMatchObject({ severity: 'ATENCAO', title: 'Conferir o preço do apostilamento', motivoDetalhe: { chave: 'fonte-diferente', label: 'Ata: preço da fonte diferente do apostilamento' } });
  });

  it('reajuste devido é urgente e diz quando a data-base é só a sugestão do edital', () => {
    const [a] = avisosDoReajusteDasAtas([resumo({ numeroAta: '00039/2026', situacao: 'DEVIDO', devido: 3, dataBaseOrigem: 'EDITAL' })], [arp('00039/2026')], HOJE);
    expect(a).toMatchObject({ severity: 'URGENTE', title: 'Reajuste devido', badgeLabel: '3 itens' });
    expect(a.description).toBe('Ata 00039/2026: 3 itens com reajuste vencido sem apostilamento publicado (data-base sugerida pelo edital)');
  });

  it('termo a informar só quando o próximo reajuste está a até 90 dias', () => {
    const perto = resumo({ numeroAta: '00001/2026', situacao: 'TERMO_A_INFORMAR', dataBaseOrigem: 'EDITAL', proximoEfeito: '2026-12-15', proximoPercentual: 4.2 });
    const longe = resumo({ numeroAta: '00002/2026', situacao: 'TERMO_A_INFORMAR', dataBaseOrigem: 'EDITAL', proximoEfeito: '2027-07-29' });
    const avisos = avisosDoReajusteDasAtas([perto, longe], [arp('00001/2026'), arp('00002/2026')], HOJE);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ title: 'Informar o Termo de Conformidade', severity: 'INFO', badgeLabel: '53 dias', dataAlvo: '2026-12-15' });
  });

  it('reajuste previsto e na prorrogação dentro da janela do radar', () => {
    const previsto = resumo({ numeroAta: '00010/2026', situacao: 'PREVISTO', proximoEfeito: '2026-11-10', proximoSituacao: 'PREVISTO', proximoPercentual: 4.33 });
    const prorrogar = resumo({ numeroAta: '00011/2026', situacao: 'SE_PRORROGAR', proximoEfeito: '2026-12-01', proximoSituacao: 'SE_PRORROGAR', proximoPercentual: 4.22 });
    const fora = resumo({ numeroAta: '00012/2026', situacao: 'PREVISTO', proximoEfeito: '2027-06-11', proximoSituacao: 'PREVISTO' });
    const avisos = avisosDoReajusteDasAtas([previsto, prorrogar, fora], [arp('00010/2026'), arp('00011/2026'), arp('00012/2026')], HOJE);
    expect(avisos.map((a) => [a.numeroAta, a.title, a.severity])).toEqual([
      ['00010/2026', 'Reajuste previsto', 'ATENCAO'],
      ['00011/2026', 'Reajuste na prorrogação', 'INFO']
    ]);
    expect(avisos[0].description).toBe('Ata 00010/2026: reajuste estimado de 4,33% em 10/11/2026');
    expect(avisos[1].description).toBe('Ata 00011/2026: se for prorrogada em 01/12/2026, o termo aditivo leva o reajuste estimado de 4,22%');
  });

  it('em dia, sem cláusula ou índice sem dados: sem aviso', () => {
    const r = [resumo({ numeroAta: 'a' }), resumo({ numeroAta: 'b', situacao: 'SEM_REAJUSTE' }), resumo({ numeroAta: 'c', situacao: 'INDICE_INDISPONIVEL' })];
    expect(avisosDoReajusteDasAtas(r, [arp('a'), arp('b'), arp('c')], HOJE)).toEqual([]);
  });

  it('a chave muda com o marco: o aviso volta no ciclo seguinte', () => {
    expect(chaveAvisoReajusteAta('00010/2026', '200331', 'previsto', '2026-11-10')).not.toBe(chaveAvisoReajusteAta('00010/2026', '200331', 'previsto', '2027-11-10'));
  });
});
