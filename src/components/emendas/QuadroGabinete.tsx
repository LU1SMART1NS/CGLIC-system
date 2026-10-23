import React, { useMemo, useState } from 'react';
import { Copy, MessageCircle } from 'lucide-react';
import { AppButton } from '../../design-system/components/AppButton';
import { Tabs } from '../../design-system/components/Tabs';
import { useToast } from '../../design-system/components/Toast';
import { useBeneficiariosEmendas, useItensCaep } from '../../hooks/useEmendas';
import { usePrecosPrevistos } from '../../hooks/useEmendasQuadro';
import { brl, htmlParaSei, montarQuadro, textoParaWhatsapp, type LinhaDoPedidoNoQuadro } from '../../utils/emendasQuadro';
import type { AutorEmenda } from '../../services/emendasService';

const borda = '1px solid #000';
const celula: React.CSSProperties = { border: borda, padding: '0.35rem 0.4rem', textAlign: 'center', verticalAlign: 'middle' };
const aDefinir: React.CSSProperties = { color: 'var(--color-text-muted, #64748b)' };
const aviso: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 600,
  padding: '0.45rem 0.7rem',
  borderRadius: 6,
  background: 'var(--color-info-bg, #e6eefb)',
  color: 'var(--color-info-text, #155bcb)'
};

/**
 * Copia a tabela como HTML (o SEI cola com linhas e colunas) e o texto como reserva; o WhatsApp leva só o texto.
 * Sem a área de transferência moderna (navegador antigo ou bloqueado), copia pela seleção da página.
 */
async function copiar(html: string | null, texto: string): Promise<void> {
  const area = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  try {
    if (html && area?.write && typeof ClipboardItem !== 'undefined') {
      await area.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([texto], { type: 'text/plain' }) })]);
      return;
    }
    if (area?.writeText) {
      await area.writeText(texto);
      return;
    }
  } catch {
    // segue para a cópia pela seleção
  }
  copiarPelaSelecao(html, texto);
}

function copiarPelaSelecao(html: string | null, texto: string): void {
  const caixa = document.createElement('div');
  caixa.setAttribute('aria-hidden', 'true');
  caixa.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre-wrap';
  if (html) caixa.innerHTML = html;
  else caixa.textContent = texto;
  document.body.appendChild(caixa);
  const selecao = window.getSelection();
  const faixa = document.createRange();
  faixa.selectNodeContents(caixa);
  selecao?.removeAllRanges();
  selecao?.addRange(faixa);
  const ok = document.execCommand('copy');
  selecao?.removeAllRanges();
  caixa.remove();
  if (!ok) throw new Error('O navegador não deixou copiar. Selecione o quadro e use Ctrl+C.');
}

interface Props {
  autor: AutorEmenda | null | undefined;
  linhas: LinhaDoPedidoNoQuadro[];
  /** Data da reserva (AAAA-MM-DD). */
  data: string;
  testId?: string;
}

/**
 * Quadro da reserva para o gabinete (migration 165): o Anexo que a CAEP manda ao parlamentar, pronto para colar no
 * SEI (tabela) ou no WhatsApp (texto). O valor unitário já vem com o reajuste previsto da ata.
 */
