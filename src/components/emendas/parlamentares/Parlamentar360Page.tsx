import React, { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { FileText, ListTodo, Phone } from 'lucide-react';
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
import { StatusBadge } from '../../../design-system/components/StatusBadge';
import { NoticeBar } from '../../../design-system/components/NoticeBar';
import { carteiraDetalhe, carteiraNumero } from '../../carteira/carteiraStyles';
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
  usePedidosEmendas,
  usePodeGerirEmendas
} from '../../../hooks/useEmendas';
import { formatCurrency } from '../../../utils/format';
import { dataBR } from '../../../utils/emendasKits';
import { linhasAtivas, reservadoPorItem, ultimoContatoPorAutor } from '../../../utils/emendasPedidos';
import { emendasNaLista, NOME_ORGAO_ASPAR, numeroDaEmenda, orgaosNaOrdem, ROTULO_MEIO, ROTULO_SITUACAO_EMENDA, type EmendaNaLista } from '../../../utils/emendasSemPedido';
import { ROTULO_SITUACAO_SOBRA, type SobraDaEmenda } from '../../../utils/emendasSobra';
import { execucaoDosPedidos, pedidosDoParlamentar } from '../../../utils/emendasParlamentar';
import { rotuloBeneficiario, type EmendaSiop, type NotaDaLinha, type OrgaoAspar } from '../../../services/emendasService';
import { linhaDoAutor } from '../emendasPartes';
import { CartaoDeContato, DetalheDaEmenda } from '../emendas360/DetalheDaEmenda';
import { PedidoModal } from '../PedidoModal';
import { EmendaSiopModal } from '../EmendaSiopModal';
import { AsparModal } from '../AsparModal';
import { SobraDaEmendaCartao } from './SobraDaEmendaCartao';
import { TabelaDePedidos } from './TabelaDePedidos';
import { rotaDaEmenda } from '../emendas360/rotaDaEmenda';
import { useSobraDasEmendas } from './useSobraDasEmendas';
import { AnoDaEmenda } from '../AnoDaEmenda';
import { ANO_SEM, ANO_TODOS, anoDoPedido, anoEmTexto, anoEncerrado, anosDaLista, filtroEhAno, lerAnoDaUrl, pedidoNoAno } from '../../../utils/emendasAno';

type Aba = 'emendas' | 'pedidos' | 'contatos';
const SEM_NOTAS = new Map<string, NotaDaLinha>();
const TIPO_POR_EXTENSO: Record<string, string> = { DEPUTADO: 'Deputado federal', SENADOR: 'Senador', BANCADA: 'Bancada' };

/**
 * Parlamentar 360 (protótipo aprovado em 27/10/2026): o que um parlamentar ou bancada tem com a CAEP, na casca das telas
 * 360. Cartão com partido e UF, contato da assessoria, quatro indicadores (emendas do ano, empenhado, pago e sobra) e
 * as abas Emendas · Pedidos · Contatos. Responde quando o gabinete liga, sem trocar de tela.
 */
