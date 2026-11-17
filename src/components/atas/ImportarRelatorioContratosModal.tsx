import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActionButton, AppButton, Modal, NoticeBar, StatusBadge, useToast } from '../../design-system';
import { compararItem, importarRelatorioAta, lerRegistradoDosItens, lerRelatorioDoPdf } from '../../services/relatorioAtaContratosService';
import type { RelatorioAtaContratos } from '../../services/relatorioAtaContratosParser';
import { CARTEIRA_ALOCACOES_KEY, CARTEIRA_VINCULOS_KEY } from '../../hooks/useCarteiraItens';
import { useCadastroUasgs } from '../../hooks/useCadastroUasgs';
import { normalizeItemKey } from '../../utils/itemKeyUtils';
import { formatDataHoraBR } from '../../utils/format';
import { formatNumber } from '../item-balances/itemBalanceUtils';

interface Props {
  onFechar: () => void;
  /** Ata aberta: o relatório tem de ser dela. */
  numeroAta: string;
  uasgAta: string;
}

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const celula: React.CSSProperties = { padding: '0.4rem 0.6rem' };
const numero: React.CSSProperties = { ...celula, textAlign: 'right', fontFamily: 'monospace' };

/**
 * Importa o "Relatório Ata de Registro de Preços" do Contratos.gov.br (migration 325), aberto na Ata 360: o relatório
 * é da ata e grava todos os itens que trouxer. O Compras.gov.br deixou de publicar remanejamentos que o
 * Contratos.gov.br já mostra; a janela mostra, item a item, o que muda antes de gravar. Quem abre monta a janela só
 * enquanto ela está aberta (o estado começa limpo).
 */
