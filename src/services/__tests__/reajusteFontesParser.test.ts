import { describe, it, expect } from 'vitest';
import { lerClausulaDoEdital, lerReajustesDoDocumento, lerTermoDeProrrogacao, normalizarTexto, resolverEfeito } from '../reajusteFontesParser';

// Trechos reais dos documentos publicados no PNCP (23/10/2026), só a parte da cláusula.
const TERMO_ADITIVO_COM_CICLO =
  'CLÁUSULA SEGUNDA - REAJUSTE DA ATA DE REGISTRO DE PREÇO 2.1. Segue a tabela atualizada com os valores unitários ' +
  'reajustados pelo IPCA de 5,17% (34108953), considerando o período do orçamento estimado de 10/2024 a 09/2025 (29255776), ' +
  'para aplicação no novo ciclo de vigência da Ata 09/01/2026 a 08/01/2027. 2.2. Empresa: ...';
const TERMO_ADITIVO_CONFORMIDADE =
  'Segue a tabela atualizada com os valores unitários reajustados pelo IPCA de 5,17% (34278533), considerando o período do ' +
  'orçamento estimado de 10/2024 a 09/2025, de acordo com a conformidade da pesquisa de preços à época (29378565), para ' +
  'aplicação no novo ciclo de vigência da Ata (21/01/2026 a 20/01/2027).';
const TERMO_ADITIVO_TEXTO_REPETIDO =
  'CLÁUSULA SEGUNDA - REAJUSTECLÁUSULA SEGUNDA - REAJUSTE 2.1. Segue a tabela atualizada com os valores unitários reajustados ' +
  'pelo IPCA de 4,44%IPCA de 4,44% (36006809), considerando o período do orçamento es!mado de 02/2025 a 01/2026 (, considerando ' +
  'o período do orçamento es!mado de 02/2025 a 01/2026 ( 35855166) ,) , para aplicação no novo ciclo de vigência da Ata.';
const TERMO_ADITIVO_APURADA_ENTRE =
  'Segue a tabela atualizada com os valores unitários reajustados pelo IPCA de 4,44%IPCA de 4,44% (36006809), considerandoa ' +
  'variação acumulada do IPCA apurada entre 02/2025 a 01/2026, considerandoa variação acumulada do IPCA apurada entre 02/2025 ' +
  'a 01/2026 ((35933192),), para aplicação no novo ciclo de vigência da Ata.';
const TERMO_ADITIVO_SEM_SIMBOLO =
  'Segue a tabela atualizada com os valores unitários reajustados pelo IPCA de 5,17 (33806484), considerando o período do ' +
  'orçamento es=mado de 10/2024 a 09/2025 (25890193), para aplicação no novo ciclo de vigência da Ata 20/12/2025 a 19/12/2026.';
const APOSTILAMENTO_POR_EXTENSO =
  'REAJUSTAR o valor unitário dos itens da Ata, calculado de acordo com o Índice Nacional de Preços ao Consumidor Amplo - ' +
  'IPCA/IBGE, apurado no período de fevereiro de 2025 a janeiro de 2026, no percentual de 4,44% (34985144), tendo em vista o ' +
  'disposto nos subitens 7.32. e 9.2.3. do Termo de Referência. 2. CLÁUSULA SEGUNDA - VALOR 2.1. Em razão do reajuste, fica ' +
  'atualizado o instrumento de registro de preços, com valores unitários aplicáveis a partir da assinatura do presente termo de ' +
  'apostilamento, conforme tabela abaixo. Documento assinado eletronicamente por FULANA DE TAL, Coordenadora, em 30/03/2026, às 10:12.';
const PRORROGACAO_SEM_REAJUSTE =
  'RESOLVE prorrogar a Ata de Registro de Preços nº 51/2024, em conformidade com as disposições a seguir: A prorrogação do ' +
  'prazo de validade da Ata, por mais 1 (um) ano. A presente prorrogação abrange apenas o saldo remanescente.';

