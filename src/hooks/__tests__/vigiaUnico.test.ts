import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { montarVigia, notarAssinatura } from '../useSituacaoSincronizacao';

/** Simula N cópias do hook na mesma tela vendo a mesma situação; conta quantas pedem a releitura. */
function releiturasDe(qc: QueryClient, copias: number, assinatura: string, emAndamento = false): number {
  let pedidos = 0;
  for (let i = 0; i < copias; i++) if (notarAssinatura(qc, 'contratos', assinatura, emAndamento)) pedidos++;
  return pedidos;
}

describe('vigia único por recurso', () => {
  it('5 cópias na tela: a primeira leitura não relê e cada sincronização terminada relê uma vez só', () => {
    const qc = new QueryClient();
    const saidas = Array.from({ length: 5 }, () => montarVigia(qc, 'contratos'));
    expect(releiturasDe(qc, 5, 'a')).toBe(0);
    expect(releiturasDe(qc, 5, 'b')).toBe(1);
    expect(releiturasDe(qc, 5, 'b')).toBe(0);
    expect(releiturasDe(qc, 5, 'c')).toBe(1);
    saidas.forEach((sair) => sair());
  });

  it('durante a sincronização não relê; ao terminar, relê uma vez', () => {
    const qc = new QueryClient();
    const sair = montarVigia(qc, 'contratos');
    releiturasDe(qc, 3, 'a');
    expect(releiturasDe(qc, 3, 'a+andamento', true)).toBe(0);
    expect(releiturasDe(qc, 3, 'b')).toBe(1);
    sair();
  });

  it('recursos diferentes têm vigias diferentes', () => {
    const qc = new QueryClient();
    const s1 = montarVigia(qc, 'contratos');
    const s2 = montarVigia(qc, 'atas');
    notarAssinatura(qc, 'contratos', 'a', false);
    notarAssinatura(qc, 'atas', 'a', false);
    expect(notarAssinatura(qc, 'contratos', 'b', false)).toBe(true);
    expect(notarAssinatura(qc, 'atas', 'b', false)).toBe(true);
    s1(); s2();
  });

  it('saindo a última cópia, quem entrar depois começa do zero e não relê só por chegar', () => {
    const qc = new QueryClient();
    const s1 = montarVigia(qc, 'contratos');
    const s2 = montarVigia(qc, 'contratos');
    notarAssinatura(qc, 'contratos', 'a', false);
    s1();
    expect(notarAssinatura(qc, 'contratos', 'b', false)).toBe(true); // ainda há uma cópia na tela
    s2();
    const s3 = montarVigia(qc, 'contratos');
    expect(notarAssinatura(qc, 'contratos', 'c', false)).toBe(false);
    s3();
  });

  it('cada QueryClient (sessão) tem a própria memória', () => {
    const a = new QueryClient();
    const b = new QueryClient();
    const sa = montarVigia(a, 'contratos');
    const sb = montarVigia(b, 'contratos');
    notarAssinatura(a, 'contratos', 'x', false);
    expect(notarAssinatura(b, 'contratos', 'y', false)).toBe(false);
    sa(); sb();
  });
});