export const QuadroGabinete: React.FC<Props> = ({ autor, linhas, data, testId = 'emendas-quadro' }) => {
  const toast = useToast();
  const { data: itensLista = [] } = useItensCaep();
  const { data: beneficiariosLista = [] } = useBeneficiariosEmendas();
  const { data: precos, isError: semPrecos } = usePrecosPrevistos();
  const [aba, setAba] = useState<'sei' | 'whatsapp'>('sei');

  const quadro = useMemo(
    () =>
      montarQuadro({
        autor,
        linhas,
        data,
        itens: new Map(itensLista.map((i) => [i.itemKey, i])),
        beneficiarios: new Map(beneficiariosLista.map((b) => [b.id, b])),
        precos: precos ?? new Map()
      }),
    [autor, linhas, data, itensLista, beneficiariosLista, precos]
  );
  const texto = useMemo(() => textoParaWhatsapp(quadro), [quadro]);
  const html = useMemo(() => htmlParaSei(quadro), [quadro]);

  if (!quadro.linhas.length) return null;

  const copiarPara = async (destino: 'sei' | 'whatsapp') => {
    try {
      await copiar(destino === 'sei' ? html : null, texto);
      toast.success(destino === 'sei' ? 'Tabela copiada: cole no SEI.' : 'Texto copiado: cole no WhatsApp.');
    } catch (err) {
      toast.error((err as Error).message || 'Não foi possível copiar.');
    }
  };

  const diferenca = quadro.total - quadro.totalHoje;
  const semGndMisturado = quadro.semGnd > 0 && quadro.semGnd < quadro.linhas.length;

  return (
    <section
      aria-label="Quadro para o gabinete"
      data-testid={testId}
      style={{ border: '1px solid #c7d7f0', background: '#f5f8fd', borderRadius: 10, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', maxWidth: 560 }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--primary)' }}>Quadro para o gabinete</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary, #334155)' }}>
            No formato do Anexo: uma linha por item e beneficiário, kit aberto nos seus itens. O valor unitário já vem com o reajuste previsto da ata.
          </span>
        </div>
        <Tabs
          ariaLabel="Formato do quadro"
          testId={`${testId}-abas`}
          activeTabId={aba}
          onTabChange={(id) => setAba(id as 'sei' | 'whatsapp')}
          tabs={[
            { id: 'sei', label: 'Tabela para o SEI' },
            { id: 'whatsapp', label: 'Texto para o WhatsApp' }
          ]}
        />
      </div>

      {semPrecos && <div style={aviso} role="status">Não foi possível ler o reajuste previsto: o quadro usa o preço de hoje das atas.</div>}
      {quadro.semBeneficiario > 0 && (
        <div style={aviso} role="status">
          {quadro.semBeneficiario === 1 ? '1 linha sai' : `${quadro.semBeneficiario} linhas saem`} com o beneficiário “a definir”.
        </div>
      )}
      {quadro.semOrgao > 0 && (
        <div style={aviso} role="status" data-testid={`${testId}-sem-orgao`}>
          {quadro.semOrgao === 1 ? '1 linha tem' : `${quadro.semOrgao} linhas têm`} beneficiário sem o órgão cadastrado: informe em Beneficiários para preencher a coluna ÓRGÃO.
        </div>
      )}
      {quadro.semNomeCurto > 0 && (
        <div style={aviso} role="status" data-testid={`${testId}-sem-nome`}>
          {quadro.semNomeCurto === 1 ? '1 item está' : `${quadro.semNomeCurto} itens estão`} sem nome curto e sai com o começo da descrição do catálogo: informe em Itens da CAEP.
        </div>
      )}
      {semGndMisturado && (
        <div style={aviso} role="status" data-testid={`${testId}-sem-gnd`}>
          {quadro.semGnd === 1 ? '1 item está' : `${quadro.semGnd} itens estão`} sem GND: informe em Itens da CAEP para o quadro separar investimento e custeio.
        </div>
      )}

      {aba === 'sei' ? (
        <div style={{ background: '#fff', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 8, padding: '0.9rem', overflowX: 'auto', fontFamily: 'Arial, Helvetica, sans-serif' }} data-testid={`${testId}-sei`}>
          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.6rem' }}>{quadro.titulo}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', minWidth: 720 }}>
            <thead>
              <tr>
                {['DESCRIÇÃO ITEM', 'ÓRGÃO', 'BENEFICIÁRIO FINAL', 'MUNICÍPIO', 'QTD', 'VR UNITÁRIO', 'VR TOTAL'].map((h) => (
                  <th key={h} style={{ ...celula, fontWeight: 700 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quadro.linhas.map((l, i) => (
                <tr key={i}>
                  <td style={{ ...celula, fontWeight: 700 }}>
                    {l.descricao}
                    {l.kit && <div style={{ fontWeight: 400 }}>({l.kit})</div>}
                  </td>
                  <td style={{ ...celula, ...(l.orgao ? null : aDefinir) }}>{l.orgao ?? 'a definir'}</td>
                  <td style={{ ...celula, ...(l.beneficiario ? null : aDefinir) }}>{l.beneficiario ?? 'a definir'}</td>
                  <td style={{ ...celula, ...(l.municipio ? null : aDefinir) }}>{l.municipio ?? 'a definir'}</td>
                  <td style={celula}>{l.quantidade}</td>
                  <td style={celula}>
                    {brl(l.unitario)}
                    {l.marca && <sup>{l.marca}</sup>}
                    {l.unitario !== l.hoje && <div style={{ color: 'var(--color-text-muted, #64748b)', fontSize: '0.75rem' }}>hoje {brl(l.hoje)}</div>}
                  </td>
                  <td style={celula}>{brl(l.total)}</td>
                </tr>
              ))}
              {quadro.porGnd.map((g) => (
                <tr key={g.rotulo}>
                  <td colSpan={6} style={{ ...celula, textAlign: 'right', fontWeight: 700 }}>
                    {g.rotulo}
                  </td>
                  <td style={{ ...celula, fontWeight: 700 }}>{brl(g.total)}</td>
                </tr>
              ))}
              <tr style={{ background: '#d9d9d9' }}>
                <td colSpan={6} style={{ ...celula, fontWeight: 700, padding: '0.7rem 0.4rem' }}>
                  TOTAL A EMPENHAR
                </td>
                <td style={{ ...celula, fontWeight: 700 }}>{brl(quadro.total)}</td>
              </tr>
            </tbody>
          </table>
          {quadro.notas.length > 0 && (
            <div style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: 'var(--color-text-secondary, #334155)', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              {quadro.notas.map((n) => (
                <span key={n}>{n}</span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: '#efeae2', borderRadius: 8, padding: '0.9rem', display: 'flex' }} data-testid={`${testId}-whatsapp`}>
          <div style={{ background: '#d9fdd3', borderRadius: 8, padding: '0.7rem 0.85rem', maxWidth: 640, fontSize: '0.8rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', color: '#111b21' }}>{texto}</div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary, #334155)' }}>
          Total a empenhar <b style={{ color: 'var(--primary)' }}>{brl(quadro.total)}</b>
          {quadro.porGnd.map((g) => ` · ${g.gnd ?? 'sem GND'} ${brl(g.total)}`).join('')}
          {diferenca > 0.004 ? ` · +${brl(diferenca)} sobre o preço de hoje` : ''}
        </span>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <AppButton type="button" icon={<Copy size={16} aria-hidden="true" />} onClick={() => void copiarPara('sei')} data-testid={`${testId}-copiar-sei`}>
            Copiar para o SEI
          </AppButton>
          <AppButton type="button" variant="outline" icon={<MessageCircle size={16} aria-hidden="true" />} onClick={() => void copiarPara('whatsapp')} data-testid={`${testId}-copiar-whatsapp`}>
            Copiar para o WhatsApp
          </AppButton>
        </div>
      </div>
    </section>
  );
};