const EDITAL_COM_DATA =
  'CLÁUSULA SÉTIMA - REAJUSTE (art. 92, V) 7.1. Os preços inicialmente contratados são fixos e irreajustáveis no prazo de um ano ' +
  'contado da data do orçamento estimado, em 23/09/2024. 7.2. Após o interregno de um ano, e independentemente de pedido do ' +
  'contratado, os preços iniciais serão reajustados, mediante a aplicação, pelo contratante, do índice IPCA exclusivamente para ' +
  'as obrigações iniciadas e concluídas após a ocorrência da anualidade.';
const EDITAL_DATA_EM_BRANCO =
  '7.1. Os preços inicialmente contratados são fixos e irreajustáveis no prazo de um ano contado da data do orçamento ' +
  'estimado, em .__/__/__ (DD/MM/AAAA) 7.2. Após o interregno de um ano, e independentemente de pedido do contratado, os preços ' +
  'iniciais serão reajustados, mediante a aplicação, pelo contratante, do índice IPCA exclusivamente para as obrigações.';
const EDITAL_DATA_COM_ESPACOS =
  'Os preços são fixos e irreajustáveis no prazo de um ano contado da data do orçamento estimado, em 07 / 10 / 2024. Após o ' +
  'interregno de um ano, os preços serão reajustados mediante a aplicação do Índice de Custo da Tecnologia da Informação - ICTI ' +
  'ou, na falta, do IPCA.';

describe('lerReajustesDoDocumento', () => {
  it('termo aditivo com período, SEI e data do novo ciclo', () => {
    const l = lerReajustesDoDocumento(TERMO_ADITIVO_COM_CICLO);
    expect(l.reajustes).toEqual([
      expect.objectContaining({ indice: 'IPCA', percentual: 5.17, periodoInicio: '2024-10-01', periodoFim: '2025-09-01', seiCitado: '29255776', seiEhConformidade: false, efeitoInicio: '2026-01-09', noNovoCiclo: true })
    ]);
  });

  it('reconhece quando o SEI citado é a conformidade da pesquisa de preços', () => {
    const [r] = lerReajustesDoDocumento(TERMO_ADITIVO_CONFORMIDADE).reajustes;
    expect(r).toMatchObject({ percentual: 5.17, periodoInicio: '2024-10-01', seiCitado: '29378565', seiEhConformidade: true, efeitoInicio: '2026-01-21' });
  });

  it('texto repetido pela extração vira um reajuste só', () => {
    const l = lerReajustesDoDocumento(TERMO_ADITIVO_TEXTO_REPETIDO);
    expect(l.reajustes).toHaveLength(1);
    expect(l.reajustes[0]).toMatchObject({ percentual: 4.44, periodoInicio: '2025-02-01', periodoFim: '2026-01-01', efeitoInicio: null, noNovoCiclo: true });
  });

  it('"apurada entre" também é período', () => {
    const l = lerReajustesDoDocumento(TERMO_ADITIVO_APURADA_ENTRE);
    expect(l.reajustes).toHaveLength(1);
    expect(l.reajustes[0]).toMatchObject({ percentual: 4.44, periodoInicio: '2025-02-01', periodoFim: '2026-01-01' });
  });

  it('percentual sem o símbolo e ligadura trocada', () => {
    const [r] = lerReajustesDoDocumento(TERMO_ADITIVO_SEM_SIMBOLO).reajustes;
    expect(r).toMatchObject({ percentual: 5.17, seiCitado: '25890193', efeitoInicio: '2025-12-20' });
  });

  it('apostilamento com meses por extenso, aplicável a partir da assinatura', () => {
    const l = lerReajustesDoDocumento(APOSTILAMENTO_POR_EXTENSO);
    expect(l.reajustes).toEqual([
      expect.objectContaining({ indice: 'IPCA', percentual: 4.44, periodoInicio: '2025-02-01', periodoFim: '2026-01-01', seiCitado: '34985144', aPartirDaAssinatura: true, noNovoCiclo: false })
    ]);
    expect(l.dataAssinatura).toBe('2026-03-30');
  });

  it('prorrogação sem reajuste não inventa reajuste', () => {
    const l = lerReajustesDoDocumento(PRORROGACAO_SEM_REAJUSTE);
    expect(l.reajustes).toEqual([]);
    expect(l.citaReajusteSemLeitura).toBe(false);
    expect(l.aplicaReajusteSemPercentual).toBe(false);
  });

  it('índice com "/IBGE" e seis casas decimais', () => {
    const [r] = lerReajustesDoDocumento('reajustados pelo IPCA/IBGE de 4,724910% (36905641), considerando o período do orçamento estimado de 06/2025 a 05/2026 (35590786), para aplicação no novo ciclo de vigência da Ata.').reajustes;
    expect(r).toMatchObject({ indice: 'IPCA', percentual: 4.72491, periodoInicio: '2025-06-01', periodoFim: '2026-05-01', seiCitado: '35590786' });
  });

  it('texto embaralhado: lê o percentual sem o período', () => {
    const l = lerReajustesDoDocumento('valores unitários reajustados pelo IPCA de 5,23% (IPCA de 5,23% (3403285434032854),), coconsinsiderando o período do orçamento es3mado de 08derando o período do orçamento es3mado de 08 /2024 a 07/2025/2024 a 07/2025 ((2885166328851663)),, para aplicação n o novo ciclo de vigência da Ata 2828/12/2025');
    expect(l.reajustes).toEqual([expect.objectContaining({ percentual: 5.23, periodoInicio: null, periodoFim: null })]);
  });

  it('aplica reajuste sem número legível: fica para o gestor informar', () => {
    const l = lerReajustesDoDocumento('Termo de apostilamento. Reajuste Contratual anual conforme planilha anexa.');
    expect(l.reajustes).toEqual([]);
    expect(l.aplicaReajusteSemPercentual).toBe(true);
  });

  it('documento que fala de reajuste sem número legível fica marcado', () => {
    const l = lerReajustesDoDocumento('Termo aditivo de prorrogação e reajuste pelo IPCA conforme tabela anexa.');
    expect(l.reajustes).toEqual([]);
    expect(l.citaReajusteSemLeitura).toBe(true);
  });
});

