import React from 'react';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AtaReajusteTab } from '../AtaReajusteTab';
import { REAJUSTE_VAZIO, type ReajusteDaAta } from '../../../../services/reajusteAtasService';
import type { ArpItemRecord } from '../../../../types';

// Ata 00093/2024 (dados reais de 23/10/2026): termo aditivo de 5,17% aplicado em 09/01/2026, preço atualizado.
const ATA_93: ReajusteDaAta = {
  ataId: 'ata-93',
  parametros: {
    ataId: 'ata-93', indice: 'IPCA', clausula: 'COM_REAJUSTE', dataOrcamentoEdital: '2024-09-30', termoMesApostilamento: '2024-10-01',
    termoSeiApostilamento: null, termoData: null, termoSei: null, termoInformadoEm: null, versao: 3
  },
  ciclos: [{
    ciclo: 1, dataBase: '2024-10-01', aniversario: '2025-10-01', efeitoInicio: '2026-01-09', situacao: 'APLICADO', percentual: 5.17,
    percentualCalculado: 5.17, mesesEstimados: 0, periodoInicio: '2024-10-01', periodoFim: '2025-09-01', reajusteId: 'r1'
  }],
  itens: [{
    numeroItem: '00001', precoHomologado: 14695, homologadoLido: true, precoAtual: 15454.73, percentualNoPreco: 5.17, precoDevido: 15454.73,
    precoAplicado: 15454.73, situacao: 'EM_DIA', proximoEfeito: null, proximoSituacao: null, proximoPercentual: null, proximoMesesEstimados: null, precoProjetado: null
  }],
  apostilados: [],
  publicados: [{
    id: 'r1', origem: 'PNCP', efeitoInicio: '2026-01-09', percentual: 5.17, periodoInicio: '2024-10-01', periodoFim: '2025-09-01', documentoSequencial: 2,
    documentoTitulo: 'PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS', documentoPublicadoEm: '2026-01-15', seiCitado: '29255776', seiDocumento: '33963384', seiApostilamento: null, informadoEm: null
  }],
  indices: [{ mes: '2024-10-01', variacao: 0.56, oficial: true }]
};
const ITENS = [{ numeroItem: '00001', descricaoItem: 'ESTEIRA ERGOMÉTRICA PARA EXERCÍCIOS', nomeRazaoSocialFornecedor: 'SÜD COMÉRCIO E IMPORTAÇÃO LTDA' } as ArpItemRecord];

function desenhar(props: Partial<React.ComponentProps<typeof AtaReajusteTab>> = {}) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AtaReajusteTab
          dados={ATA_93}
          isLoading={false}
          numeroAta="00093/2024"
          uasg="200331"
          inicioVigencia="2025-01-09"
          fimVigencia="2027-01-08"
          itensDaAta={ITENS}
          saldos={[{ numeroItem: '1', saldo: 324 }]}
          podeEditar
          {...props}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AtaReajusteTab', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T12:00:00Z'));
  });
  afterAll(() => vi.useRealTimers());

  it('mostra a base, o ciclo aplicado com a conta do sistema e a projeção por item', () => {
    const html = desenhar();
    expect(html).toContain('Termo de Conformidade');
    expect(html).toContain('out/2024');
    expect(html).toContain('Mês pelo apostilamento');
    expect(html).toContain('5,17%');
    expect(html).toContain('conta do sistema: 5,17%, confere');
    expect(html).toContain('out/2024 a set/2025');
    expect(html).toContain('PRIMEIRO TERMO ADITIVO DA ATA DE REGISTRO DE PREÇOS');
    expect(html).toContain('ESTEIRA ERGOMÉTRICA PARA EXERCÍCIOS');
    expect(html).toContain('+5,17% já aplicado');
    expect(html).toContain('Os preços estão em dia');
    expect(html).toContain('data-testid="reajuste-linha-do-tempo"');
  });

  it('mostra o SEI do próprio termo lido do PNCP e não oferece excluir o reajuste do PNCP', () => {
    const html = desenhar();
    expect(html).toContain('33963384');
    expect(html).not.toContain('data-testid="reajuste-excluir-1"');
  });

  it('o reajuste informado pelo gestor pode ser excluído (só por quem edita)', () => {
    // Ata 00056/2025 (06/11/2026): o termo do PNCP e a cópia informada pelo gestor.
    const dados: ReajusteDaAta = {
      ...ATA_93,
      ciclos: [
        { ...ATA_93.ciclos[0] },
        { ...ATA_93.ciclos[0], ciclo: 2, dataBase: '2026-01-09', aniversario: '2027-01-09', efeitoInicio: '2026-01-10', reajusteId: 'r2' }
      ],
      publicados: [
        ATA_93.publicados[0],
        { ...ATA_93.publicados[0], id: 'r2', origem: 'INFORMADO', documentoSequencial: null, documentoTitulo: null, documentoPublicadoEm: null,
          seiCitado: null, seiDocumento: null, seiApostilamento: '36938954', informadoEm: '2026-11-05T20:40:29Z' }
      ]
    };
    const html = desenhar({ dados });
    expect(html).toContain('data-testid="reajuste-excluir-2"');
    expect(html).not.toContain('data-testid="reajuste-excluir-1"');
    expect(html).toContain('36938954');
    expect(desenhar({ dados, podeEditar: false })).not.toContain('data-testid="reajuste-excluir-2"');
  });

  it('gestor da ata ou coordenador: botões de informar e corrigir', () => {
    const html = desenhar();
    expect(html).toContain('data-testid="reajuste-informar-termo"');
    expect(html).toContain('data-testid="reajuste-corrigir-1"');
    expect(html).toContain('Registrar reajuste fora do PNCP');
  });

  it('quem só consulta não vê os botões', () => {
    const html = desenhar({ podeEditar: false });
    expect(html).not.toContain('data-testid="reajuste-informar-termo"');
    expect(html).not.toContain('data-testid="reajuste-corrigir-1"');
    expect(html).not.toContain('Registrar reajuste fora do PNCP');
  });

  it('reajuste ainda não lido: explica em vez de mostrar zeros', () => {
    const html = desenhar({ dados: REAJUSTE_VAZIO });
    expect(html).toContain('Reajuste ainda não lido');
    expect(html).not.toContain('data-testid="reajuste-itens"');
  });
});
