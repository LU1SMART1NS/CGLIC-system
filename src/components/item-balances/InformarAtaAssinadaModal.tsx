import React from 'react';
import { ActionButton, AppButton, AppInput, AppTextarea, Modal, NoticeBar, StatusBadge, useToast } from '../../design-system';
import { useAcoesQuantitativos } from '../../hooks/useQuantitativosDoItem';
import { documentoSeiValido } from '../../utils/quantitativos';
import { formatNumber } from './itemBalanceUtils';

/** Órgão na janela: o registrado do Compras.gov.br aparece ao lado, só para comparar. */
export interface OrgaoParaInformar {
  uasg: string;
  nome: string;
  registrado: number | null;
  /** Quantidade já informada (correção); nula na primeira vez. */
  assinada: number | null;
  ehSenasp: boolean;
}

interface NovoOrgao {
  id: number;
  uasg: string;
  nome: string;
  quantidade: string;
}

interface Props {
  aberto: boolean;
  itemKey: string;
  tituloItem: string;
  homologado: number;
  orgaos: OrgaoParaInformar[];
  /** Já informada: a janela é de correção e pede justificativa. */
  corrigir: boolean;
  documentoSeiAtual: string | null;
  onFechar: () => void;
}

const inteiro = (v: string) => /^\d+$/.test(v.trim());

/**
 * Informar (ou corrigir) a quantidade de cada órgão na ata assinada — gestor da ata ou coordenador.
 * Grava a lista inteira de uma vez (informar_quantidades_ata_assinada, migration 109).
 */