describe('lerClausulaDoEdital', () => {
  it('índice e data do orçamento', () => {
    expect(lerClausulaDoEdital(EDITAL_COM_DATA)).toEqual({ indice: 'IPCA', indicesCitados: ['IPCA'], dataOrcamento: '2024-09-23', temClausula: true, dataEmBranco: false });
  });

  it('data em branco no modelo', () => {
    const c = lerClausulaDoEdital(EDITAL_DATA_EM_BRANCO);
    expect(c).toMatchObject({ indice: 'IPCA', dataOrcamento: null, dataEmBranco: true, temClausula: true });
  });

  it('data com espaços e dois índices: fica o IPCA, como nos reajustes publicados', () => {
    const c = lerClausulaDoEdital(EDITAL_DATA_COM_ESPACOS);
    expect(c.dataOrcamento).toBe('2024-10-07');
    expect(c.indicesCitados).toEqual(['ICTI', 'IPCA']);
    expect(c.indice).toBe('IPCA');
  });

  it('sem cláusula', () => {
    expect(lerClausulaDoEdital('Edital de pregão eletrônico. Objeto: aquisição de viaturas.')).toMatchObject({ indice: null, temClausula: false, dataOrcamento: null });
  });

  it('datas diferentes com o mesmo peso: não sugere nenhuma', () => {
    const t = 'fixos e irreajustáveis IPCA. data do orçamento estimado, em 01/02/2025. data do orçamento estimado, em 03/04/2025.';
    expect(lerClausulaDoEdital(t).dataOrcamento).toBeNull();
  });

  it('data impossível é ignorada', () => {
    expect(lerClausulaDoEdital('fixos e irreajustáveis IPCA. data do orçamento estimado, em 31/02/2025.').dataOrcamento).toBeNull();
  });
});

