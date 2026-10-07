import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdesoesTab, splitUnidade } from '../AdesoesTab';
import type { AdesaoItemRecord } from '../../../types';

const item = { numeroItem: '00001', maximoAdesao: 9726, quantidadeHomologadaItem: 4863, valorUnitario: 1528.8 } as any;

const baseProps = {
  adesoesLoading: false,
  adesoesError: null as string | null,
  adesoes: [
    { numeroAta: '00020/2024', unidadeGerenciadora: '200331', unidadeNaoParticipante: '373083 - INCRA-SEDE/DF', dataAprovacaoAnalise: '2026-03-10T10:00:00', quantidadeAprovadaAdesao: 100 }
  ] as AdesaoItemRecord[],
  item,
  totalAdesaoAprovada: 100,
  limiteAdesao: 9726
};

const html = (over: Partial<typeof baseProps> = {}) => renderToStaticMarkup(<AdesoesTab {...baseProps} {...over} />);

describe('AdesoesTab', () => {
  it('resume as adesões em uma linha, sem cartões nem faixa explicativa', () => {
    const out = html();
    expect(out).toContain('adesoes-summary');
    expect(out).toContain('Aprovado');
    expect(out).toContain('100 de 9.726');
    expect(out).toContain('Saldo para adesões');
    expect(out).toContain('9.626');
    expect(out).not.toContain('kpi-card');
    expect(out).not.toContain('Art. 86 da Lei 14.133/21 ');
  });

  it('o limite legal fica como subtítulo curto do cabeçalho', () => {
    const out = html();
    expect(out).toContain('Adesões e caronas');
    expect(out).toContain('Art. 86 da Lei 14.133/2021');
  });

  it('lista os órgãos aderentes na tabela', () => {
    const out = html();
    expect(out).toContain('INCRA-SEDE/DF');
    expect(out).toContain('UASG: 373083');
    expect(out).toContain('2,06%'); // 100 de 4.863 homologadas
  });

  it('adesão sem quantidade aparece como "Não informada" e é contada no resumo', () => {
    const out = html({
      adesoes: [{ ...baseProps.adesoes[0], quantidadeAprovadaAdesao: null }]
    });
    expect(out).toContain('Não informada');
    expect(out).toContain('Sem quantidade informada');
  });

  it('separa código e nome da UASG não participante', () => {
    expect(splitUnidade('929777 - SECRETARIA DE EST.JUSTIÇA - SE')).toEqual({ codigo: '929777', nome: 'SECRETARIA DE EST.JUSTIÇA - SE' });
    expect(splitUnidade('ÓRGÃO SEM CÓDIGO')).toEqual({ codigo: '', nome: 'ÓRGÃO SEM CÓDIGO' });
  });

  it('sem adesões mostra o estado vazio; com falha na API, o erro', () => {
    expect(html({ adesoes: [] })).toContain('Nenhuma carona externa registrada');
    const erro = html({ adesoes: [], adesoesError: 'API indisponível' });
    expect(erro).toContain('Não foi possível carregar as adesões');
    expect(erro).toContain('API indisponível');
  });

  it('API fora do ar e sem cópia: avisa e não afirma "nenhuma carona"', () => {
    const out = renderToStaticMarkup(<AdesoesTab {...baseProps} adesoes={[]} totalAdesaoAprovada={0} origem="SEM_DADOS" />);
    expect(out).toContain('adesoes-sem-dados');
    expect(out).toContain('não dá para saber se houve carona');
    expect(out).not.toContain('Nenhuma carona externa registrada');
    expect(out).not.toContain('adesoes-summary');
  });

  it('cópia guardada: mostra a lista e a data; cópia vazia diz que o item não tinha adesões', () => {
    const comLista = renderToStaticMarkup(<AdesoesTab {...baseProps} origem="COPIA" copiadoEm="2026-10-05T17:32:00Z" />);
    expect(comLista).toContain('adesoes-copia');
    expect(comLista).toContain('última cópia guardada, lida em 05/10/2026 às 14:32');
    expect(comLista).toContain('INCRA-SEDE/DF');

    const vazia = renderToStaticMarkup(<AdesoesTab {...baseProps} adesoes={[]} totalAdesaoAprovada={0} origem="COPIA" copiadoEm="2026-10-05T17:32:00Z" />);
    expect(vazia).toContain('Na última leitura, em 05/10/2026 às 14:32, o item não tinha adesões.');
    expect(vazia).toContain('Nenhuma carona externa registrada');
  });

  it('lista ao vivo: sem aviso', () => {
    const out = html();
    expect(out).not.toContain('adesoes-copia');
    expect(out).not.toContain('adesoes-sem-dados');
  });

  it('mostra o carregamento no resumo', () => {
    expect(html({ adesoesLoading: true })).toContain('Consultando adesões de carona');
  });
});