export const InformarAtaAssinadaModal: React.FC<Props> = ({ aberto, itemKey, tituloItem, homologado, orgaos, corrigir, documentoSeiAtual, onFechar }) => {
  const toast = useToast();
  const { informar } = useAcoesQuantitativos(itemKey);
  const [valores, setValores] = React.useState<Record<string, string>>({});
  const [novos, setNovos] = React.useState<NovoOrgao[]>([]);
  const [documento, setDocumento] = React.useState('');
  const [justificativa, setJustificativa] = React.useState('');
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!aberto) return;
    setValores(Object.fromEntries(orgaos.map((o) => [o.uasg, o.assinada != null ? String(o.assinada) : ''])));
    setNovos([]);
    setDocumento(documentoSeiAtual ?? '');
    setJustificativa('');
    setErro(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const soma = orgaos.reduce((s, o) => s + (inteiro(valores[o.uasg] ?? '') ? Number(valores[o.uasg]) : 0), 0)
    + novos.reduce((s, n) => s + (inteiro(n.quantidade) ? Number(n.quantidade) : 0), 0);
  const copiarRegistrado = () => setValores(Object.fromEntries(orgaos.map((o) => [o.uasg, valores[o.uasg]?.trim() ? valores[o.uasg] : String(o.registrado ?? 0)])));

  const gravar = async () => {
    setErro(null);
    const faltando = orgaos.filter((o) => !inteiro(valores[o.uasg] ?? ''));
    if (faltando.length > 0) {
      return setErro(`Preencha a quantidade de todos os órgãos com um número inteiro (use 0 para quem não está na ata assinada). Faltam ${faltando.length}.`);
    }
    for (const n of novos) {
      if (!n.uasg.trim() && !n.nome.trim() && !n.quantidade.trim()) continue;
      if (!/^\d{6}$/.test(n.uasg.trim())) return setErro('A UASG do órgão novo tem 6 dígitos.');
      if (orgaos.some((o) => o.uasg === n.uasg.trim()) || novos.filter((x) => x.uasg.trim() === n.uasg.trim()).length > 1) return setErro(`A UASG ${n.uasg.trim()} já está na lista.`);
      if (!n.nome.trim()) return setErro('Escreva o nome do órgão novo.');
      if (!inteiro(n.quantidade)) return setErro(`Informe a quantidade da UASG ${n.uasg.trim()} (número inteiro).`);
    }
    if (!documentoSeiValido(documento)) return setErro('O número do documento SEI tem 8 dígitos (ex.: 12345678).');
    if (corrigir && justificativa.trim().length < 15) return setErro('Escreva a justificativa da correção (mínimo de 15 caracteres).');
    try {
      await informar.mutateAsync({
        quantidades: [
          ...orgaos.map((o) => ({ uasg: o.uasg, quantidade: Number(valores[o.uasg]), nome: o.registrado == null ? o.nome : null })),
          ...novos.filter((n) => n.uasg.trim()).map((n) => ({ uasg: n.uasg.trim(), quantidade: Number(n.quantidade), nome: n.nome.trim() }))
        ],
        documentoSei: documento,
        justificativa: corrigir ? justificativa : null
      });
      toast.success(corrigir ? 'Quantidades da ata assinada corrigidas.' : 'Quantidades da ata assinada informadas.');
      onFechar();
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível gravar as quantidades.');
    }
  };

  return (
    <Modal
      isOpen={aberto}
      onClose={onFechar}
      dismissible={!informar.isPending}
      size="lg"
      title={corrigir ? 'Corrigir qtd. da ata assinada' : 'Informar qtd. da ata assinada'}
      subtitle={`${tituloItem} · homologado ${formatNumber(homologado)}`}
      testId="informar-ata-assinada"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onFechar} disabled={informar.isPending} />
          <AppButton variant="primary" onClick={gravar} disabled={informar.isPending} data-testid="informar-ata-assinada-gravar">
            {informar.isPending ? 'Gravando…' : 'Gravar'}
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Digite a quantidade de cada órgão como está na ata assinada. O registrado do Compras.gov.br aparece ao lado só para comparar.
          {' '}<AppButton variant="outline" size="xs" onClick={copiarRegistrado} data-testid="informar-copiar-registrado">Copiar o registrado nos campos vazios</AppButton>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'auto', maxHeight: '46vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-card-hover)', textAlign: 'left' }}>
                <th style={{ padding: '0.45rem 0.6rem' }}>Órgão</th>
                <th style={{ padding: '0.45rem 0.6rem', textAlign: 'right' }}>Registrado</th>
                <th style={{ padding: '0.45rem 0.6rem', textAlign: 'right' }}>Qtd. na ata assinada</th>
              </tr>
            </thead>
            <tbody>
              {orgaos.map((o) => (
                <tr key={o.uasg} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.4rem 0.6rem' }}>
                    <div style={{ fontWeight: 700 }}>{o.nome}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>UASG {o.uasg}{o.ehSenasp ? ' · SENASP' : ''}</div>
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontFamily: 'monospace' }}>{o.registrado == null ? '—' : formatNumber(o.registrado)}</td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>
                    <AppInput
                      aria-label={`Quantidade de ${o.nome} na ata assinada`}
                      inputMode="numeric"
                      value={valores[o.uasg] ?? ''}
                      placeholder={o.registrado != null ? String(o.registrado) : '0'}
                      onChange={(e) => setValores((v) => ({ ...v, [o.uasg]: e.target.value.replace(/\D/g, '') }))}
                      style={{ width: 110, textAlign: 'right' }}
                      data-testid={`informar-qtd-${o.uasg}`}
                    />
                  </td>
                </tr>
              ))}
              {novos.map((n) => (
                <tr key={n.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.4rem 0.6rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <AppInput aria-label="UASG do órgão novo" inputMode="numeric" maxLength={6} placeholder="UASG" value={n.uasg} style={{ width: 100 }}
                      onChange={(e) => setNovos((l) => l.map((x) => (x.id === n.id ? { ...x, uasg: e.target.value.replace(/\D/g, '') } : x)))} />
                    <AppInput aria-label="Nome do órgão novo" placeholder="Nome do órgão" value={n.nome} style={{ flex: '1 1 180px' }}
                      onChange={(e) => setNovos((l) => l.map((x) => (x.id === n.id ? { ...x, nome: e.target.value } : x)))} />
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)' }}>sem registro</td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>
                    <AppInput aria-label="Quantidade do órgão novo" inputMode="numeric" value={n.quantidade} style={{ width: 110, textAlign: 'right' }}
                      onChange={(e) => setNovos((l) => l.map((x) => (x.id === n.id ? { ...x, quantidade: e.target.value.replace(/\D/g, '') } : x)))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <AppButton variant="outline" size="sm" onClick={() => setNovos((l) => [...l, { id: Date.now(), uasg: '', nome: '', quantidade: '' }])} data-testid="informar-novo-orgao">
            + Órgão que está na ata assinada e não aparece aqui
          </AppButton>
        </div>
        <div style={{ fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', fontVariantNumeric: 'tabular-nums' }}>
          Soma informada <strong>{formatNumber(soma)}</strong> · homologado do item <strong>{formatNumber(homologado)}</strong>
          {soma === homologado
            ? <StatusBadge label="confere" variant="success" size="sm" dot={false} />
            : <StatusBadge label={`diferença de ${formatNumber(soma - homologado)}: grava com aviso`} variant="warning" size="sm" dot={false} />}
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600 }}>
          Número do documento SEI da ata assinada (8 dígitos)
          <AppInput inputMode="numeric" maxLength={8} placeholder="12345678" value={documento} style={{ width: 150 }}
            onChange={(e) => setDocumento(e.target.value.replace(/\D/g, ''))} data-testid="informar-documento-sei" />
        </label>
        {corrigir && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600 }}>
            Justificativa da correção (obrigatória)
            <AppTextarea rows={3} placeholder="Por que as quantidades mudaram" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} data-testid="informar-justificativa" />
          </label>
        )}
        {erro && <NoticeBar tone="danger" testId="informar-erro">{erro}</NoticeBar>}
      </div>
    </Modal>
  );
};
