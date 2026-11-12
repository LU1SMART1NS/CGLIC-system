import { describe, it, expect } from 'vitest';
import { formatPncpAtaPdfUrl } from '../pncpUtils';
import { orgaosAcimaDaAtaAssinada, registradoAcimaDoSaldo, ataFoiProrrogada } from '../registradoAcima';

describe('registrado acima do homologado (migration 142)', () => {
  it('PDF da ata no PNCP pelo número de controle', () => {
    expect(formatPncpAtaPdfUrl('00394494000136-1-001130/2024-000001')).toBe('https://pncp.gov.br/pncp-api/v1/orgaos/00394494000136/compras/2024/1130/atas/1/arquivos/1');
    expect(formatPncpAtaPdfUrl('')).toBe('');
    expect(formatPncpAtaPdfUrl('qualquer coisa')).toBe('');
  });

  it('lê as colunas da view; sem chave, sem aviso', () => {
    expect(registradoAcimaDoSaldo({ registrado_acima_chave: null })).toBeNull();
    expect(registradoAcimaDoSaldo(undefined)).toBeNull();
    expect(registradoAcimaDoSaldo({
      registrado_acima_chave: 'SALDO::x', quantidade_homologada: '1782', soma_registrado: '2081', excedente_registrado: '299',
      excedente_registrado_senasp: '7', desconto_registrado_acima: '7', registrado_acima_resolvido: false, ata_assinada_informada: true
    })).toEqual({ homologado: 1782, somaRegistrado: 2081, excedente: 299, excedenteSenasp: 7, desconto: 7, chave: 'SALDO::x', resolvido: false, ataAssinadaInformada: true });
  });

  it('órgãos acima da ata assinada: na SENASP conta o registrado menos o gerenciado', () => {
    const o = (uasg: string, assinada: number, registrado: number | null, ehSenasp = false) => ({ uasg, ehSenasp, quantidadeAssinada: assinada, quantidadeRegistrada: registrado, gerenciado: 0 } as any);
    expect(orgaosAcimaDaAtaAssinada([o('200331', 89, 100, true), o('200334', 272, 544), o('927032', 134, 134), o('926016', 30, null)], 4))
      .toEqual([
        { uasg: '200334', ehSenasp: false, assinada: 272, registrado: 544, acima: 272 },
        { uasg: '200331', ehSenasp: true, assinada: 89, registrado: 96, acima: 7 }
      ]);
  });
});

describe('ataFoiProrrogada (migration 223)', () => {
  it('vigência de mais de um ano é prorrogada; um ano ou sem data, não', () => {
    expect(ataFoiProrrogada('2024-12-12', '2026-12-11')).toBe(true);
    expect(ataFoiProrrogada('2025-10-10', '2026-10-10')).toBe(false);
    expect(ataFoiProrrogada(null, '2026-10-10')).toBe(false);
  });
});