export const ImportarRelatorioContratosModal: React.FC<Props> = (p) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [lendo, setLendo] = React.useState(false);
  const [relatorio, setRelatorio] = React.useState<RelatorioAtaContratos | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [verIguais, setVerIguais] = React.useState(false);
  const entrada = React.useRef<HTMLInputElement>(null);
  const importar = useMutation({ mutationFn: importarRelatorioAta, retry: 0 });

  const chaves = React.useMemo(
    () => (relatorio?.itens ?? []).map((i) => normalizeItemKey(relatorio!.numeroAta, relatorio!.uasg, i.numeroItem)),
    [relatorio]
  );
  const agora = useQuery({
    queryKey: ['relatorio-contratos-agora', chaves.join(',')],
    queryFn: () => lerRegistradoDosItens(chaves),
    enabled: chaves.length > 0,
    staleTime: 0,
    retry: 1
  });
  const cadastro = useCadastroUasgs((relatorio?.itens ?? []).flatMap((i) => i.unidades.map((u) => u.uasg)));

  const escolher = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setErro(null);
    setRelatorio(null);
    setLendo(true);
    try {
      const r = await lerRelatorioDoPdf(arquivo);
      if (r.numeroAta !== p.numeroAta || r.uasg !== digitos(p.uasgAta)) {
        setErro(`Este relatório é da ata ${r.numeroAta} da UASG ${r.uasg}; a ata aberta é a ${p.numeroAta} da UASG ${digitos(p.uasgAta)}.`);
      } else {
        setRelatorio(r);
      }
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível ler o PDF.');
    } finally {
      setLendo(false);
      if (entrada.current) entrada.current.value = '';
    }
  };

  const itens = React.useMemo(() => {
    if (!relatorio || !agora.data) return [];
    const nomeConhecido = (uasg: string) => cadastro.get(uasg)?.nome ?? null;
    return relatorio.itens.map((i, n) => {
      const linhas = compararItem(i.unidades, agora.data.get(chaves[n]), nomeConhecido);
      return { ...i, linhas, mudam: linhas.filter((l) => l.muda) };
    });
  }, [relatorio, agora.data, chaves, cadastro]);
  const totalMudam = itens.reduce((s, i) => s + i.mudam.length, 0);
  const itensQueMudam = itens.filter((i) => i.mudam.length > 0).length;

  const gravar = async () => {
    if (!relatorio) return;
    setErro(null);
    try {
      const res = await importar.mutateAsync(relatorio);
      for (const k of [['item-relatorio-contratos'], ['item-copia'], ['quantitativos-do-item'], ['ata-item-saldos'], ['item-allocations'], CARTEIRA_ALOCACOES_KEY, CARTEIRA_VINCULOS_KEY]) {
        queryClient.invalidateQueries({ queryKey: k as readonly unknown[] });
      }
      const mudancas = res.importados.reduce((s, i) => s + i.mudancas, 0);
      const maisAntigo = res.fora.filter((f) => f.motivo === 'RELATORIO_MAIS_ANTIGO').map((f) => f.numeroItem);
      const foraDaAta = res.fora.filter((f) => f.motivo === 'ITEM_FORA_DA_ATA').map((f) => f.numeroItem);
      toast.success(`Relatório importado: ${res.importados.length} ${res.importados.length === 1 ? 'item' : 'itens'}, ${mudancas} ${mudancas === 1 ? 'órgão mudou' : 'órgãos mudaram'}.`);
      if (maisAntigo.length) toast.show(`${maisAntigo.length === 1 ? 'Item' : 'Itens'} ${maisAntigo.join(', ')} de fora: já há um relatório mais novo importado.`, 'warning');
      if (foraDaAta.length) toast.show(`${foraDaAta.length === 1 ? 'Item' : 'Itens'} ${foraDaAta.join(', ')} de fora: não ${foraDaAta.length === 1 ? 'está' : 'estão'} nesta ata no sistema.`, 'warning');
      p.onFechar();
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível gravar o relatório.');
    }
  };

  const pronto = Boolean(relatorio && agora.data);

  return (
    <Modal
      isOpen
      onClose={p.onFechar}
      dismissible={!importar.isPending}
      size="lg"
      title="Importar relatório do Contratos.gov.br"
      subtitle={`Ata ${p.numeroAta}`}
      testId="importar-relatorio-contratos"
      footer={
        <>
          <ActionButton action="cancelar" onClick={p.onFechar} disabled={importar.isPending} />
          <AppButton variant="primary" onClick={gravar} disabled={!pronto || importar.isPending} data-testid="importar-relatorio-gravar">
            {importar.isPending ? 'Gravando…' : 'Gravar'}
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
        <div style={{ color: 'var(--text-secondary)' }}>
          No Contratos.gov.br, abra a ata e gere o <b>Relatório Ata de Registro de Preços</b> em PDF. A quantidade de cada
          órgão, em todos os itens do relatório, passa a valer no lugar da do Compras.gov.br, até ele publicar uma
          atualização mais nova do órgão.
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={entrada} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
            onChange={(e) => void escolher(e.target.files?.[0])} data-testid="importar-relatorio-arquivo" />
          <AppButton variant="outline" onClick={() => entrada.current?.click()} disabled={lendo || importar.isPending} data-testid="importar-relatorio-escolher">
            {lendo ? 'Lendo o PDF…' : relatorio ? 'Escolher outro PDF' : 'Escolher o PDF'}
          </AppButton>
          {relatorio && (
            <span data-testid="importar-relatorio-resumo">
              Gerado em {formatDataHoraBR(relatorio.geradoEm)} · {relatorio.itens.length} {relatorio.itens.length === 1 ? 'item' : 'itens'}
            </span>
          )}
        </div>

        {erro && <NoticeBar tone="danger" testId="importar-relatorio-erro">{erro}</NoticeBar>}
        {agora.isError && <NoticeBar tone="danger">Não foi possível ler os números de agora para comparar. Tente de novo.</NoticeBar>}
        {relatorio?.avisos.map((a) => <NoticeBar key={a} tone="warning">{a}</NoticeBar>)}
        {relatorio && agora.isLoading && <div style={{ color: 'var(--text-muted)' }}>Comparando com os números de agora…</div>}

        {pronto && (
          <>
            <div data-testid="importar-relatorio-total">
              {totalMudam === 0
                ? <><StatusBadge label="Sem diferença" variant="success" size="sm" dot={false} /> O relatório tem as mesmas quantidades do sistema.</>
                : <><StatusBadge label={`${totalMudam} ${totalMudam === 1 ? 'órgão muda' : 'órgãos mudam'}`} variant="info" size="sm" dot={false} /> em {itensQueMudam} de {itens.length} {itens.length === 1 ? 'item' : 'itens'}.</>}
              {' '}
              <AppButton variant="ghost" size="xs" onClick={() => setVerIguais((v) => !v)} data-testid="importar-relatorio-ver-iguais">
                {verIguais ? 'Só o que muda' : 'Ver todos os órgãos'}
              </AppButton>
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'auto', maxHeight: '48vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="importar-relatorio-tabela">
                <thead>
                  <tr style={{ background: 'var(--bg-card-hover)', textAlign: 'left', position: 'sticky', top: 0 }}>
                    <th style={celula}>Órgão</th>
                    <th style={{ ...celula, textAlign: 'right' }}>Agora</th>
                    <th style={{ ...celula, textAlign: 'right' }}>No relatório</th>
                    <th style={{ ...celula, textAlign: 'right' }}>Disponível</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.filter((i) => verIguais || i.mudam.length > 0).map((i) => (
                    <React.Fragment key={i.numeroItem}>
                      <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }} data-testid={`importar-relatorio-item-${i.numeroItem}`}>
                        <td colSpan={4} style={{ ...celula, fontWeight: 700 }}>
                          Item {i.numeroItem}
                          <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                            {' · '}{i.mudam.length === 0 ? 'sem diferença' : `${i.mudam.length} ${i.mudam.length === 1 ? 'órgão muda' : 'órgãos mudam'}`}
                            {' · '}soma {formatNumber(i.somaRegistrada)}{i.homologado !== null ? ` de ${formatNumber(i.homologado)} homologado` : ''}
                          </span>
                        </td>
                      </tr>
                      {(verIguais ? i.linhas : i.mudam).map((l) => (
                        <tr key={l.uasg} style={{ borderTop: '1px solid var(--border)', fontWeight: l.muda ? 700 : 400 }} data-testid={`importar-relatorio-linha-${i.numeroItem}-${l.uasg}`}>
                          <td style={celula}>
                            <div>{l.nome}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>UASG {l.uasg}</div>
                          </td>
                          <td style={numero}>{l.agora === null ? '—' : formatNumber(l.agora)}</td>
                          <td style={numero}>{l.relatorio === null ? 'não consta' : formatNumber(l.relatorio)}</td>
                          <td style={numero}>{l.saldo === null ? '—' : formatNumber(l.saldo)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
