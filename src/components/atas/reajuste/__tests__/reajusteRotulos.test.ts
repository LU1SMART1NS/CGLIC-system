import { describe, it, expect } from 'vitest';
import type { CicloReajuste, ItemReajuste, ParametrosReajuste, ReajusteDaAta } from '../../../../services/reajusteAtasService';
import { avisoDaAba, contarComAcao, dataBaseNaTela, impactoDoItem, mesPorExtenso, percentual, piorSituacao, quadroDoCartao, totaisDaAta } from '../reajusteRotulos';

const HOJE = new Date('2026-10-23T12:00:00Z');

const par = (p: Partial<ParametrosReajuste> = {}): ParametrosReajuste => ({
  ataId: 'ata', indice: 'IPCA', clausula: 'COM_REAJUSTE', dataOrcamentoEdital: null, termoMesApostilamento: null, termoSeiApostilamento: null,
  termoData: null, termoSei: null, termoInformadoEm: null, versao: 1, ...p
});
const ciclo = (c: Partial<CicloReajuste>): CicloReajuste => ({
  ciclo: 1, dataBase: '2025-02-01', aniversario: '2026-02-01', efeitoInicio: '2026-06-27', situacao: 'APLICADO', percentual: 4.44,
  percentualCalculado: 4.44, mesesEstimados: 0, periodoInicio: '2025-02-01', periodoFim: '2026-01-01', reajusteId: 'r1', ...c
});
const item = (i: Partial<ItemReajuste>): ItemReajuste => ({
  numeroItem: '00001', precoHomologado: 355230, homologadoLido: true, precoAtual: 355230, percentualNoPreco: 0, precoDevido: 355230,
  precoAplicado: 355230, situacao: 'EM_DIA', proximoEfeito: null, proximoSituacao: null, proximoPercentual: null, proximoMesesEstimados: null,
  precoProjetado: null, ...i
});
const dados = (d: Partial<ReajusteDaAta>): ReajusteDaAta => ({ ataId: 'ata', parametros: par(), ciclos: [], itens: [], publicados: [], indices: [], ...d });

// Ata 00032/2025 (dados reais de 23/10/2026): termo aditivo de 4,44% publicado, preço do Compras.gov.br ainda homologado.
const ATA_32 = dados({
  parametros: par({ termoMesApostilamento: '2025-02-01' }),
  ciclos: [ciclo({})],
  itens: [item({ situacao: 'PRECO_DESATUALIZADO', precoDevido: 371002.21, precoAplicado: 371002.21 })]
});
// Ata 00039/2026: só a data do edital; reajuste na prorrogação, se houver.
const ATA_39 = dados({
  parametros: par({ dataOrcamentoEdital: '2025-09-16' }),
  ciclos: [ciclo({ dataBase: '2025-09-16', aniversario: '2026-09-16', efeitoInicio: '2027-07-29', situacao: 'SE_PRORROGAR', percentual: 4.22, percentualCalculado: 4.22, periodoInicio: '2025-09-01', periodoFim: '2026-08-01', reajusteId: null })],
  itens: [item({ numeroItem: '00002', precoHomologado: 135000, precoAtual: 135000, precoDevido: 135000, situacao: 'SE_PRORROGAR', proximoEfeito: '2027-07-29', proximoSituacao: 'SE_PRORROGAR', proximoPercentual: 4.22, proximoMesesEstimados: 0, precoProjetado: 140701.66 })]
});

describe('textos', () => {
  it('mês por extenso e percentual com duas casas', () => {
    expect(mesPorExtenso('2025-02-01')).toBe('fev/2025');
    expect(mesPorExtenso(null)).toBe('—');
    expect(percentual(4.4)).toBe('4,40%');
    expect(percentual(null)).toBe('—');
  });

  it('data-base: dia informado, mês pelo apostilamento ou sugestão do edital', () => {
    expect(dataBaseNaTela(par({ termoData: '2024-10-01', termoSei: '29255776', termoMesApostilamento: '2024-10-01' }))).toBe('01/10/2024');
    expect(dataBaseNaTela(par({ termoMesApostilamento: '2024-12-01', dataOrcamentoEdital: '2025-01-17' }))).toBe('dez/2024');
    expect(dataBaseNaTela(par({ dataOrcamentoEdital: '2025-09-16' }))).toBe('16/09/2025');
    expect(dataBaseNaTela(par())).toBe('—');
  });
});

describe('impacto no saldo', () => {
  it('devido: diferença entre o preço devido e o atual, sobre o saldo positivo', () => {
    const i = ATA_32.itens[0];
    expect(impactoDoItem(i, [{ numeroItem: '1', saldo: 530 }]).devido).toBeCloseTo(530 * (371002.21 - 355230), 2);
    expect(impactoDoItem(i, [{ numeroItem: '00001', saldo: -7 }])).toEqual({ devido: 0, proximo: 0, saldo: 0 });
  });

  it('próximo: preço projetado sobre o maior entre o devido e o atual', () => {
    const i = ATA_39.itens[0];
    expect(impactoDoItem(i, [{ numeroItem: '2', saldo: 102 }]).proximo).toBeCloseTo(102 * 5701.66, 2);
    expect(totaisDaAta(ATA_39.itens, [{ numeroItem: '2', saldo: 102 }]).proximo).toBeCloseTo(581569.32, 1);
  });
});

