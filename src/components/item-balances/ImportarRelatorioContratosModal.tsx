import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActionButton, AppButton, Modal, NoticeBar, StatusBadge, useToast } from '../../design-system';
import { importarRelatorioAta, lerRelatorioDoPdf } from '../../services/relatorioAtaContratosService';
import type { RelatorioAtaContratos } from '../../services/relatorioAtaContratosParser';
import { QUANTITATIVOS_DO_ITEM_KEY } from '../../hooks/useQuantitativosDoItem';
import { CARTEIRA_ALOCACOES_KEY, CARTEIRA_VINCULOS_KEY } from '../../hooks/useCarteiraItens';
import { formatDataHoraBR } from '../../utils/format';
import { formatNumber } from './itemBalanceUtils';
import type { UnidadeItemRecord } from '../../types';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  itemKey: string;
  tituloItem: string;
  /** Ata do item: o relatório tem de ser dela. */
  numeroAta: string;
  uasgAta: string;
  numeroItem: number;
  /** Órgãos na tela agora, para comparar com o relatório. */
  unidades: UnidadeItemRecord[];
  /** Nome do órgão como na tela (cadastro de UASGs). */
  nomeDe: (uasg: string) => string;
}

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const celula: React.CSSProperties = { padding: '0.4rem 0.6rem' };
const numero: React.CSSProperties = { ...celula, textAlign: 'right', fontFamily: 'monospace' };

