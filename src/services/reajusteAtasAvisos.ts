/**
 * Avisos do reajuste das atas no Início (categoria REAJUSTE_ATA, aba Reajustes), a partir de v_ata_reajuste_resumo
 * (migrations 158 e 159). Pendência do gestor da ata e do coordenador: o recorte por gestor vem das atas que o
 * painel já recebe (escopo do perfil), como nos outros avisos de ata.
 *
 * Só aparece o que pede ação ou está perto: percentual a informar, reajuste devido, preço da ata sem o reajuste
 * publicado, Termo de Conformidade a informar quando o próximo reajuste está a até 90 dias, e reajuste (ou
 * prorrogação com reajuste) na janela do radar (REAJUSTE_RULES.janelaAntesDias).
 */
import { REAJUSTE_RULES } from '../config/alertRules';
import type { ArpRecord } from '../types';
import type { DashboardAttentionItem } from '../types/managementDashboard';
import type { ResumoReajusteAta } from './reajusteAtasService';
import { formatDateBR } from './temporalEngineService';

export const JANELA_TERMO_A_INFORMAR_DIAS = 90;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function dias(iso: string, hoje: Date): number {
  return Math.round((Date.parse(`${iso}T00:00:00-03:00`) - Date.parse(`${hoje.toISOString().slice(0, 10)}T00:00:00-03:00`)) / 86_400_000);
}

/** " estimado de 4,22%" (vazio sem o número). */
const estimado = (v: number | null) => (v == null ? '' : ` estimado de ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);

/** Chave do "Resolvido": a situação e o marco entram na chave, então o aviso volta no próximo ciclo. */
export function chaveAvisoReajusteAta(numeroAta: string, uasg: string, situacao: string, marco: string | null): string {
  return `REAJUSTE::ATA-${numeroAta}-${uasg}::${situacao}-${marco ?? 'sem-marco'}`;
}

export function avisosDoReajusteDasAtas(resumos: ResumoReajusteAta[], arps: ArpRecord[], hoje: Date = new Date()): DashboardAttentionItem[] {
  const noPainel = new Map(arps.map((a) => [`${a.numeroAtaRegistroPreco}-${a.codigoUnidadeGerenciadora}`, a]));
  const avisos: DashboardAttentionItem[] = [];
  for (const r of resumos) {
    const arp = noPainel.get(`${r.numeroAta}-${r.codigoUasg}`);
    if (!arp) continue;
    const chaveAta = `${r.numeroAta}-${r.codigoUasg}`;
    const base = {
      category: 'REAJUSTE_ATA' as const,
      arpKey: chaveAta,
      numeroAta: r.numeroAta,
      objetoItem: arp.objeto || 'Ata de Registro de Preços',
      targetUrl: `/atas/detalhe/${encodeURIComponent(chaveAta)}?aba=reajuste`
    };
    const marco = r.proximoEfeito;
    const d = marco ? dias(marco, hoje) : null;
    const pelaSugestao = r.dataBaseOrigem === 'EDITAL' ? ' (data-base sugerida pelo edital)' : '';
    let aviso: Omit<DashboardAttentionItem, keyof typeof base | 'id' | 'avisoChave'> | null = null;

    if (r.situacao === 'PERCENTUAL_A_INFORMAR') {
      aviso = {
        severity: 'ATENCAO',
        title: 'Informar o percentual do reajuste',
        description: `Ata ${r.numeroAta}: reajuste publicado no PNCP sem percentual legível (${plural(r.percentualAInformar, 'item', 'itens')})`,
        badgeLabel: 'sem percentual',
        motivoDetalhe: { chave: 'percentual-a-informar', label: 'Ata: percentual a informar' }
      };
    } else if (r.situacao === 'DEVIDO') {
      aviso = {
        severity: 'URGENTE',
        title: 'Reajuste devido',
        description: `Ata ${r.numeroAta}: ${plural(r.devido, 'item com reajuste vencido', 'itens com reajuste vencido')} sem apostilamento publicado${pelaSugestao}`,
        badgeLabel: plural(r.devido, 'item', 'itens'),
        motivoDetalhe: { chave: 'devido', label: 'Ata: reajuste devido' }
      };
    } else if (r.situacao === 'PRECO_DESATUALIZADO') {
      aviso = {
        severity: 'ATENCAO',
        title: 'Preço da ata sem o reajuste',
        description: `Ata ${r.numeroAta}: reajuste publicado no PNCP, mas o preço no Compras.gov.br ainda é o homologado (${plural(r.precoDesatualizado, 'item', 'itens')})`,
        badgeLabel: 'conferir preço',
        motivoDetalhe: { chave: 'preco-sem-reajuste', label: 'Ata: preço sem o reajuste' }
      };
    } else if (r.situacao === 'TERMO_A_INFORMAR' && marco && d !== null && d <= JANELA_TERMO_A_INFORMAR_DIAS) {
      aviso = {
        severity: 'INFO',
        title: 'Informar o Termo de Conformidade',
        description: `Ata ${r.numeroAta}: pela data do edital, o próximo reajuste${estimado(r.proximoPercentual)} cai em ${formatDateBR(marco)}; a contagem vale da data do termo`,
        badgeLabel: d < 0 ? 'vencido' : `${d} dias`,
        dataAlvo: marco,
        diasRelevantes: d,
        motivoDetalhe: { chave: 'termo-a-informar', label: 'Ata: Termo de Conformidade a informar' }
      };
    } else if ((r.situacao === 'PREVISTO' || r.situacao === 'SE_PRORROGAR') && marco && d !== null && d >= 0 && d <= REAJUSTE_RULES.janelaAntesDias) {
      const naProrrogacao = r.proximoSituacao === 'SE_PRORROGAR';
      aviso = {
        severity: d <= REAJUSTE_RULES.urgenteAteDias ? 'ATENCAO' : 'INFO',
        title: naProrrogacao ? 'Reajuste na prorrogação' : 'Reajuste previsto',
        description: naProrrogacao
          ? `Ata ${r.numeroAta}: se for prorrogada em ${formatDateBR(marco)}, o termo aditivo leva o reajuste${estimado(r.proximoPercentual)}`
          : `Ata ${r.numeroAta}: reajuste${estimado(r.proximoPercentual)} em ${formatDateBR(marco)}`,
        badgeLabel: d === 0 ? 'hoje' : `${d} dias`,
        dataAlvo: marco,
        diasRelevantes: d,
        motivoDetalhe: naProrrogacao ? { chave: 'na-prorrogacao', label: 'Ata: reajuste na prorrogação' } : { chave: 'previsto', label: 'Ata: reajuste previsto' }
      };
    }
    if (!aviso) continue;
    const chaveMotivo = aviso.motivoDetalhe?.chave ?? r.situacao;
    avisos.push({
      ...base,
      ...aviso,
      id: `ATT-REAJUSTE-ATA-${chaveAta}-${chaveMotivo}`,
      avisoChave: chaveAvisoReajusteAta(r.numeroAta, r.codigoUasg, chaveMotivo, marco ?? r.dataBase)
    });
  }
  return avisos;
}