describe('resolverEfeito', () => {
  const ctx = { inicioVigencia: '2025-04-15', publicadoEm: '2026-04-13', dataAssinatura: '2026-04-10', tituloFalaDeAditivo: true };

  it('data escrita no documento vale', () => {
    expect(resolverEfeito({ efeitoInicio: '2026-01-09', noNovoCiclo: true, aPartirDaAssinatura: false }, ctx)).toBe('2026-01-09');
  });

  it('novo ciclo sem data: início do ciclo seguinte da vigência', () => {
    expect(resolverEfeito({ efeitoInicio: null, noNovoCiclo: true, aPartirDaAssinatura: false }, ctx)).toBe('2026-04-15');
  });

  it('a partir da assinatura: data da assinatura eletrônica', () => {
    expect(resolverEfeito({ efeitoInicio: null, noNovoCiclo: false, aPartirDaAssinatura: true }, { ...ctx, inicioVigencia: '2026-03-26', dataAssinatura: '2026-03-30', publicadoEm: '2026-03-30', tituloFalaDeAditivo: false })).toBe('2026-03-30');
  });

  it('apostilamento no meio da vigência sem frase de ciclo: assinatura', () => {
    expect(resolverEfeito({ efeitoInicio: null, noNovoCiclo: false, aPartirDaAssinatura: false }, { ...ctx, tituloFalaDeAditivo: false })).toBe('2026-04-10');
  });
});

describe('normalizarTexto', () => {
  it('junta linhas e corrige a ligadura', () => {
    expect(normalizarTexto('orçamento es!mado\n de 10/2024')).toBe('orçamento estimado de 10/2024');
  });
});

describe('lerTermoDeProrrogacao (migration 222)', () => {
  it('termo da 00064/2024: "abrange apenas o saldo remanescente" (frase quebrada em duas linhas no PDF)', () => {
    const texto = 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS Nº 64/2024\nRESOLVE prorrogar a Ata ... 1.1. A prorrogação do prazo de vigência por mais 1 ano;\n1.2. A presente prorrogação abrange apenas o saldo\nremanescente dos itens registrados.\n2. CLÁUSULA SEGUNDA';
    expect(lerTermoDeProrrogacao(texto)).toEqual({ cobertura: 'SALDO', trecho: 'A presente prorrogação abrange apenas o saldo remanescente dos itens registrados.' });
  });

  it('termo da 00059/2025: "restabelece o saldo remanescente" também é só o saldo não contratado', () => {
    const texto = 'TERMO ADITIVO ... RESOLVE prorrogar a Ata de Registro de Preços nº 59/2025 ... 1.1.2. A presente prorrogação restabelece o saldo remanescente dos itens registrados, com fulcro nas regras editalícias. 2. CLÁUSULA';
    expect(lerTermoDeProrrogacao(texto)).toEqual({ cobertura: 'SALDO', trecho: 'A presente prorrogação restabelece o saldo remanescente dos itens registrados, com fulcro nas regras editalícias.' });
  });

  it('renovação dos quantitativos (Parecer 75/2024/DECOR) e prorrogação sem dizer nada', () => {
    expect(lerTermoDeProrrogacao('TERMO ADITIVO de prorrogação da ata. 1.2. Ficam renovados os quantitativos originalmente registrados.')).toMatchObject({ cobertura: 'RENOVA' });
    expect(lerTermoDeProrrogacao('TERMO ADITIVO. Fica prorrogada a vigência da ata por mais um ano.')).toEqual({ cobertura: 'A_CONFERIR', trecho: null });
  });

  it('apostilamento de reajuste não é termo de prorrogação', () => {
    expect(lerTermoDeProrrogacao('APOSTILAMENTO. REAJUSTAR o valor unitário dos itens da Ata pelo IPCA.', 'REAJUSTAR o valor unitário')).toBeNull();
  });
});
