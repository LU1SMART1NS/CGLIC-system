/** Itens da CAEP entram sozinhos no programa das emendas (migration 299): a coluna Quem destinou não repete o programa embaixo da emenda. */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { linhaParaEntrega, type EntregaFiscalizacao } from '../../../services/fiscalizacaoService';
import { PROGRAMA_DAS_EMENDAS } from '../../../utils/fiscalizacaoResumo';
import { CelulaQuemDestinou } from '../FiscalizacaoCelulas';

const base = linhaParaEntrega({ id: 'e1', contract_key: '200331-00055-2026', contrato_numero: '00055/2026', quantidade: 10, origem: 'EMENDA', responsavel: 'SFC', etapa: 'ORDEM', fiscalizacao: 'SFC' });
const e = (p: Partial<EntregaFiscalizacao>): EntregaFiscalizacao => ({ ...base, ...p });
const NOME = 'Emendas Parlamentares (MA 90)';

describe('CelulaQuemDestinou com o programa das emendas', () => {
  it('com emenda: mostra a emenda e não repete o programa das emendas', () => {
    const html = renderToStaticMarkup(<CelulaQuemDestinou es={[e({ emenda: '202612340001', parlamentarNome: 'Fulano', programaId: PROGRAMA_DAS_EMENDAS, programaTexto: NOME })]} />);
    expect(html).toContain('Emenda 202612340001');
    expect(html).not.toContain(NOME);
  });

  it('sem emenda (item da planilha): mostra o programa das emendas', () => {
    const html = renderToStaticMarkup(<CelulaQuemDestinou es={[e({ origem: 'CARGA', emenda: null, programaId: PROGRAMA_DAS_EMENDAS, programaTexto: NOME })]} />);
    expect(html).toContain(NOME);
  });

  it('outro programa continua aparecendo junto da emenda', () => {
    const html = renderToStaticMarkup(<CelulaQuemDestinou es={[e({ emenda: '202612340001', programaId: 'p2', programaTexto: 'Pégasus' })]} />);
    expect(html).toContain('Pégasus');
  });
});
