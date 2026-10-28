import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  descreverRegraPrazo,
  grupoDaTarefa,
  lerAndamentoTarefa,
  lerRegraTarefa,
  prazoEfetivo,
  textoRegraPrazo,
  textoRegraResposta,
  formatarEsforco,
  completarModulo,
  textoCobrarResposta
} from '../modeloGestao';

describe('modelo de gestão da CCGA: regra de prazo', () => {
  it('descreve cada âncora em português simples', () => {
    expect(descreverRegraPrazo({ prazoAncora: 'VIGENCIA_FIM', prazoDias: -120, prazoUteis: false })).toBe('D−120 (120 dias antes do fim da vigência)');
    expect(descreverRegraPrazo({ prazoAncora: 'ANTERIOR', prazoDias: 3, prazoUteis: true })).toBe('3 dias úteis após a tarefa anterior');
    expect(descreverRegraPrazo({ prazoAncora: 'ANTERIOR', prazoDias: 0, prazoUteis: true })).toBe('Junto com a tarefa anterior');
    expect(descreverRegraPrazo({ prazoAncora: 'APLICACAO', prazoDias: 1, prazoUteis: true })).toBe('1 dia útil após a data de partida');
    expect(descreverRegraPrazo({ prazoAncora: 'INICIO', prazoDias: 10, prazoUteis: false })).toBe('10 dias após a assinatura');
    expect(descreverRegraPrazo({ prazoAncora: 'FIXO' })).toBe('Data informada pelo gestor');
  });

  it('usa o texto do modelo quando existe e monta o da resposta do orientar', () => {
    expect(textoRegraPrazo({ prazoTexto: '2 d.u. após receber da CPL', prazoAncora: 'APLICACAO', prazoDias: 2 })).toBe('2 d.u. após receber da CPL');
    expect(textoRegraPrazo({})).toBeUndefined();
    expect(textoRegraResposta({ acao: 'ORIENTAR', respostaDias: 5, respostaUteis: true })).toBe('resposta em 5 dias úteis');
    expect(textoRegraResposta({ acao: 'FAZER', respostaDias: 5 })).toBeUndefined();
  });

  it('formata o esforço estimado', () => {
    expect(formatarEsforco(30)).toBe('30 min');
    expect(formatarEsforco(90)).toBe('1h30');
    expect(formatarEsforco(120)).toBe('2h');
    expect(formatarEsforco(undefined)).toBeUndefined();
  });
});

describe('modelo de gestão da CCGA: leitura das colunas', () => {
  it('lê a regra e o andamento e ignora valor desconhecido', () => {
    const regra = lerRegraTarefa({ acao: 'ORIENTAR', com_quem: 'Requisitante', lista: ['A', '', 'B'], prazo_ancora: 'VIGENCIA_FIM', prazo_dias: -180, prazo_uteis: false, do_pregao: false });
    expect(regra).toMatchObject({ acao: 'ORIENTAR', comQuem: 'Requisitante', lista: ['A', 'B'], prazoAncora: 'VIGENCIA_FIM', prazoDias: -180, prazoUteis: false });
    expect(regra.doPregao).toBeUndefined();
    expect(lerRegraTarefa({ acao: 'DORMIR', prazo_ancora: 'X' })).toMatchObject({ acao: undefined, prazoAncora: undefined });
    expect(lerAndamentoTarefa({ prazo_ajustado: true, prazo_resposta: '2028-02-01', pedido_enviado_em: '2028-01-05', pedido_sei: '36212988' })).toMatchObject({
      prazoAjustado: true,
      prazoResposta: '2028-02-01',
      pedidoEnviadoEm: '2028-01-05',
      pedidoSei: '36212988'
    });
  });
});

