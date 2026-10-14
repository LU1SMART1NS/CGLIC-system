import { describe, it, expect } from 'vitest';
import { calculateAttentionSummary, motivosDosQuantitativos } from '../dashboardService';
import { alocadoAcimaDoLimite, limiteProvisorio, resumirAtaAssinada, situacaoAtaAssinada } from '../../utils/ataAssinadaPendente';

// Linha de v_arp_item_saldo_detalhado com as colunas da migration 116. Números reais do tablet 00059/2025 item 1
// (registrado da SENASP 801, alocado 690, 22 outros órgãos), sem a ata assinada informada.
const linha = (over: Record<string, unknown> = {}) => ({
  item_key: '00059/2025-200331-00001', numero_ata: '00059/2025', numero_item: '00001', codigo_uasg: '200331',
  papel_senasp: 'GERENCIADORA', descricao_item: 'Tablet', fornecedor_razao_social: 'Fornecedor X',
  quantidade_homologada: 4863, quantidade_senasp: 801, quantidade_base_senasp: 801, percentual_consumido: 86,
  ata_assinada_informada: false, total_alocado_unidades: 690, outros_orgaos_registrados: 22, ...over
});

describe('regras da ata assinada no item', () => {
  it('ata da CGLIC com outros órgãos e sem a ata assinada: a informar, limite provisório', () => {
    expect(situacaoAtaAssinada(linha())).toBe('A_INFORMAR');
    expect(limiteProvisorio(linha())).toBe(true);
  });
  it('só a SENASP registrada: informar não muda nada', () => {
    expect(situacaoAtaAssinada(linha({ outros_orgaos_registrados: 0 }))).toBeNull();
    expect(limiteProvisorio(linha({ outros_orgaos_registrados: 0 }))).toBe(false);
  });
  it('informada: sem limite provisório', () => {
    expect(situacaoAtaAssinada(linha({ ata_assinada_informada: true }))).toBe('INFORMADA');
    expect(limiteProvisorio(linha({ ata_assinada_informada: true }))).toBe(false);
  });
  it('SENASP participante: olha só a linha da SENASP e nunca tem limite provisório', () => {
    const part = linha({ codigo_uasg: '200342', papel_senasp: 'PARTICIPANTE', assinada_senasp_participante: null });
    expect(situacaoAtaAssinada(part)).toBe('A_INFORMAR');
    expect(limiteProvisorio(part)).toBe(false);
    expect(situacaoAtaAssinada({ ...part, assinada_senasp_participante: 2400 })).toBe('INFORMADA');
  });
  it('adesão fica de fora', () => {
    expect(situacaoAtaAssinada(linha({ codigo_uasg: '200334', papel_senasp: 'ADESAO' }))).toBeNull();
  });
  it('alocado acima do limite, com a base negativa contada como zero', () => {
    expect(alocadoAcimaDoLimite(linha())).toBe(0);
    expect(alocadoAcimaDoLimite(linha({ quantidade_base_senasp: 650 }))).toBe(40);
    expect(alocadoAcimaDoLimite(linha({ quantidade_base_senasp: -15 }))).toBe(690);
    expect(alocadoAcimaDoLimite(linha({ total_alocado_unidades: undefined }))).toBe(0);
  });
  it('resumo da ata: a informar enquanto faltar algum item', () => {
    expect(resumirAtaAssinada([null, null])).toBeNull();
    expect(resumirAtaAssinada(['INFORMADA', 'A_INFORMAR', null])).toEqual({ situacao: 'A_INFORMAR', informados: 1, total: 2 });
    expect(resumirAtaAssinada(['INFORMADA', 'INFORMADA'])).toEqual({ situacao: 'INFORMADA', informados: 2, total: 2 });
  });
});

