import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ListTodo, Phone, Wallet } from 'lucide-react';
import { Instrument360Page } from '../../instrument360/Instrument360Page';
import { Instrument360Head } from '../../instrument360/Instrument360Head';
import { Instrument360Hero } from '../../instrument360/Instrument360Hero';
import { Instrument360Tabs } from '../../instrument360/Instrument360Tabs';
import { Instrument360TabPanel } from '../../instrument360/Instrument360TabPanel';
import { InstrumentPageState } from '../../instrument360/InstrumentPageState';
import { InstrumentSection } from '../../instrument360/InstrumentSection';
import { HealthTile, HealthTileGrid } from '../../instrument360/HealthStripParts';
import { useInstrumentTab } from '../../instrument360/useInstrumentTab';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { AppButton } from '../../../design-system/components/AppButton';
import { DataTable, type Column } from '../../../design-system/components/DataTable';
import { NoticeBar } from '../../../design-system/components/NoticeBar';
import { carteiraDetalhe, carteiraNumero, carteiraValor } from '../../carteira/carteiraStyles';
import { CarteiraDetailLabel } from '../../carteira/CarteiraDetailLabel';
import { useBackTarget, useNavigateWithOrigin } from '../../../hooks/useDetailOrigin';
import {
  hojeEmBrasilia,
  useAsparDosOrgaos,
  useAutoresEmendas,
  useBeneficiariosEmendas,
  useContatosDasEmendas,
  useCredorDiferente,
  useDiferencasDeEmpenho,
  useEmendasSiop,
  useItensCaep,
  useKitsEmendas,
  useNotasDasLinhas,
  useNotasSemPedido,
  usePedidosEmendas,
  usePodeGerirEmendas
} from '../../../hooks/useEmendas';
import { formatCurrency } from '../../../utils/format';
import { curto, dataBR, nomeDaLinhaDoPedido } from '../../../utils/emendasKits';
import { linhasAtivas, reservadoPorItem, ultimoContatoPorAutor } from '../../../utils/emendasPedidos';
import { emendasNaLista, NOME_ORGAO_ASPAR, numeroDaEmenda, orgaoDoBeneficiario, orgaosNaOrdem, ROTULO_MEIO, ROTULO_SITUACAO_EMENDA, semPedido } from '../../../utils/emendasSemPedido';
import { ROTULO_SITUACAO_SOBRA, type SobraDaEmenda } from '../../../utils/emendasSobra';
import { execucaoDosPedidos } from '../../../utils/emendasParlamentar';
import { nomeDoPedido } from '../../../utils/emendasNomeDoPedido';
import { nomeESigla, type LinhaPedido, type NotaDaLinha, type OrgaoAspar, type PedidoEmenda } from '../../../services/emendasService';
import { linhaDoAutor } from '../emendasPartes';
import { PedidoModal } from '../PedidoModal';
import { EmendaSiopModal } from '../EmendaSiopModal';
import { ContatoEmendaModal } from '../ContatoEmendaModal';
import { AsparModal } from '../AsparModal';
import { CartaoDeContato } from './DetalheDaEmenda';
import { emendaDoEndereco } from './rotaDaEmenda';
import { SobraDaEmendaCartao } from '../parlamentares/SobraDaEmendaCartao';
import { TabelaDePedidos } from '../parlamentares/TabelaDePedidos';
import { useSobraDasEmendas } from '../parlamentares/useSobraDasEmendas';

type Aba = 'pedidos' | 'execucao' | 'contatos';
const SEM_NOTAS = new Map<string, NotaDaLinha>();

interface NotaDaEmenda {
  chave: string;
  nota: string;
  fornecedor: string | null;
  itens: string;
  empenhado: number;
  pago: number | null;
  pedido: PedidoEmenda | null;
}

/**
 * Emenda 360 (protótipo aprovado em 27/10/2026): a emenda na casca das telas 360. Cartão com o parlamentar, o objeto e o
 * beneficiário indicado, quatro indicadores (valor no SIOP, empenhado, em andamento e sobra) e as abas Pedidos ·
 * Execução · Contatos. Serve à emenda sem pedido (contatos, criar pedido) e à que já tem pedido (execução, sobra).
 */