describe('situação da ata', () => {
  it('a pior situação manda e o contador só conta o que pede ação', () => {
    const itens = [item({ situacao: 'EM_DIA' }), item({ numeroItem: '2', situacao: 'DEVIDO' }), item({ numeroItem: '3', situacao: 'PRECO_DESATUALIZADO' })];
    expect(piorSituacao(itens)).toBe('DEVIDO');
    expect(contarComAcao(itens)).toBe(2);
    expect(piorSituacao([])).toBeNull();
  });

  it('00032/2025: preço do Compras.gov.br sem o reajuste publicado', () => {
    expect(avisoDaAba(ATA_32, [], HOJE)).toMatchObject({ tone: 'warning' });
    expect(avisoDaAba(ATA_32, [], HOJE).texto).toMatch(/de 4,44% está publicado no PNCP, mas o preço da ata no Compras.gov.br ainda é o homologado/);
    expect(quadroDoCartao(ATA_32, [], HOJE)).toEqual({ valor: 'Conferir preço', hint: 'Reajuste publicado, preço antigo', tone: 'warning' });
  });

  it('00039/2026: reajuste na prorrogação, se houver', () => {
    expect(avisoDaAba(ATA_39, [], HOJE).texto).toBe('Se a ata for prorrogada em 29/07/2027, o reajuste estimado é de 4,22%. O reajuste entra no termo aditivo de prorrogação, para o novo ciclo de vigência.');
    expect(quadroDoCartao(ATA_39, [], HOJE)).toEqual({ valor: '29/07/2027', hint: '4,22% · se prorrogar' });
  });

  it('reajuste devido: valor do saldo no aviso e no cartão', () => {
    const d = dados({
      parametros: par({ termoData: '2025-06-10', termoSei: '29999999' }),
      ciclos: [ciclo({ situacao: 'DEVIDO', efeitoInicio: '2026-07-29', reajusteId: null, percentual: 4.22 })],
      itens: [item({ situacao: 'DEVIDO', precoAtual: 85000, precoDevido: 88589.93 })]
    });
    const saldos = [{ numeroItem: '1', saldo: 102 }];
    expect(avisoDaAba(d, saldos, HOJE)).toMatchObject({ tone: 'danger' });
    expect(avisoDaAba(d, saldos, HOJE).texto).toMatch(/^O reajuste venceu em 29\/07\/2026 e não há apostilamento publicado\. Aplicar 4,22% aumenta em R\$\s?366/);
    expect(quadroDoCartao(d, saldos, HOJE)).toMatchObject({ valor: 'Devido', tone: 'danger' });
  });

  it('sem data-base pede o Termo de Conformidade', () => {
    const d = dados({ parametros: par(), itens: [item({ situacao: 'SEM_BASE' })] });
    expect(avisoDaAba(d, [], HOJE)).toMatchObject({ tone: 'warning', acao: 'INFORMAR_TERMO' });
    expect(quadroDoCartao(d, [], HOJE)).toMatchObject({ valor: 'Informar termo', tone: 'warning' });
  });

  it('percentual ilegível no PDF pede o percentual com a conta do sistema', () => {
    const d = dados({
      parametros: par({ termoMesApostilamento: '2025-02-01' }),
      ciclos: [ciclo({ situacao: 'PUBLICADO_SEM_PERCENTUAL', percentual: null, percentualCalculado: 4.44 })],
      itens: [item({ situacao: 'PERCENTUAL_A_INFORMAR', precoDevido: 371002.21 })]
    });
    expect(avisoDaAba(d, [], HOJE)).toMatchObject({ tone: 'warning', acao: 'INFORMAR_PERCENTUAL' });
    expect(avisoDaAba(d, [], HOJE).texto).toMatch(/Pela conta do sistema, seria 4,44%/);
  });

  it('sem cláusula no edital: lembra a concordância do fornecedor na prorrogação', () => {
    const d = dados({ parametros: par({ clausula: 'SEM_REAJUSTE' }), itens: [item({ situacao: 'SEM_REAJUSTE' })] });
    expect(avisoDaAba(d, [], HOJE).texto).toMatch(/concordância formal do fornecedor/);
    expect(quadroDoCartao(d, [], HOJE)).toEqual({ valor: 'Sem cláusula', hint: 'Edital sem reajuste' });
  });

  it('sem parâmetros (reajuste ainda não lido): sem quadro no cartão', () => {
    expect(quadroDoCartao(dados({ parametros: null }), [], HOJE)).toBeNull();
  });
});
