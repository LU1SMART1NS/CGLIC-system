import React, { useMemo, useState } from 'react';
import { Copy, MessageCircle } from 'lucide-react';
import { AppButton } from '../../design-system/components/AppButton';
import { copiar } from '../../utils/copiarQuadro';
import { Tabs } from '../../design-system/components/Tabs';
import { InfoHint } from '../../design-system/components/InfoHint';
import { useToast } from '../../design-system/components/Toast';
import { hojeEmBrasilia, useBeneficiariosEmendas, useItensCaep } from '../../hooks/useEmendas';
import { usePrecosParaEmenda } from '../../hooks/useEmendasQuadro';
import { ataEItem, brl, COLUNAS, emendaNoQuadro, htmlDaTabela, montarQuadro, reais, textoParaWhatsapp, type LinhaDoPedidoNoQuadro } from '../../utils/emendasQuadro';
import type { AutorEmenda } from '../../services/emendasService';
import { dataBR } from '../../utils/emendasKits';
import { itensDaLinha } from '../../utils/emendasPedidos';
import { podeIrNaMinuta, reajusteDoItem, tramiteAteContratoDias, validadeMinutaDiasUteis } from '../../utils/emendasReajuste';

const borda = '1px solid #000';
const celula: React.CSSProperties = { border: borda, padding: '0.35rem 0.4rem', textAlign: 'center', verticalAlign: 'middle' };
const celulaValor: React.CSSProperties = { ...celula, whiteSpace: 'nowrap' };
const aDefinir: React.CSSProperties = { color: 'var(--color-text-muted, #64748b)' };
const abaixo: React.CSSProperties = { fontWeight: 400, fontSize: '0.7rem', color: 'var(--color-text-secondary, #334155)' };
const aviso: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 600,
  padding: '0.45rem 0.7rem',
  borderRadius: 6,
  background: 'var(--color-info-bg, #e6eefb)',
  color: 'var(--color-info-text, #155bcb)'
};


/** Explicação do ⓘ ao lado do título. */
const AJUDA_DO_QUADRO =
  'A Tabela 1 é para colar no Word ou no SEI: cada item aparece uma vez, com uma linha para cada beneficiário, e os kits ' +
  'já vêm abertos nos seus itens. O texto é a versão curta para mandar ao parlamentar pelo WhatsApp. Os valores são o preço ' +
  'de hoje das atas: o ofício precisa pedir exatamente esses valores, que são os empenhados. O prazo do ofício é curto (dias ' +
  'úteis de Ajustes), e menor quando alguma ata reajusta ou termina logo, para o contrato sair antes pelo mesmo preço.';

interface Props {
  autor: AutorEmenda | null | undefined;
  linhas: LinhaDoPedidoNoQuadro[];
  /** Data da reserva (AAAA-MM-DD). */
  data: string;
  /** Prazo do ofício gravado quando a minuta foi registrada (migration 246). */
  minutaValidaAte?: string | null;
  /** Emenda do pedido (migration 243): sai na coluna EMENDA e no texto do WhatsApp. */
  emenda?: { numero: string; ano: number } | null;
  testId?: string;
}

/**
 * Quadro da reserva para o parlamentar (migration 165): o Anexo que a CAEP manda ao parlamentar, pronto para colar no
 * Word ou no SEI (tabela) ou no WhatsApp (texto). O valor unitário é o preço de hoje da ata (migration 246).
 */
