import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuantidadeContratadaCelula, UnidadesDoContratoCelula } from '../ContratadoCells';
import { mapQuantidadeDoContrato } from '../../../services/contratadoUnidadeService';

const q = (over: Record<string, unknown> = {}) =>
  mapQuantidadeDoContrato({
    item_key: '00059/2025-200331-00001',
    contract_key: 'C12',
    quantidade_fonte: 480,
    fonte: 'CONTRATOS_GOV',
    quantidade_contratada: 480,
    ajustada: false,
    quantidade_dividida: 0,
    quantidade_sem_unidade: 480,
    situacao_divisao: 'SEM_DIVISAO',
    unidades: [],
    ...over
  });

describe('célula da quantidade contratada', () => {
  it('sem ajuste: número e "do Contratos.gov.br", sem tag', () => {
    const out = renderToStaticMarkup(<QuantidadeContratadaCelula q={q()} />);
    expect(out).toContain('480');
    expect(out).toContain('do Contratos.gov.br');
    expect(out).not.toContain('Ajustada');
    expect(out).not.toContain('Ajustar');
  });

  it('ajustada: tag, número da fonte embaixo, aviso de mudança e link Ajustar', () => {
    const out = renderToStaticMarkup(
      <QuantidadeContratadaCelula
        q={q({ quantidade_ajustada: 500, quantidade_contratada: 500, ajustada: true, ajuste_quantidade_fonte: 470, fonte_mudou_apos_ajuste: true })}
        onAjustar={vi.fn()}
      />
    );
    expect(out).toContain('500');
    expect(out).toContain('Ajustada');
    expect(out).toContain('No Contratos.gov.br: 480');
    expect(out).toContain('Mudou de 470 para 480. Confira.');
    expect(out).toContain('Ajustar');
  });
});

describe('célula das unidades do contrato', () => {
  it('sem divisão: falta tudo, botão Unidades em destaque', () => {
    const out = renderToStaticMarkup(<UnidadesDoContratoCelula q={q()} onAbrir={vi.fn()} />);
    expect(out).toContain('Sem unidade · 480');
    expect(out).toContain('Unidades');
  });

  it('divisão automática e parcial', () => {
    const out = renderToStaticMarkup(
      <UnidadesDoContratoCelula
        q={q({ divisao_origem: 'AUTO', quantidade_dividida: 300, quantidade_sem_unidade: 180, situacao_divisao: 'PARCIAL', unidades: [{ unidade: 'DFNSP', quantidade: 300, alocada: true }] })}
      />
    );
    expect(out).toContain('DFNSP 300');
    expect(out).toContain('AUTO');
    expect(out).toContain('Sem unidade · 180');
    expect(out).not.toContain('>Unidades<');
  });

  it('a conferir e sem quantidade', () => {
    expect(renderToStaticMarkup(<UnidadesDoContratoCelula q={q({ situacao_divisao: 'CONFERIR' })} />)).toContain('Conferir');
    const semQtd = renderToStaticMarkup(<UnidadesDoContratoCelula q={q({ situacao_divisao: 'SEM_QUANTIDADE', quantidade_contratada: null })} onAbrir={vi.fn()} />);
    expect(semQtd).toContain('sem quantidade');
    expect(semQtd).not.toContain('Unidades');
  });
});