describe('Visão Geral — alocado acima do limite', () => {
  const avisos = (arpItems: any[]) =>
    calculateAttentionSummary({ arpItems, currentDate: new Date('2026-10-13T12:00:00') } as any).items.filter((i) => i.category === 'QUANTITATIVOS');

  it('cota própria abaixo do alocado: atenção, com quanto diminuir', () => {
    const [a] = avisos([linha({ ata_assinada_informada: true, quantidade_base_senasp: 650 })]);
    expect(a).toMatchObject({ severity: 'ATENCAO', badgeLabel: 'alocado acima' });
    expect(a.description).toContain('alocado às unidades (690) acima da cota própria da SENASP (650): diminua 40 na alocação');
  });

  it('sem a ata assinada vale também quando o registrado da SENASP cai', () => {
    const [a] = avisos([linha({ quantidade_base_senasp: 600 })]);
    expect(a.description).toContain('acima do registrado da SENASP (600): diminua 90');
  });

  it('adesão reduzida', () => {
    const m = motivosDosQuantitativos(linha({ codigo_uasg: '200334', papel_senasp: 'ADESAO', quantidade_base_senasp: 4, total_alocado_unidades: 5 }));
    expect(m.map((x) => x.texto)).toEqual(['alocado às unidades (5) acima da quantidade aprovada da SENASP (4): diminua 1 na alocação']);
  });

  it('a chave de Resolvido muda com o excesso', () => {
    const [a] = avisos([linha({ quantidade_base_senasp: 600 })]);
    const [b] = avisos([linha({ quantidade_base_senasp: 500 })]);
    expect(a.avisoChave).not.toBe(b.avisoChave);
  });

  it('dentro do limite e sem a ata assinada: nenhum aviso de quantitativos', () => {
    expect(avisos([linha()])).toEqual([]);
  });
});

describe('Visão Geral — informar qtd. da ata assinada', () => {
  const pendencias = (arpItems: any[]) =>
    calculateAttentionSummary({ arpItems, currentDate: new Date('2026-10-13T12:00:00') } as any).items.filter((i) => i.category === 'ATA_ASSINADA');

  it('uma pendência por ata, só com item já alocado, levando ao primeiro item alocado', () => {
    const itens = [
      linha({ item_key: '00023/2026-200331-00003', numero_ata: '00023/2026', numero_item: '00003', total_alocado_unidades: 192, outros_orgaos_registrados: 2 }),
      linha({ item_key: '00023/2026-200331-00007', numero_ata: '00023/2026', numero_item: '00007', total_alocado_unidades: 216, outros_orgaos_registrados: 3 }),
      linha({ item_key: '00023/2026-200331-00040', numero_ata: '00023/2026', numero_item: '00040', total_alocado_unidades: 0, outros_orgaos_registrados: 1 }),
      linha({ item_key: '00023/2026-200331-00001', numero_ata: '00023/2026', numero_item: '00001', total_alocado_unidades: 96, outros_orgaos_registrados: 0 })
    ];
    const lista = pendencias(itens);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({
      id: 'ATT-ATA-ASSINADA-00023/2026-200331',
      severity: 'INFO',
      title: 'Informar qtd. da ata assinada',
      badgeLabel: 'sem ata assinada',
      targetUrl: '/atas/detalhe/00023%2F2026-200331/itens/00003?aba=quantitativos',
      avisoChave: 'SALDO::00023/2026-200331::ATA-ASSINADA-2'
    });
    expect(lista[0].description).toBe('Ata 00023/2026: 2 itens já alocados com limite provisório (registrado da SENASP); 3 itens com outros órgãos registrados');
  });

  it('sem alocação, ata informada, participante ou adesão: nenhuma pendência', () => {
    expect(pendencias([linha({ total_alocado_unidades: 0 })])).toEqual([]);
    expect(pendencias([linha({ ata_assinada_informada: true })])).toEqual([]);
    expect(pendencias([linha({ codigo_uasg: '200342', papel_senasp: 'PARTICIPANTE' })])).toEqual([]);
    expect(pendencias([linha({ codigo_uasg: '200334', papel_senasp: 'ADESAO' })])).toEqual([]);
  });
});