/**
 * Importa o "Relatório Ata de Registro de Preços" do Contratos.gov.br (migration 325). O Compras.gov.br deixou de
 * publicar remanejamentos que o Contratos.gov.br já mostra; o relatório traz a quantidade de cada órgão. A janela
 * mostra o que muda antes de gravar. Quem abre monta a janela só enquanto ela está aberta (o estado começa limpo).
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

  const escolher = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setErro(null);
    setRelatorio(null);
    setLendo(true);
    try {
      const r = await lerRelatorioDoPdf(arquivo);
      if (r.numeroAta !== p.numeroAta || r.uasg !== digitos(p.uasgAta)) {
        setErro(`Este relatório é da ata ${r.numeroAta} da UASG ${r.uasg}; o item aberto é da ata ${p.numeroAta} da UASG ${digitos(p.uasgAta)}.`);
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

  const doItem = relatorio?.itens.find((i) => i.numeroItem === p.numeroItem) ?? null;
  const outrosItens = relatorio?.itens.filter((i) => i.numeroItem !== p.numeroItem) ?? [];

  // Tela agora × relatório, por órgão.
  const { unidades, nomeDe } = p;
  const comparacao = React.useMemo(() => {
    if (!doItem) return [];
    const naTela = new Map<string, number>();
    for (const u of unidades) {
      if (u.dataHoraExclusao) continue;
      const uasg = digitos(u.codigoUnidade);
      naTela.set(uasg, (naTela.get(uasg) ?? 0) + (Number(u.quantidadeRegistrada) || 0));
    }
    // Sem nome na tela (o órgão só está no relatório), fica o nome do relatório.
    const nomeConhecido = (uasg: string) => { const n = nomeDe(uasg); return n && n !== `UASG ${uasg}` ? n : null; };
    type Linha = { uasg: string; nome: string; tela: number | null; relatorio: number | null; saldo: number | null };
    const linhas: Linha[] = doItem.unidades.map((u) => ({ uasg: u.uasg, nome: nomeConhecido(u.uasg) ?? u.nome, tela: naTela.get(u.uasg) ?? null, relatorio: u.quantidade, saldo: u.saldo }));
    // Órgão na tela que o relatório não traz: fica como está (o relatório não apaga órgão).
    for (const [uasg, tela] of naTela) {
      if (!doItem.unidades.some((u) => u.uasg === uasg)) linhas.push({ uasg, nome: nomeDe(uasg), tela, relatorio: null, saldo: null });
    }
    return linhas.map((l) => ({ ...l, muda: l.relatorio !== null && l.tela !== l.relatorio }));
  }, [doItem, unidades, nomeDe]);
  const mudam = comparacao.filter((l) => l.muda);
  const visiveis = verIguais ? comparacao : mudam;

  const gravar = async () => {
    if (!relatorio) return;
    setErro(null);
    try {
      const res = await importar.mutateAsync(relatorio);
      queryClient.invalidateQueries({ queryKey: ['item-relatorio-contratos'] });
      queryClient.invalidateQueries({ queryKey: ['item-copia'] });
      queryClient.invalidateQueries({ queryKey: QUANTITATIVOS_DO_ITEM_KEY(p.itemKey) });
      queryClient.invalidateQueries({ queryKey: ['ata-item-saldos'] });
      queryClient.invalidateQueries({ queryKey: ['item-allocations'] });
      queryClient.invalidateQueries({ queryKey: CARTEIRA_ALOCACOES_KEY });
      queryClient.invalidateQueries({ queryKey: CARTEIRA_VINCULOS_KEY });
      const mudancas = res.importados.reduce((s, i) => s + i.mudancas, 0);
      const maisAntigo = res.fora.filter((f) => f.motivo === 'RELATORIO_MAIS_ANTIGO').map((f) => f.numeroItem);
      const foraDaAta = res.fora.filter((f) => f.motivo === 'ITEM_FORA_DA_ATA').map((f) => f.numeroItem);
      toast.success(`Relatório importado: ${res.importados.length} ${res.importados.length === 1 ? 'item' : 'itens'}, ${mudancas} ${mudancas === 1 ? 'órgão mudou' : 'órgãos mudaram'}.`);
      if (maisAntigo.length) toast.show(`Itens ${maisAntigo.join(', ')} ficaram de fora: já há um relatório mais novo importado.`, 'warning');
      if (foraDaAta.length) toast.show(`Itens ${foraDaAta.join(', ')} ficaram de fora: não estão nesta ata no sistema.`, 'warning');
      p.onFechar();
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível gravar o relatório.');
    }
  };

  return (
    <Modal
      isOpen={p.aberto}
      onClose={p.onFechar}
      dismissible={!importar.isPending}
      size="lg"
      title="Importar relatório do Contratos.gov.br"
      subtitle={p.tituloItem}
      testId="importar-relatorio-contratos"
      footer={
        <>
          <ActionButton action="cancelar" onClick={p.onFechar} disabled={importar.isPending} />
          <AppButton variant="primary" onClick={gravar} disabled={!relatorio || importar.isPending} data-testid="importar-relatorio-gravar">
            {importar.isPending ? 'Gravando…' : 'Gravar'}
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
        <div style={{ color: 'var(--text-secondary)' }}>
          No Contratos.gov.br, abra a ata e gere o <b>Relatório Ata de Registro de Preços</b> em PDF. As quantidades de cada
          órgão passam a valer no lugar das do Compras.gov.br, até ele publicar uma atualização mais nova do órgão.
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={entrada} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
            onChange={(e) => void escolher(e.target.files?.[0])} data-testid="importar-relatorio-arquivo" />
          <AppButton variant="outline" onClick={() => entrada.current?.click()} disabled={lendo || importar.isPending} data-testid="importar-relatorio-escolher">
            {lendo ? 'Lendo o PDF…' : relatorio ? 'Escolher outro PDF' : 'Escolher o PDF'}
          </AppButton>
          {relatorio && (
            <span data-testid="importar-relatorio-resumo">
              Ata {relatorio.numeroAta} · gerado em {formatDataHoraBR(relatorio.geradoEm)} · {relatorio.itens.length} {relatorio.itens.length === 1 ? 'item' : 'itens'}
            </span>
          )}
        </div>

        {erro && <NoticeBar tone="danger" testId="importar-relatorio-erro">{erro}</NoticeBar>}
        {relatorio?.avisos.map((a) => <NoticeBar key={a} tone="warning">{a}</NoticeBar>)}

        {relatorio && !doItem && (
          <NoticeBar tone="warning" testId="importar-relatorio-sem-item">
            O relatório não traz o item {p.numeroItem}. Ao gravar, entram os itens {outrosItens.map((i) => i.numeroItem).join(', ')} desta ata.
          </NoticeBar>
        )}

        {doItem && (
          <>
            <div data-testid="importar-relatorio-item">
              {mudam.length === 0
                ? <><StatusBadge label="Sem diferença" variant="success" size="sm" dot={false} /> As quantidades do relatório são as mesmas da tela.</>
                : <><StatusBadge label={`${mudam.length} ${mudam.length === 1 ? 'órgão muda' : 'órgãos mudam'}`} variant="info" size="sm" dot={false} /> Soma no relatório {formatNumber(doItem.somaRegistrada)}{doItem.homologado !== null ? ` · homologado ${formatNumber(doItem.homologado)}` : ''}.</>}
              {' '}
              {comparacao.length > mudam.length && (
                <AppButton variant="ghost" size="xs" onClick={() => setVerIguais((v) => !v)} data-testid="importar-relatorio-ver-iguais">
                  {verIguais ? 'Só os que mudam' : `Ver todos os ${comparacao.length} órgãos`}
                </AppButton>
              )}
            </div>
            {visiveis.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'auto', maxHeight: '42vh' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="importar-relatorio-tabela">
                  <thead>
                    <tr style={{ background: 'var(--bg-card-hover)', textAlign: 'left' }}>
                      <th style={celula}>Órgão</th>
                      <th style={{ ...celula, textAlign: 'right' }}>Na tela</th>
                      <th style={{ ...celula, textAlign: 'right' }}>No relatório</th>
                      <th style={{ ...celula, textAlign: 'right' }}>Disponível</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((l) => (
                      <tr key={l.uasg} style={{ borderTop: '1px solid var(--border)', fontWeight: l.muda ? 700 : 400 }} data-testid={`importar-relatorio-linha-${l.uasg}`}>
                        <td style={celula}>
                          <div>{l.nome}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>UASG {l.uasg}</div>
                        </td>
                        <td style={numero}>{l.tela === null ? '—' : formatNumber(l.tela)}</td>
                        <td style={numero}>{l.relatorio === null ? 'não consta' : formatNumber(l.relatorio)}</td>
                        <td style={numero}>{l.saldo === null ? '—' : formatNumber(l.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {outrosItens.length > 0 && (
              <div style={{ color: 'var(--text-secondary)' }}>
                O relatório também traz {outrosItens.length === 1 ? 'o item' : 'os itens'} {outrosItens.map((i) => i.numeroItem).join(', ')}: {outrosItens.length === 1 ? 'entra' : 'entram'} junto ao gravar.
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