describe('modelo de gestão da CCGA: contadores do plano', () => {
  afterEach(() => vi.useRealTimers());

  it('separa comigo, cobrar, aguardando e fecha sozinha', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T12:00:00-03:00'));
    expect(grupoDaTarefa({ status: 'PENDENTE', acao: 'FAZER' })).toBe('COMIGO');
    expect(grupoDaTarefa({ status: 'PENDENTE' })).toBe('COMIGO');
    expect(grupoDaTarefa({ status: 'PENDENTE', acao: 'ORIENTAR' })).toBe('COMIGO');
    expect(grupoDaTarefa({ status: 'EM_ANDAMENTO', acao: 'ORIENTAR', pedidoEnviadoEm: '2026-10-01', prazoResposta: '2026-10-20' })).toBe('COBRAR');
    expect(grupoDaTarefa({ status: 'EM_ANDAMENTO', acao: 'ORIENTAR', pedidoEnviadoEm: '2026-10-20', prazoResposta: '2026-11-10' })).toBe('AGUARDANDO');
    expect(grupoDaTarefa({ status: 'PENDENTE', acao: 'ACOMPANHAR' })).toBe('FONTE');
    expect(grupoDaTarefa({ status: 'CONCLUIDA', acao: 'FAZER' })).toBe('FEITA');
    expect(grupoDaTarefa({ status: 'NAO_APLICAVEL', acao: 'ACOMPANHAR' })).toBe('FEITA');
  });

  it('depois do pedido enviado, o aviso conta pela resposta esperada', () => {
    expect(prazoEfetivo({ status: 'EM_ANDAMENTO', acao: 'ORIENTAR', prazo: '2026-10-01', pedidoEnviadoEm: '2026-10-01', prazoResposta: '2026-11-10' })).toBe('2026-11-10');
    expect(prazoEfetivo({ status: 'PENDENTE', acao: 'ORIENTAR', prazo: '2026-10-01', prazoResposta: '2026-11-10' })).toBe('2026-10-01');
    expect(prazoEfetivo({ status: 'CONCLUIDA', acao: 'ORIENTAR', prazo: '2026-10-01', pedidoEnviadoEm: '2026-10-01', prazoResposta: '2026-11-10' })).toBe('2026-10-01');
  });
});

describe('plano automático (migration 225)', () => {
  it('lê a fonte, o bloqueio e a pergunta da tarefa', () => {
    const a = lerAndamentoTarefa({ fechada_pela_fonte: 'Publicado no PNCP', fonte_bloqueada: true, pergunta_etapa: true });
    expect(a.fechadaPelaFonte).toBe('Publicado no PNCP');
    expect(a.fonteBloqueada).toBe(true);
    expect(a.perguntaEtapa).toBe(true);
    expect(lerAndamentoTarefa({}).perguntaEtapa).toBeUndefined();
  });

  it('lê a origem, o motivo e a dispensa do módulo', () => {
    const linhas = new Map([['mod1', { origem: 'AUTO', motivo_auto: 'Faltam 115 dias', dispensado_em: '2026-11-04T12:00:00Z', dispensado_por_nome: 'Maria', dispensa_justificativa: 'Já prorrogada' }]]);
    const m = completarModulo({ id: 'mod1', nome: 'Prorrogação' }, linhas);
    expect(m).toMatchObject({ origem: 'AUTO', motivoAuto: 'Faltam 115 dias', dispensadoPorNome: 'Maria', dispensaJustificativa: 'Já prorrogada' });
    expect(completarModulo({ id: 'mod2', nome: 'X' }, new Map([['mod2', {}]]))?.origem).toBe('MANUAL');
  });

  it('texto do "Cobrar resposta"', () => {
    expect(textoCobrarResposta({ pedidoEnviadoEm: '2026-11-04', pedidoSei: '36412207', prazoResposta: '2026-11-11' }, 2)).toBe(
      'Pedido em 04/11/2026 (SEI 36412207) · resposta era até 11/11/2026 · 2 dias úteis de atraso'
    );
    expect(textoCobrarResposta({}, 1)).toBe('1 dia útil de atraso');
  });
});