export const Parlamentar360Page: React.FC = () => {
  const { autorId = '' } = useParams<{ autorId: string }>();
  const back = useBackTarget({ path: '/emendas/parlamentares', label: 'Voltar para Parlamentares' });
  const navegar = useNavigateWithOrigin();
  const { data: pedidos = [], isLoading, isError, error, refetch } = usePedidosEmendas();
  const { data: notas = SEM_NOTAS } = useNotasDasLinhas();
  const { data: itensLista = [], isLoading: carregandoItens } = useItensCaep();
  const { data: autores = [], isLoading: carregandoAutores } = useAutoresEmendas();
  const { data: beneficiariosLista = [] } = useBeneficiariosEmendas();
  const { data: kits = [] } = useKitsEmendas();
  const { data: emendasSiop = [] } = useEmendasSiop();
  const { data: contatos = [] } = useContatosDasEmendas();
  const { data: asparLista = [] } = useAsparDosOrgaos();
  const { diferencas } = useDiferencasDeEmpenho();
  const { porPedido: credorPendente } = useCredorDiferente();
  const podeGerir = usePodeGerirEmendas();
  const hoje = hojeEmBrasilia();
  const anoCorrente = Number(hoje.slice(0, 4));
  // Ano da emenda (28/10/2026): ?ano= vem da lista de Parlamentares; sem ele, o corrente.
  const [searchParams, setSearchParams] = useSearchParams();
  const filtroAno = lerAnoDaUrl(searchParams.get('ano'), anoCorrente, true);
  const encerrado = anoEncerrado(filtroAno, anoCorrente);
  const mudarAno = (v: string) =>
    setSearchParams(
      (atual) => {
        const prox = new URLSearchParams(atual);
        if (v === String(anoCorrente)) prox.delete('ano');
        else prox.set('ano', v);
        return prox;
      },
      { replace: true }
    );

  const itens = useMemo(() => new Map(itensLista.map((i) => [i.itemKey, i])), [itensLista]);
  const beneficiarios = useMemo(() => new Map(beneficiariosLista.map((b) => [b.id, b])), [beneficiariosLista]);
  const aspar = useMemo(() => new Map(asparLista.map((a) => [`${a.uf}:${a.orgao}`, a])), [asparLista]);
  const autor = autores.find((a) => a.id === autorId);
  const todosDoParlamentar = useMemo(() => pedidosDoParlamentar(pedidos, autorId), [pedidos, autorId]);
  const doParlamentar = useMemo(() => todosDoParlamentar.filter((p) => pedidoNoAno(p, filtroAno)), [todosDoParlamentar, filtroAno]);
  // Todas as emendas do parlamentar (registradas no SIOP ou só nos pedidos), da mais nova à mais antiga.
  const todasAsEmendas = useMemo(
    () => emendasNaLista(emendasSiop, pedidos, contatos, hoje).filter((e) => e.autorId === autorId).sort((a, b) => (b.ano ?? 0) - (a.ano ?? 0) || b.numero.localeCompare(a.numero)),
    [emendasSiop, pedidos, contatos, hoje, autorId]
  );
  const emendas = useMemo(
    () => todasAsEmendas.filter((e) => filtroAno === ANO_TODOS || (filtroAno === ANO_SEM ? e.ano == null : String(e.ano) === filtroAno)),
    [todasAsEmendas, filtroAno]
  );
  // A sobra por ano: um ano, todos os anos das emendas dele, ou nenhum (sem o ano, o Portal não é lido).
  const anosDaSobra = useMemo(
    () => (filtroEhAno(filtroAno) ? [Number(filtroAno)] : filtroAno === ANO_TODOS ? [...new Set(todasAsEmendas.map((e) => e.ano).filter((a): a is number => a != null))] : []),
    [filtroAno, todasAsEmendas]
  );
  const { porAutor, minimo, precos } = useSobraDasEmendas(pedidos, itens, notas, anosDaSobra);
  const sobra = porAutor.get(autorId);
  const sobraPorCodigo = useMemo(() => new Map((sobra?.emendas ?? []).map((e) => [e.codigo, e])), [sobra]);
  const execucao = useMemo(() => execucaoDosPedidos(doParlamentar, notas), [doParlamentar, notas]);
  const seletorDeAno = useMemo(() => {
    const doAno = (k: string) => todosDoParlamentar.filter((p) => String(anoDoPedido(p)) === k).length;
    return {
      anos: anosDaLista([...todosDoParlamentar.map(anoDoPedido), ...todasAsEmendas.map((e) => e.ano)], anoCorrente).map((a) => ({ ano: a, count: doAno(String(a)) })),
      semAno: doAno(ANO_SEM),
      todos: todosDoParlamentar.length
    };
  }, [todosDoParlamentar, todasAsEmendas, anoCorrente]);
  const contatoDoAutor = useMemo(() => ultimoContatoPorAutor(pedidos).get(autorId), [pedidos, autorId]);

  const abas: Array<{ id: Aba; label: string }> = [
    { id: 'emendas', label: `Emendas (${emendas.length})` },
    { id: 'pedidos', label: `Pedidos (${doParlamentar.length})` },
    // Contatos da assessoria e ASPAR: só a CAEP e o coordenador (decisão de 25/10/2026).
    ...(podeGerir ? [{ id: 'contatos' as Aba, label: 'Contatos' }] : [])
  ];
  const { activeTab, goToTab, tabsRef } = useInstrumentTab<Aba>({ tabs: abas.map((a) => a.id), defaultTab: 'emendas' });

  const [novaReserva, setNovaReserva] = useState(false);
  const [comSobra, setComSobra] = useState<SobraDaEmenda | null>(null);
  const [daEmenda, setDaEmenda] = useState<EmendaSiop | null>(null);
  const [alterandoEmenda, setAlterandoEmenda] = useState<EmendaSiop | null>(null);
  const [editandoAspar, setEditandoAspar] = useState<OrgaoAspar | null>(null);

  if (isLoading || carregandoItens || carregandoAutores) {
    return (
      <Instrument360Page>
        <InstrumentPageState kind="loading" title="Carregando o parlamentar" />
      </Instrument360Page>
    );
  }
  if (isError) {
    return (
      <Instrument360Page>
        <InstrumentPageState kind="error" title="Não foi possível carregar o parlamentar" message={(error as Error | null)?.message || 'Falha ao consultar os pedidos.'} onRetry={() => void refetch()} backLabel={back.label} onBack={back.back} />
      </Instrument360Page>
    );
  }
  if (!autor) {
    return (
      <Instrument360Page>
        <InstrumentPageState kind="notFound" title="Parlamentar não encontrado" message="O endereço não corresponde a nenhum parlamentar ou bancada do cadastro da Câmara e do Senado." backLabel={back.label} onBack={back.back} />
      </Instrument360Page>
    );
  }

  // Quem atende e o primeiro pedido descrevem o parlamentar: valem todos os anos.
  const ativos = todosDoParlamentar.filter((p) => p.etapa !== 'CANCELADO');
  const atendidos = [
    ...new Set(
      ativos.flatMap((p) => linhasAtivas(p).map((l) => (l.beneficiarioId ? beneficiarios.get(l.beneficiarioId) : undefined))).filter((b): b is NonNullable<typeof b> => Boolean(b)).map((b) => rotuloBeneficiario(b))
    )
  ];
  const ultimaConversa = emendas.flatMap((e) => e.contatos.map((c) => c.contatoEm)).sort().at(-1) ?? null;
  const primeiroPedido = ativos.filter((p) => p.origem !== 'PLANILHA').map((p) => p.reservadoEm).sort()[0] ?? null;
  const emendasDoAno = sobra?.emendas ?? [];
  const subtitulo = [
    autor.nomeCivil && autor.nomeCivil.toLowerCase() !== autor.nome.toLowerCase() ? autor.nomeCivil : null,
    atendidos.length ? `atende ${atendidos.slice(0, 2).join(' e ')}${atendidos.length > 2 ? ` e mais ${atendidos.length - 2}` : ''}` : null
  ]
    .filter(Boolean)
    .join(' · ');

  const cabecalhoDaEmenda = (e: EmendaNaLista) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      <b style={{ fontSize: '0.95rem' }}>
        Emenda {numeroDaEmenda(e.numero)}
        {e.ano ? ` / ${e.ano}` : ''}
      </b>
      {e.valor != null && <span style={carteiraNumero}>{formatCurrency(e.valor)}</span>}
      {e.gnd && <span style={carteiraDetalhe}>{e.gnd}</span>}
      <StatusBadge label={ROTULO_SITUACAO_EMENDA[e.situacao]} variant={e.situacao === 'COM_PEDIDO' ? 'success' : 'warning'} size="sm" dot={false} />
      <span style={{ flex: 1 }} />
      <AppButton size="xs" variant="link" onClick={() => navegar(rotaDaEmenda(e))} data-testid={`parlamentar-360-abrir-emenda-${e.chave}`}>
        Abrir a emenda
      </AppButton>
    </div>
  );

  return (
    <Instrument360Page>
      <Instrument360Head resumoNoCelular>
        <Instrument360Hero
          backLabel={back.label}
          onBack={back.back}
          backTestId="parlamentar-360-back-btn"
          actions={
            <>
              <AnoDaEmenda
                valor={filtroAno}
                anoCorrente={anoCorrente}
                anos={seletorDeAno.anos}
                todos={seletorDeAno.todos}
                semAno={seletorDeAno.semAno}
                onChange={mudarAno}
                testId="parlamentar-360-ano"
              />
              {podeGerir && <ActionButton action="novo" size="sm" label="Nova reserva" onClick={() => setNovaReserva(true)} data-testid="parlamentar-360-nova-reserva" />}
            </>
          }
          title={autor.nome}
          eyebrow={[TIPO_POR_EXTENSO[autor.tipo] ?? autor.tipo, autor.partido, autor.uf, autor.legislatura ? `${autor.legislatura}ª legislatura` : null].filter(Boolean).join(' · ')}
          status={{ faixa: 'REGULAR', label: autor.emExercicio === false ? 'Fora de exercício' : 'Em exercício', neutral: true }}
          dockSubtitle={linhaDoAutor(autor)}
          subtitle={subtitulo || undefined}
          manager={
            podeGerir && contatoDoAutor && (contatoDoAutor.contatoNome || contatoDoAutor.contatoTelefone || contatoDoAutor.contatoEmail) ? (
              <div data-testid="parlamentar-360-contato">
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Contato na assessoria</div>
                <div style={{ fontWeight: 700, marginTop: '0.15rem' }}>{contatoDoAutor.contatoNome ?? 'assessoria'}</div>
                <div style={carteiraDetalhe}>do último pedido</div>
              </div>
            ) : undefined
          }
          dates={[
            ...(ultimaConversa ? [{ label: 'Último contato', value: dataBR(ultimaConversa) }] : []),
            ...(primeiroPedido ? [{ label: 'Primeiro pedido', value: dataBR(primeiroPedido) }] : []),
            ...(autor.lidoEm ? [{ label: 'Dados lidos em', value: dataBR(autor.lidoEm) }] : [])
          ]}
          identifiersTestId="parlamentar-360-identificadores"
          identifiers={[{ label: 'Código do autor', value: autor.id }]}
        >
          <div data-testid="parlamentar-360-indicadores">
            <HealthTileGrid columns={4}>
              <HealthTile
                label={filtroEhAno(filtroAno) ? `Emendas ${filtroAno}` : filtroAno === ANO_SEM ? 'Emendas sem ano' : 'Emendas'}
                value={String(filtroAno === ANO_SEM ? emendas.length : emendasDoAno.length)}
                hint={
                  filtroAno === ANO_SEM
                    ? 'informe o ano no pedido'
                    : sobra
                      ? `${formatCurrency(sobra.valor)} no SIOP`
                      : `nenhuma emenda ${anoEmTexto(filtroAno)} com pedido`
                }
                onClick={() => goToTab('emendas')}
                testId="parlamentar-360-emendas"
              />
              <HealthTile
                label="Empenhado"
                value={sobra ? formatCurrency(sobra.empenhado) : '—'}
                hint={
                  sobra && sobra.valor > 0
                    ? `${Math.round((sobra.empenhado / sobra.valor) * 1000) / 10}% das emendas ${filtroEhAno(filtroAno) ? 'do ano' : anoEmTexto(filtroAno)}`
                    : filtroAno === ANO_SEM
                      ? 'sem o ano, o Portal não é lido'
                      : 'nenhuma nota ainda'
                }
                compact
                onClick={() => goToTab('emendas')}
                testId="parlamentar-360-empenhado"
              />
              <HealthTile
                label="Pago"
                value={execucao.notas > 0 ? formatCurrency(execucao.pago) : '—'}
                hint={execucao.notas > 0 ? `nas ${execucao.notas} ${execucao.notas === 1 ? 'nota' : 'notas'} dos pedidos` : 'nenhuma nota ainda'}
                compact
                onClick={() => goToTab('pedidos')}
                testId="parlamentar-360-pago"
              />
              <HealthTile
                label={encerrado ? 'Não empenhado' : 'Sobra'}
                value={!filtroEhAno(filtroAno) ? '—' : sobra ? formatCurrency(encerrado ? sobra.naoEmpenhado : sobra.sobra) : '—'}
                hint={
                  filtroAno === ANO_TODOS
                    ? 'escolha um ano para ver a sobra'
                    : filtroAno === ANO_SEM
                      ? 'informe o ano no pedido'
                      : encerrado && (sobra?.situacao === 'conferir' || sobra?.situacao === 'acima')
                        ? ROTULO_SITUACAO_SOBRA[sobra.situacao]
                        : encerrado
                          ? `crédito perdido em 31/12/${filtroAno}`
                          : sobra?.situacao
                          ? ROTULO_SITUACAO_SOBRA[sobra.situacao]
                          : 'sem emenda do ano'
                }
                tone={sobra?.situacao === 'acima' ? 'CRITICA' : sobra && !encerrado && filtroEhAno(filtroAno) && sobra.sobra > 0 ? 'ATENCAO' : undefined}
                compact
                onClick={() => goToTab('emendas')}
                testId="parlamentar-360-sobra"
              />
            </HealthTileGrid>
          </div>
        </Instrument360Hero>
        <Instrument360Tabs ref={tabsRef} tabs={abas} active={activeTab} onSelect={(a) => goToTab(a)} idPrefix="parlamentar" ariaLabel={`Seções de ${autor.nome}`} />
      </Instrument360Head>

      <Instrument360TabPanel idPrefix="parlamentar" activeTab={activeTab}>
        {activeTab === 'emendas' && (
          <InstrumentSection id="parlamentar-emendas" title="Emendas" subtitle="Cada emenda com a sobra, os pedidos que ela paga, os contatos e as ações" icon={FileText}>
            {emendas.length === 0 ? (
              <NoticeBar tone="info" testId="parlamentar-360-sem-emendas">
                {todasAsEmendas.length === 0
                  ? 'Nenhuma emenda deste parlamentar no sistema. A emenda entra quando é registrada do SIOP ou conferida num pedido.'
                  : `Nenhuma emenda ${anoEmTexto(filtroAno)}. Escolha outro ano no botão “Ano”.`}
              </NoticeBar>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                {emendas.map((e) => {
                  const s = e.ano ? sobraPorCodigo.get(`${e.ano}${e.numero}`) : undefined;
                  return (
                    <section key={e.chave} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }} data-testid={`parlamentar-360-emenda-${e.chave}`}>
                      {cabecalhoDaEmenda(e)}
                      {s && <SobraDaEmendaCartao e={s} minimo={minimo} podeGerir={podeGerir} onNovoComSobra={setComSobra} />}
                      <DetalheDaEmenda
                        l={e}
                        autor={autor}
                        beneficiarios={beneficiarios}
                        aspar={aspar}
                        contatoDoAutor={contatoDoAutor}
                        podeGerir={podeGerir}
                        onCriarPedido={setDaEmenda}
                        onAlterar={setAlterandoEmenda}
                        onAbrirPedido={(id) => navegar(`/emendas/pedidos/id/${encodeURIComponent(id)}`)}
                      />
                    </section>
                  );
                })}
              </div>
            )}
          </InstrumentSection>
        )}

        {activeTab === 'pedidos' && (
          <InstrumentSection id="parlamentar-pedidos" title="Pedidos" subtitle={`Os pedidos ${anoEmTexto(filtroAno)}, inclusive os cancelados; a linha abre o Pedido 360`} icon={ListTodo}>
            {doParlamentar.length === 0 ? (
              <NoticeBar tone="info" testId="parlamentar-360-sem-pedidos">
                {todosDoParlamentar.length === 0
                  ? `Nenhum pedido ainda.${podeGerir ? ' Use "Nova reserva" quando combinar itens com o gabinete.' : ''}`
                  : `Nenhum pedido ${anoEmTexto(filtroAno)}. Escolha outro ano ou “Todos os anos” no botão “Ano”.`}
              </NoticeBar>
            ) : (
              <TabelaDePedidos pedidos={doParlamentar} itens={itens} notas={notas} precos={precos} hoje={hoje} diferencas={diferencas} credor={credorPendente} testId="parlamentar-360-pedidos" />
            )}
          </InstrumentSection>
        )}

        {activeTab === 'contatos' && podeGerir && (
          <InstrumentSection id="parlamentar-contatos" title="Contatos" subtitle="Assessoria do gabinete, ASPAR dos órgãos da UF e as conversas registradas nas emendas" icon={Phone}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '0.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0 }}>
                <span style={carteiraDetalhe}>Assessoria do parlamentar</span>
                <CartaoDeContato
                  titulo={autor.nome}
                  nome={contatoDoAutor?.contatoNome ?? null}
                  telefone={contatoDoAutor?.contatoTelefone ?? null}
                  email={contatoDoAutor?.contatoEmail ?? null}
                  vazio="sem contato nos pedidos"
                  testId="parlamentar-360-assessoria"
                />
                <span style={carteiraDetalhe}>Do último pedido do parlamentar.</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0 }} data-testid="parlamentar-360-aspar">
                <span style={carteiraDetalhe}>ASPAR dos órgãos{autor.uf ? ` · ${autor.uf}` : ''}</span>
                {autor.uf ? (
                  orgaosNaOrdem(null).map((o) => {
                    const a = aspar.get(`${autor.uf}:${o}`);
                    return (
                      <CartaoDeContato
                        key={o}
                        titulo={`${NOME_ORGAO_ASPAR[o]} · ${o}`}
                        nome={a?.nome ?? null}
                        telefone={a?.telefone ?? null}
                        email={a?.email ?? null}
                        acao={
                          <AppButton size="xs" variant="link" onClick={() => setEditandoAspar(o)} data-testid={`parlamentar-360-aspar-${o}`}>
                            {a ? 'Alterar' : 'Cadastrar'}
                          </AppButton>
                        }
                        testId={`parlamentar-360-aspar-cartao-${o}`}
                      />
                    );
                  })
                ) : (
                  <span style={carteiraDetalhe}>Sem UF no cadastro do parlamentar.</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0 }} data-testid="parlamentar-360-conversas">
                <span style={carteiraDetalhe}>Conversas registradas nas emendas</span>
                {(() => {
                  const conversas = emendas.flatMap((e) => e.contatos.map((c) => ({ c, e }))).sort((a, b) => b.c.contatoEm.localeCompare(a.c.contatoEm));
                  if (conversas.length === 0) return <span style={carteiraDetalhe}>Nenhuma conversa registrada. Registre pela emenda, na aba Emendas.</span>;
                  return (
                    <ol style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {conversas.map(({ c, e }) => (
                        <li key={c.id} style={{ fontSize: '0.85rem' }}>
                          <b>{dataBR(c.contatoEm)}</b> · {c.comQuem} · {ROTULO_MEIO[c.meio]} · emenda {numeroDaEmenda(e.numero)}
                          <div>{c.resumo}</div>
                        </li>
                      ))}
                    </ol>
                  );
                })()}
              </div>
            </div>
          </InstrumentSection>
        )}
      </Instrument360TabPanel>

      {(novaReserva || comSobra || daEmenda) && (
        <PedidoModal
          pedido={null}
          emenda={daEmenda}
          sobra={comSobra}
          autorInicial={novaReserva ? autor.id : null}
          autores={autores}
          itens={itensLista}
          kits={kits}
          beneficiarios={beneficiariosLista}
          reservadoFora={reservadoPorItem(pedidos)}
          ultimoContato={ultimoContatoPorAutor(pedidos)}
          hoje={hoje}
          onClose={() => {
            setNovaReserva(false);
            setComSobra(null);
            setDaEmenda(null);
          }}
        />
      )}
      {alterandoEmenda && <EmendaSiopModal emenda={alterandoEmenda} emendas={emendasSiop} pedidos={pedidos} autores={autores} beneficiarios={beneficiariosLista} onClose={() => setAlterandoEmenda(null)} />}
      {editandoAspar && autor.uf && <AsparModal uf={autor.uf} orgao={editandoAspar} atual={aspar.get(`${autor.uf}:${editandoAspar}`) ?? null} onClose={() => setEditandoAspar(null)} />}
    </Instrument360Page>
  );
};