export const Emenda360Page: React.FC = () => {
  const { ano, numero } = useParams<{ ano: string; numero: string }>();
  const back = useBackTarget({ path: '/emendas/emendas', label: 'Voltar para Emendas' });
  const navegar = useNavigateWithOrigin();
  const { data: pedidos = [], isLoading, isError, error, refetch } = usePedidosEmendas();
  const emendasQ = useEmendasSiop();
  const { data: contatos = [] } = useContatosDasEmendas();
  const { data: notas = SEM_NOTAS } = useNotasDasLinhas();
  const { data: itensLista = [], isLoading: carregandoItens } = useItensCaep();
  const { data: autores = [] } = useAutoresEmendas();
  const { data: beneficiariosLista = [] } = useBeneficiariosEmendas();
  const { data: kits = [] } = useKitsEmendas();
  const { data: asparLista = [] } = useAsparDosOrgaos();
  const { data: notasSemPedido = [] } = useNotasSemPedido();
  const { diferencas } = useDiferencasDeEmpenho();
  const { porPedido: credorPendente } = useCredorDiferente();
  const podeGerir = usePodeGerirEmendas();
  const hoje = hojeEmBrasilia();

  const itens = useMemo(() => new Map(itensLista.map((i) => [i.itemKey, i])), [itensLista]);
  const beneficiarios = useMemo(() => new Map(beneficiariosLista.map((b) => [b.id, b])), [beneficiariosLista]);
  const aspar = useMemo(() => new Map(asparLista.map((a) => [`${a.uf}:${a.orgao}`, a])), [asparLista]);
  const lista = useMemo(() => emendasNaLista(emendasQ.data ?? [], pedidos, contatos, hoje), [emendasQ.data, pedidos, contatos, hoje]);
  const e = useMemo(() => emendaDoEndereco(lista, ano, numero), [lista, ano, numero]);
  const anoDaSobra = e?.ano ?? Number(hoje.slice(0, 4));
  // Ano encerrado (28/10/2026): o que não foi empenhado até 31/12 perdeu o crédito; sem pedido novo.
  const encerrada = e?.ano != null && e.ano < Number(hoje.slice(0, 4));
  const { emendas: sobras, minimo, precos, portalPorCodigo } = useSobraDasEmendas(pedidos, itens, notas, anoDaSobra);
  const codigo = e?.ano ? `${e.ano}${e.numero}` : null;
  const sobra = codigo ? sobras.find((s) => s.codigo === codigo) : undefined;
  const portal = codigo ? portalPorCodigo.get(codigo) : undefined;
  // Todos os pedidos da emenda, inclusive os cancelados (a lista da emenda só traz os ativos).
  const daEmenda = useMemo(
    () => (e ? pedidos.filter((p) => p.siopEmenda === e.numero && (e.ano == null ? p.siopEmendaAno == null : p.siopEmendaAno === e.ano)) : []),
    [pedidos, e]
  );
  const execucao = useMemo(() => execucaoDosPedidos(daEmenda, notas), [daEmenda, notas]);

  const abas: Array<{ id: Aba; label: string }> = [
    { id: 'pedidos', label: `Pedidos (${daEmenda.length})` },
    { id: 'execucao', label: 'Execução' },
    ...(podeGerir ? [{ id: 'contatos' as Aba, label: 'Contatos' }] : [])
  ];
  const { activeTab, goToTab, tabsRef } = useInstrumentTab<Aba>({ tabs: abas.map((a) => a.id), defaultTab: 'pedidos' });
  const [novoPedido, setNovoPedido] = useState<'emenda' | SobraDaEmenda | null>(null);
  const [alterando, setAlterando] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [editandoAspar, setEditandoAspar] = useState<OrgaoAspar | null>(null);

  if (isLoading || carregandoItens || emendasQ.isLoading) {
    return (
      <Instrument360Page>
        <InstrumentPageState kind="loading" title="Carregando a emenda" />
      </Instrument360Page>
    );
  }
  if (isError || emendasQ.isError) {
    return (
      <Instrument360Page>
        <InstrumentPageState kind="error" title="Não foi possível carregar a emenda" message={((error ?? emendasQ.error) as Error | null)?.message || 'Falha ao consultar as emendas.'} onRetry={() => void refetch()} backLabel={back.label} onBack={back.back} />
      </Instrument360Page>
    );
  }
  if (!e) {
    return (
      <Instrument360Page>
        <InstrumentPageState kind="notFound" title="Emenda não encontrada" message="O endereço não corresponde a nenhuma emenda registrada do SIOP nem conferida num pedido." backLabel={back.label} onBack={back.back} />
      </Instrument360Page>
    );
  }

  const registrada = e.emenda;
  const autor = e.autorId ? autores.find((a) => a.id === e.autorId) : undefined;
  const beneficiario = registrada?.beneficiarioId ? beneficiarios.get(registrada.beneficiarioId) : undefined;
  // As ASPAR do estado do beneficiário indicado; sem ele, do estado do parlamentar ou da bancada.
  const uf = beneficiario?.entregaUf ?? autor?.uf ?? null;
  const orgaos = orgaosNaOrdem(orgaoDoBeneficiario(beneficiario));
  const contatoDoAutor = e.autorId ? ultimoContatoPorAutor(pedidos).get(e.autorId) : undefined;
  const ultimoContato = e.contatos.at(-1) ?? null;
  const primeiroPedido = daEmenda.filter((p) => p.origem !== 'PLANILHA').map((p) => p.reservadoEm).sort()[0] ?? null;
  const situacao = e.situacao === 'COM_PEDIDO' && e.pedidos.length > 1 ? `${e.pedidos.length} pedidos` : ROTULO_SITUACAO_EMENDA[e.situacao];
  const tipo = autor?.tipo === 'BANCADA' ? 'de bancada' : 'individual';
  const alerta = e.urgente ? `${e.diasSemContato} dias sem contato` : sobra?.situacao === 'acima' ? 'Empenhado acima do valor' : undefined;

  // Notas da emenda: as ligadas às linhas dos pedidos (uma vez cada) e as que o sistema achou sem pedido.
  const notasDaEmenda: NotaDaEmenda[] = [];
  const vistas = new Set<string>();
  for (const p of daEmenda) {
    if (p.etapa === 'CANCELADO') continue;
    const porNota = new Map<string, { n: NotaDaLinha; linhas: LinhaPedido[] }>();
    for (const l of linhasAtivas(p)) {
      const n = notas.get(l.id);
      if (!n?.nota) continue;
      const k = n.empenhoId ?? n.nota;
      porNota.set(k, { n, linhas: [...(porNota.get(k)?.linhas ?? []), l] });
    }
    for (const [k, { n, linhas }] of porNota) {
      if (vistas.has(k)) continue;
      vistas.add(k);
      const item = linhas[0]?.itemKey ? itens.get(linhas[0].itemKey) : undefined;
      notasDaEmenda.push({
        chave: k,
        nota: n.nota!,
        fornecedor: item?.fornecedor ?? null,
        itens: linhas.map((l) => nomeDaLinhaDoPedido(l, itens, 30)).join(' · '),
        empenhado: n.valorEmpenhado ?? 0,
        pago: n.valorPago,
        pedido: p
      });
    }
  }
  const foraDosPedidos = notasSemPedido.filter((n) => n.emenda === e.numero && (e.ano == null || n.emendaAno == null || n.emendaAno === e.ano) && !vistas.has(n.empenhoId));
  for (const n of foraDosPedidos) {
    notasDaEmenda.push({ chave: n.empenhoId, nota: n.nota, fornecedor: n.credorNome, itens: 'sem pedido ligado', empenhado: n.valorEmpenhado, pago: null, pedido: null });
  }
  notasDaEmenda.sort((a, b) => a.nota.localeCompare(b.nota));

  const colunasNotas: Column<NotaDaEmenda>[] = [
    { key: 'nota', header: 'Nota', priority: 'primary', nowrap: true, render: (x) => <span style={{ ...carteiraValor, fontWeight: 700 }}>{x.nota}</span> },
    {
      key: 'itens',
      header: 'Fornecedor e itens',
      minWidth: '220px',
      render: (x) => (
        <>
          {x.fornecedor && <div style={carteiraValor}>{curto(x.fornecedor, 40)}</div>}
          <div style={{ ...carteiraDetalhe, color: x.pedido ? undefined : 'var(--color-warning-text)' }}>{x.itens}</div>
        </>
      )
    },
    { key: 'empenhado', header: 'Empenhado', align: 'right', nowrap: true, render: (x) => <span style={carteiraNumero}>{formatCurrency(x.empenhado)}</span> },
    { key: 'pago', header: 'Pago', align: 'right', nowrap: true, render: (x) => (x.pago == null ? <span style={carteiraDetalhe}>—</span> : <span style={carteiraNumero}>{formatCurrency(x.pago)}</span>) },
    {
      key: 'pedido',
      header: 'Pedido',
      nowrap: true,
      render: (x) =>
        x.pedido ? (
          <AppButton size="xs" variant="link" onClick={() => navegar(`/emendas/pedidos/id/${encodeURIComponent(x.pedido!.id)}`)}>
            {nomeDoPedido(x.pedido)}
          </AppButton>
        ) : (
          <span style={carteiraDetalhe}>sem pedido</span>
        )
    }
  ];
  const somaNotas = notasDaEmenda.reduce((t, x) => t + x.empenhado, 0);
  const diferencaPortal = portal?.valorEmpenhado != null ? portal.valorEmpenhado - somaNotas : null;

  return (
    <Instrument360Page>
      <Instrument360Head resumoNoCelular>
        <Instrument360Hero
          backLabel={back.label}
          onBack={back.back}
          backTestId="emenda-360-back-btn"
          actions={
            podeGerir ? (
              <>
                {registrada && <ActionButton action="editar" size="sm" label="Alterar" onClick={() => setAlterando(true)} data-testid="emenda-360-alterar" />}
                {registrada && semPedido(e) && (
                  <AppButton size="sm" variant="outline" onClick={() => setRegistrando(true)} data-testid="emenda-360-registrar-contato">
                    Registrar contato
                  </AppButton>
                )}
                {sobra?.situacao === 'sobra' ? (
                  <ActionButton action="novo" size="sm" label="Novo pedido com a sobra" onClick={() => setNovoPedido(sobra)} data-testid="emenda-360-novo-com-sobra" />
                ) : registrada && semPedido(e) && !encerrada ? (
                  <ActionButton action="novo" size="sm" label="Criar pedido com esta emenda" onClick={() => setNovoPedido('emenda')} data-testid="emenda-360-criar-pedido" />
                ) : null}
              </>
            ) : undefined
          }
          title={`Emenda ${numeroDaEmenda(e.numero)}`}
          eyebrow={[e.ano ? `Emenda ${e.ano}` : 'Ano não informado', e.gnd, tipo].filter(Boolean).join(' · ')}
          status={{ faixa: 'REGULAR', label: situacao, neutral: true }}
          statusAlert={alerta}
          dockAlert={alerta}
          dockSubtitle={autor ? `${autor.nome} · ${linhaDoAutor(autor)}` : undefined}
          subtitle={
            <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.25rem 0.5rem' }}>
              {autor ? (
                <AppButton
                  size="xs"
                  variant="link"
                  onClick={() => navegar(`/emendas/parlamentares/${encodeURIComponent(autor.id)}${e.ano && e.ano !== Number(hoje.slice(0, 4)) ? `?ano=${e.ano}` : !e.ano ? '?ano=sem' : ''}`)}
                  data-testid="emenda-360-abrir-parlamentar"
                >
                  {autor.nome}
                </AppButton>
              ) : (
                <span>{e.autorId ?? 'Parlamentar não identificado'}</span>
              )}
              {autor && <span>{linhaDoAutor(autor)}</span>}
            </span>
          }
          objeto={registrada?.objeto ? `Objeto no SIOP: ${registrada.objeto}` : registrada ? undefined : 'Nº conferido no SIOP pelo pedido: a emenda não foi registrada a partir do SIOP.'}
          manager={
            registrada?.criadoPorNome ? (
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Registrada por</div>
                <div style={{ fontWeight: 700, marginTop: '0.15rem' }}>{registrada.criadoPorNome}</div>
              </div>
            ) : undefined
          }
          dates={[
            ...(registrada ? [{ label: 'Vista no SIOP', value: dataBR(registrada.vistaEm) }] : []),
            ...(ultimoContato ? [{ label: 'Último contato', value: dataBR(ultimoContato.contatoEm) }] : []),
            ...(primeiroPedido ? [{ label: 'Primeiro pedido', value: dataBR(primeiroPedido) }] : []),
            ...(portal?.lidoEm ? [{ label: 'Lida no Portal', value: dataBR(portal.lidoEm) }] : [])
          ]}
          identifiersTestId="emenda-360-identificadores"
          identifiers={[
            { label: 'Nº SIOP', value: e.numero },
            { label: 'Ano', value: e.ano ? String(e.ano) : undefined },
            { label: 'GND', value: e.gnd ?? undefined },
            { label: 'Beneficiário', value: beneficiario ? nomeESigla(beneficiario) : undefined }
          ]}
        >
          <div data-testid="emenda-360-indicadores">
            <HealthTileGrid columns={4}>
              <HealthTile label="Valor no SIOP" value={e.valor != null ? formatCurrency(e.valor) : '—'} hint={daEmenda.length === 0 ? 'nenhum pedido' : daEmenda.length === 1 ? '1 pedido' : `${daEmenda.length} pedidos`} compact onClick={() => goToTab('pedidos')} testId="emenda-360-valor" />
              <HealthTile
                label="Empenhado"
                value={sobra ? formatCurrency(sobra.empenhado) : execucao.notas > 0 ? formatCurrency(execucao.empenhado) : '—'}
                hint={sobra ? (sobra.fonteDoEmpenhado === 'PORTAL' ? 'Portal da Transparência' : 'notas ligadas aos pedidos') : execucao.notas > 0 ? 'notas ligadas aos pedidos' : 'nenhuma nota ainda'}
                compact
                onClick={() => goToTab('execucao')}
                testId="emenda-360-empenhado"
              />
              <HealthTile
                label="Pago"
                value={execucao.notas > 0 ? formatCurrency(execucao.pago) : '—'}
                hint={execucao.notas > 0 ? `nas ${execucao.notas} ${execucao.notas === 1 ? 'nota' : 'notas'} dos pedidos` : 'nenhuma nota ainda'}
                compact
                onClick={() => goToTab('execucao')}
                testId="emenda-360-pago"
              />
              <HealthTile
                label={encerrada ? 'Não empenhado' : 'Sobra'}
                value={sobra ? formatCurrency(sobra.sobra) : '—'}
                hint={
                  encerrada
                    ? `crédito perdido em 31/12/${e.ano}`
                    : sobra
                      ? ROTULO_SITUACAO_SOBRA[sobra.situacao]
                      : semPedido(e)
                        ? 'a emenda inteira, sem pedido'
                        : 'só nas emendas com valor e ano'
                }
                tone={sobra?.situacao === 'acima' ? 'CRITICA' : sobra?.situacao === 'sobra' ? 'ATENCAO' : undefined}
                compact
                onClick={() => goToTab('pedidos')}
                testId="emenda-360-sobra"
              />
            </HealthTileGrid>
          </div>
        </Instrument360Hero>
        <Instrument360Tabs ref={tabsRef} tabs={abas} active={activeTab} onSelect={(a) => goToTab(a)} idPrefix="emenda" ariaLabel={`Seções da emenda ${numeroDaEmenda(e.numero)}`} />
      </Instrument360Head>

      <Instrument360TabPanel idPrefix="emenda" activeTab={activeTab}>
        {activeTab === 'pedidos' && (
          <InstrumentSection id="emenda-pedidos" title="Pedidos pagos por esta emenda" subtitle="Inclusive os cancelados; a linha abre o Pedido 360" icon={ListTodo}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              {sobra && <SobraDaEmendaCartao e={sobra} minimo={minimo} podeGerir={podeGerir} onNovoComSobra={setNovoPedido} />}
              {daEmenda.length === 0 ? (
                <NoticeBar tone={e.urgente ? 'danger' : 'warning'} testId="emenda-360-sem-pedido">
                  Esta emenda ainda não tem pedido.{podeGerir ? ' Fale com a assessoria ou com a ASPAR (aba Contatos) e use "Criar pedido com esta emenda".' : ''}
                </NoticeBar>
              ) : (
                <TabelaDePedidos pedidos={daEmenda} itens={itens} notas={notas} precos={precos} hoje={hoje} diferencas={diferencas} credor={credorPendente} testId="emenda-360-pedidos" />
              )}
            </div>
          </InstrumentSection>
        )}

        {activeTab === 'execucao' && (
          <InstrumentSection id="emenda-execucao" title="Execução da emenda" subtitle="O Portal da Transparência, que vê a emenda inteira, ao lado das notas que o sistema ligou aos pedidos" icon={Wallet}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '0.75rem' }}>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.6rem 0.8rem' }} data-testid="emenda-360-portal">
                  <CarteiraDetailLabel>Portal da Transparência · emenda inteira</CarteiraDetailLabel>
                  {portal?.encontrada ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '0.2rem 1rem', marginTop: '0.35rem', fontSize: '0.88rem' }}>
                      <span>Empenhado</span>
                      <b style={{ ...carteiraNumero, textAlign: 'right' }}>{portal.valorEmpenhado != null ? formatCurrency(portal.valorEmpenhado) : '—'}</b>
                      <span>Liquidado</span>
                      <b style={{ ...carteiraNumero, textAlign: 'right' }}>{portal.valorLiquidado != null ? formatCurrency(portal.valorLiquidado) : '—'}</b>
                      <span>Pago</span>
                      <b style={{ ...carteiraNumero, textAlign: 'right' }}>{portal.valorPago != null ? formatCurrency(portal.valorPago) : '—'}</b>
                    </div>
                  ) : (
                    <div style={{ ...carteiraDetalhe, marginTop: '0.35rem' }}>{portal ? 'O Portal não achou esta emenda.' : 'Ainda não lida no Portal (o sistema lê as emendas do ano e do anterior uma vez por dia).'}</div>
                  )}
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.6rem 0.8rem' }} data-testid="emenda-360-notas-ligadas">
                  <CarteiraDetailLabel>Notas ligadas aos pedidos</CarteiraDetailLabel>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '0.2rem 1rem', marginTop: '0.35rem', fontSize: '0.88rem' }}>
                    <span>Empenhado</span>
                    <b style={{ ...carteiraNumero, textAlign: 'right' }}>{formatCurrency(execucao.empenhado)}</b>
                    <span>Liquidado</span>
                    <b style={{ ...carteiraNumero, textAlign: 'right' }}>{formatCurrency(execucao.liquidado)}</b>
                    <span>Pago</span>
                    <b style={{ ...carteiraNumero, textAlign: 'right' }}>{formatCurrency(execucao.pago)}</b>
                  </div>
                  <div style={{ ...carteiraDetalhe, marginTop: '0.25rem' }}>{execucao.notas === 1 ? '1 nota' : `${execucao.notas} notas`} nas linhas dos pedidos.</div>
                </div>
              </div>
              {diferencaPortal != null && Math.abs(diferencaPortal) > 0.01 && (
                <NoticeBar tone="warning" testId="emenda-360-diferenca">
                  O Portal mostra <b>{formatCurrency(Math.abs(diferencaPortal))}</b> {diferencaPortal > 0 ? 'a mais' : 'a menos'} de empenhado que as notas desta tela.{' '}
                  {diferencaPortal > 0 ? 'Há nota da emenda que o sistema ainda não ligou a um pedido, ou nota de outro órgão.' : 'Confira se alguma nota foi ligada à emenda errada.'}
                </NoticeBar>
              )}
              {notasDaEmenda.length === 0 ? (
                <span style={carteiraDetalhe}>Nenhuma nota da emenda no sistema ainda.</span>
              ) : (
                <DataTable<NotaDaEmenda> testId="emenda-360-notas" className="data-table-container--flush" data={notasDaEmenda} keyExtractor={(x) => x.chave} columns={colunasNotas} />
              )}
            </div>
          </InstrumentSection>
        )}

        {activeTab === 'contatos' && podeGerir && (
          <InstrumentSection id="emenda-contatos" title="Contatos" subtitle="Assessoria do parlamentar, ASPAR dos órgãos do estado e as conversas registradas nesta emenda" icon={Phone}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '0.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0 }}>
                <span style={carteiraDetalhe}>Assessoria do parlamentar</span>
                <CartaoDeContato
                  titulo={autor?.nome ?? 'Parlamentar'}
                  nome={contatoDoAutor?.contatoNome ?? null}
                  telefone={contatoDoAutor?.contatoTelefone ?? null}
                  email={contatoDoAutor?.contatoEmail ?? null}
                  vazio="sem contato nos pedidos anteriores"
                  testId="emenda-360-assessoria"
                />
                <span style={carteiraDetalhe}>Do último pedido do parlamentar.</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0 }} data-testid="emenda-360-aspar">
                <span style={carteiraDetalhe}>ASPAR dos órgãos{uf ? ` · ${uf}` : ''}</span>
                {uf ? (
                  orgaos.map((o) => {
                    const a = aspar.get(`${uf}:${o}`);
                    return (
                      <CartaoDeContato
                        key={o}
                        titulo={`${NOME_ORGAO_ASPAR[o]} · ${o}`}
                        nome={a?.nome ?? null}
                        telefone={a?.telefone ?? null}
                        email={a?.email ?? null}
                        acao={
                          <AppButton size="xs" variant="link" onClick={() => setEditandoAspar(o)} data-testid={`emenda-360-aspar-${o}`}>
                            {a ? 'Alterar' : 'Cadastrar'}
                          </AppButton>
                        }
                        testId={`emenda-360-aspar-cartao-${o}`}
                      />
                    );
                  })
                ) : (
                  <span style={carteiraDetalhe}>Sem UF do parlamentar: informe o beneficiário na emenda para ver as ASPAR do estado.</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0 }} data-testid="emenda-360-conversas">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={carteiraDetalhe}>Conversas registradas</span>
                  <span style={{ flex: 1 }} />
                  {registrada && (
                    <AppButton size="xs" variant="link" onClick={() => setRegistrando(true)}>
                      Registrar contato
                    </AppButton>
                  )}
                </div>
                {e.contatos.length === 0 ? (
                  <span style={carteiraDetalhe}>Nenhuma conversa registrada.</span>
                ) : (
                  <ol style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {[...e.contatos].reverse().map((c) => (
                      <li key={c.id} style={{ fontSize: '0.85rem' }}>
                        <b>{dataBR(c.contatoEm)}</b> · {c.comQuem} · {ROTULO_MEIO[c.meio]}
                        <div>{c.resumo}</div>
                        {c.criadoPorNome && <div style={carteiraDetalhe}>registrado por {c.criadoPorNome}</div>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </InstrumentSection>
        )}
      </Instrument360TabPanel>

      {novoPedido && (
        <PedidoModal
          pedido={null}
          emenda={novoPedido === 'emenda' ? registrada : null}
          sobra={novoPedido !== 'emenda' ? novoPedido : null}
          autores={autores}
          itens={itensLista}
          kits={kits}
          beneficiarios={beneficiariosLista}
          reservadoFora={reservadoPorItem(pedidos)}
          ultimoContato={ultimoContatoPorAutor(pedidos)}
          hoje={hoje}
          onClose={() => setNovoPedido(null)}
        />
      )}
      {alterando && registrada && <EmendaSiopModal emenda={registrada} emendas={emendasQ.data ?? []} pedidos={pedidos} autores={autores} beneficiarios={beneficiariosLista} onClose={() => setAlterando(false)} />}
      {registrando && registrada && <ContatoEmendaModal emenda={registrada} nomeDoAutor={autor?.nome ?? ''} uf={uf} orgaos={orgaos} onClose={() => setRegistrando(false)} />}
      {editandoAspar && uf && <AsparModal uf={uf} orgao={editandoAspar} atual={aspar.get(`${uf}:${editandoAspar}`) ?? null} onClose={() => setEditandoAspar(null)} />}
    </Instrument360Page>
  );
};