export const QuadroGabinete: React.FC<Props> = ({ autor, linhas, data, minutaValidaAte, emenda, testId = 'emendas-quadro' }) => {
  const toast = useToast();
  const { data: itensLista = [] } = useItensCaep();
  const { data: beneficiariosLista = [] } = useBeneficiariosEmendas();
  const { precos, semPrevisao: semPrecos } = usePrecosParaEmenda();
  const hoje = hojeEmBrasilia();
  const [aba, setAba] = useState<'sei' | 'whatsapp'>('sei');

  const quadro = useMemo(
    () =>
      montarQuadro({
        autor,
        linhas,
        data,
        hoje,
        prazoGravado: minutaValidaAte,
        itens: new Map(itensLista.map((i) => [i.itemKey, i])),
        beneficiarios: new Map(beneficiariosLista.map((b) => [b.id, b])),
        precos: precos ?? new Map(),
        emenda
      }),
    [autor, linhas, data, hoje, minutaValidaAte, itensLista, beneficiariosLista, precos, emenda]
  );
  // Itens que não podem sair na minuta (migration 246): a menos do tempo até o contrato do reajuste, ou com o devido.
  const foraDaMinuta = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const l of linhas)
      for (const x of itensDaLinha(l)) {
        const r = reajusteDoItem(precos?.get(x.itemKey), hoje);
        if (!podeIrNaMinuta(r)) vistos.set(x.itemKey.split('-')[0], `ata ${x.itemKey.split('-')[0]} (${r.rotulo?.toLowerCase()})`);
      }
    return [...vistos.values()];
  }, [linhas, precos, hoje]);
  const texto = useMemo(() => textoParaWhatsapp(quadro), [quadro]);
  const html = useMemo(() => htmlDaTabela(quadro), [quadro]);

  if (!quadro.linhas.length) return null;

  const copiarPara = async (destino: 'sei' | 'whatsapp') => {
    try {
      await copiar(destino === 'sei' ? html : null, texto);
      toast.success(destino === 'sei' ? 'Tabela copiada: cole no Word ou no SEI.' : 'Texto copiado: cole no WhatsApp.');
    } catch (err) {
      toast.error((err as Error).message || 'Não foi possível copiar.');
    }
  };

  const semGndMisturado = quadro.semGnd > 0 && quadro.semGnd < quadro.linhas.length;

  return (
    <section
      aria-label="Quadro para o parlamentar"
      data-testid={testId}
      style={{ border: '1px solid #c7d7f0', background: '#f5f8fd', borderRadius: 10, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--primary)' }}>Quadro para o parlamentar</span>
          <InfoHint label="Como o quadro é montado" testId={`${testId}-ajuda`} content={AJUDA_DO_QUADRO} />
        </div>
        <Tabs
          ariaLabel="Formato do quadro"
          testId={`${testId}-abas`}
          activeTabId={aba}
          onTabChange={(id) => setAba(id as 'sei' | 'whatsapp')}
          tabs={[
            { id: 'sei', label: 'Tabela' },
            { id: 'whatsapp', label: 'Texto' }
          ]}
        />
      </div>

      {quadro.prazoDoOficio && (
        <div style={aviso} role="status" data-testid={`${testId}-prazo`}>
          Enviar o ofício até {dataBR(quadro.prazoDoOficio.data)}
          {quadro.prazoDoOficio.pela === 'REAJUSTE'
            ? ` (reajuste da ata ${quadro.prazoDoOficio.ata} menos ${tramiteAteContratoDias()} dias até o contrato)`
            : quadro.prazoDoOficio.pela === 'ATA'
              ? ` (prazo de indicação da ata ${quadro.prazoDoOficio.ata})`
              : minutaValidaAte
                ? ' (prazo gravado com a minuta)'
                : ` (${validadeMinutaDiasUteis()} dias úteis)`}
          . Depois disso, nova minuta com o preço do dia.
        </div>
      )}
      {foraDaMinuta.length > 0 && !minutaValidaAte && (
        <div style={{ ...aviso, background: 'var(--color-danger-bg, #fde8e6)', color: 'var(--color-danger-text, #b3261e)' }} role="alert" data-testid={`${testId}-fora-da-minuta`}>
          A minuta não pode sair com {foraDaMinuta.join(', ')}: não dá tempo de assinar o contrato pelo preço de hoje. Troque ou retire o item.
        </div>
      )}
      {semPrecos && <div style={aviso} role="status">Não foi possível ler o reajuste das atas: confira se algum item está perto do reajuste antes de enviar.</div>}
      {quadro.semBeneficiario > 0 && (
        <div style={aviso} role="status">
          {quadro.semBeneficiario === 1 ? '1 item sai' : `${quadro.semBeneficiario} itens saem`} com o beneficiário “a definir”.
        </div>
      )}
      {quadro.semNomeCurto > 0 && (
        <div style={aviso} role="status" data-testid={`${testId}-sem-nome`}>
          {quadro.semNomeCurto === 1 ? '1 item está' : `${quadro.semNomeCurto} itens estão`} sem o nome da ata assinada e sai com o começo da descrição do catálogo: informe em Emendas › Itens.
        </div>
      )}
      {semGndMisturado && (
        <div style={aviso} role="status" data-testid={`${testId}-sem-gnd`}>
          {quadro.semGnd === 1 ? '1 item está' : `${quadro.semGnd} itens estão`} sem GND: informe em Emendas › Itens para o quadro separar investimento e custeio.
        </div>
      )}

      {aba === 'sei' ? (
        <div style={{ background: '#fff', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 8, padding: '0.9rem', overflowX: 'auto', fontFamily: 'Arial, Helvetica, sans-serif' }} data-testid={`${testId}-sei`}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', minWidth: 760 }}>
            <thead>
              <tr>
                {COLUNAS.map((h) => (
                  <th key={h} style={{ ...celula, fontWeight: 700 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quadro.linhas.map((l, i) => (
                <tr key={i}>
                  {i === 0 && (
                    <td style={celula} rowSpan={quadro.linhas.length} data-testid={`${testId}-emenda`}>
                      {quadro.emenda ? <b>{emendaNoQuadro(quadro)}</b> : <span style={aDefinir}>a informar</span>}
                    </td>
                  )}
                  <td style={celula}>
                    {l.beneficiario ? (
                      <>
                        <b>{l.beneficiario}</b>
                        {l.sigla && <> · <span style={{ whiteSpace: 'nowrap' }}>{l.sigla}</span></>}
                        {l.razaoSocial && <div style={abaixo}>{l.razaoSocial}</div>}
                      </>
                    ) : (
                      <span style={aDefinir}>a definir</span>
                    )}
                  </td>
                  <td style={celula}>{l.quantidade}</td>
                  {l.linhasDoItem > 0 && (
                    <td style={celula} rowSpan={l.linhasDoItem}>
                      <b>{l.descricao}</b>
                      {ataEItem(l) && <div style={abaixo}>{ataEItem(l)}</div>}
                    </td>
                  )}
                  {l.linhasDoItem > 0 && (
                    <td style={celulaValor} rowSpan={l.linhasDoItem}>
                      {reais(l.unitario)}
                    </td>
                  )}
                  <td style={celulaValor}>{reais(l.total)}</td>
                </tr>
              ))}
              {quadro.porGnd.map((g) => (
                <tr key={g.rotulo}>
                  <td colSpan={COLUNAS.length - 1} style={{ ...celula, textAlign: 'right', fontWeight: 700 }}>
                    {g.rotulo}
                  </td>
                  <td style={{ ...celulaValor, fontWeight: 700 }}>{reais(g.total)}</td>
                </tr>
              ))}
              <tr style={{ background: '#d9d9d9' }}>
                <td colSpan={COLUNAS.length - 1} style={{ ...celula, fontWeight: 700, padding: '0.7rem 0.4rem', textAlign: 'right' }}>
                  TOTAL A EMPENHAR (R$)
                </td>
                <td style={{ ...celulaValor, fontWeight: 700 }}>{reais(quadro.total)}</td>
              </tr>
            </tbody>
          </table>
          {/* O título vai embaixo da tabela. */}
          <div style={{ textAlign: 'left', fontSize: '0.75rem', marginTop: '0.25rem' }}>{quadro.titulo}</div>
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
        </span>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <AppButton type="button" icon={<Copy size={16} aria-hidden="true" />} onClick={() => void copiarPara('sei')} data-testid={`${testId}-copiar-sei`}>
            Copiar tabela
          </AppButton>
          <AppButton type="button" variant="outline" icon={<MessageCircle size={16} aria-hidden="true" />} onClick={() => void copiarPara('whatsapp')} data-testid={`${testId}-copiar-whatsapp`}>
            Copiar texto
          </AppButton>
        </div>
      </div>
    </section>
  );
};
