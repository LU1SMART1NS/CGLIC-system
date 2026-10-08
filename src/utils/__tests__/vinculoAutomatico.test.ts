import { describe, it, expect } from 'vitest';
import {
  contarVinculosAutomaticos,
  frasesHerancaGestor,
  mensagemDesvincular,
  textoMotivoDaFila,
  textoMotivoManual
} from '../vinculoAutomatico';
import { lerResumo } from '../../services/vinculoAutomaticoService';

describe('textoMotivoManual', () => {
  it('ata sem gestor diz para quem a ata passaria', () => {
    const t = textoMotivoManual('ATA_SEM_GESTOR', { numeroAta: '00012/2025', gestorContrato: 'Daniel Espíndola' });
    expect(t.tipo).toBe('GESTOR');
    expect(t.detalhe).toBe('Vincular passaria a Ata 00012/2025 para Daniel Espíndola, que cuida do contrato.');
  });
  it('troca de gestor cita os dois gestores', () => {
    const t = textoMotivoManual('TROCARIA_GESTOR', { numeroAta: '00059/2025', gestorContrato: 'Daniel Espíndola', gestorAta: 'Furtado' });
    expect(t.detalhe).toBe('O contrato é de Daniel Espíndola e a Ata 00059/2025 é de Furtado.');
  });
  it('sem os nomes, a frase continua completa', () => {
    expect(textoMotivoManual('TROCARIA_GESTOR').detalhe).toBe('O contrato tem um gestor e a ata, outro.');
  });
  it('dados que não fecham e decisões da equipe têm o tipo certo', () => {
    expect(textoMotivoManual('VALOR_FORA_DO_LIMITE').tipo).toBe('DADO');
    expect(textoMotivoManual('OUTRO_FORNECEDOR').tipo).toBe('DADO');
    expect(textoMotivoManual('VINCULO_DESFEITO').tipo).toBe('EQUIPE');
    expect(textoMotivoManual('ATA_DESCARTADA').tipo).toBe('EQUIPE');
  });
});

describe('textoMotivoDaFila', () => {
  it('usa o motivo do banco quando existe', () => {
    expect(textoMotivoDaFila('ITEM_FORA_DA_ATA', 'ATA_PROVAVEL').titulo).toBe('Item fora da ata');
  });
  it('sem motivo, explica pela situação da linha', () => {
    expect(textoMotivoDaFila(undefined, 'SEM_PISTA').titulo).toBe('Sem ata da mesma compra');
    expect(textoMotivoDaFila(undefined, 'PARCIAL').titulo).toBe('Só uma pista parcial');
    expect(textoMotivoDaFila(undefined, 'ATA_PROVAVEL').titulo).toBe('Aguardando o sistema');
    expect(textoMotivoDaFila(undefined, 'ATA_PROVAVEL', { vinculoParcial: true }).titulo).toBe('Vínculo parcial');
  });
  it('não pertence a ata vale mesmo com outro motivo', () => {
    expect(textoMotivoDaFila('OUTRO_FORNECEDOR', 'NAO_PERTENCE').titulo).toBe('Não pertence a ata');
  });
});

describe('contarVinculosAutomaticos', () => {
  it('conta só os do sistema: vínculos, contratos e atas', () => {
    const r = contarVinculosAutomaticos([
      { ataKey: '00053/2025', contractKey: 'A', origem: 'AUTOMATICO' },
      { ataKey: '00025/2025', contractKey: 'A', origem: 'AUTOMATICO' },
      { ataKey: '00053/2025', contractKey: 'B', origem: 'AUTOMATICO' },
      { ataKey: '00001/2025', contractKey: 'C', origem: 'MANUAL' },
      { ataKey: '00002/2025', contractKey: 'D' }
    ]);
    expect(r).toEqual({ vinculos: 3, contratos: 2, atas: 2 });
  });
});

describe('frasesHerancaGestor', () => {
  it('uma frase por gestor, do maior para o menor', () => {
    expect(frasesHerancaGestor({ Furtado: 1, 'Daniel Espíndola': 14, Ninguém: 0 })).toEqual([
      '14 contratos sem gestor passam a ser de Daniel Espíndola, gestor da ata',
      '1 contrato sem gestor passa a ser de Furtado, gestor da ata'
    ]);
  });
});

describe('mensagemDesvincular', () => {
  it('avisa que o sistema não refaz e como devolver', () => {
    const m = mensagemDesvincular('00077/2026', '00001', 'AUTOMATICO');
    expect(m).toContain('Desvincular o contrato 00077/2026 do item 1?');
    expect(m).toContain('Este vínculo foi feito pelo sistema.');
    expect(m).toContain('O sistema não vai refazer este vínculo.');
    expect(m).toContain('"Restaurar"');
  });
  it('vínculo feito à mão não diz que foi o sistema', () => {
    expect(mensagemDesvincular('00160/2026', '1', 'MANUAL')).not.toContain('feito pelo sistema');
  });
});

describe('lerResumo', () => {
  it('lê o JSON da função do banco', () => {
    const r = lerResumo({
      simulacao: true, novos: 845, contratos_novos: 412, atualizados: 9, retirados: 0, automaticos_total: 9,
      manuais: { OUTRO_FORNECEDOR: 10 }, herdam_gestor: { 'Daniel Espíndola': 14 }, erros: []
    });
    expect(r).toEqual({
      simulacao: true, novos: 845, contratosNovos: 412, atualizados: 9, retirados: 0, automaticosTotal: 9,
      manuais: { OUTRO_FORNECEDOR: 10 }, herdamGestor: { 'Daniel Espíndola': 14 }, erros: []
    });
  });
  it('resposta vazia vira zeros', () => {
    expect(lerResumo(null).novos).toBe(0);
  });
});
