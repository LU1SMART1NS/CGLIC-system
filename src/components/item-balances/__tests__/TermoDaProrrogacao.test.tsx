import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TermoDaProrrogacao } from '../RegistradoAcimaAviso';
import { urlDoDocumentoDaAta } from '../../../services/termosProrrogacaoService';

const termo = {
  sequencialDocumento: 3,
  titulo: 'Termo Aditivo da ARP',
  publicadoEm: '2026-10-09',
  cobertura: 'SALDO' as const,
  trecho: 'A presente prorrogação restabelece o saldo remanescente dos itens registrados, com fulcro nas regras editalícias.',
  url: urlDoDocumentoDaAta('00394494000136-1-000916/2025-000001', 3)
};

describe('TermoDaProrrogacao (aviso registrado acima do homologado)', () => {
  it('mostra a data, a frase do termo, o que ela quer dizer e o link do PNCP', () => {
    const h = renderToStaticMarkup(<TermoDaProrrogacao termo={termo} />);
    expect(h).toContain('Termo aditivo publicado no PNCP em 09/10/2026');
    expect(h).toContain('restabelece o saldo remanescente');
    expect(h).toContain('A prorrogação cobre só o saldo não contratado');
    expect(h).toContain('href="https://pncp.gov.br/pncp-api/v1/orgaos/00394494000136/compras/2025/916/atas/1/arquivos/3"');
  });

  it('renovação e termo sem frase têm outro texto', () => {
    expect(renderToStaticMarkup(<TermoDaProrrogacao termo={{ ...termo, cobertura: 'RENOVA' }} />)).toContain('O termo renova os quantitativos');
    expect(renderToStaticMarkup(<TermoDaProrrogacao termo={{ ...termo, cobertura: 'A_CONFERIR', trecho: null }} />)).toContain('Abra o termo para conferir');
  });
});
