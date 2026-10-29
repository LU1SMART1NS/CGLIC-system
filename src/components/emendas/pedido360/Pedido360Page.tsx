import React, { useMemo, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { FileText, Layers, ListTodo, Wallet } from 'lucide-react';
import { Instrument360Page } from '../../instrument360/Instrument360Page';
import { Instrument360Head } from '../../instrument360/Instrument360Head';
import { Instrument360Tabs } from '../../instrument360/Instrument360Tabs';
import { Instrument360TabPanel } from '../../instrument360/Instrument360TabPanel';
import { InstrumentPageState } from '../../instrument360/InstrumentPageState';
import { InstrumentSection } from '../../instrument360/InstrumentSection';
import { useInstrumentTab } from '../../instrument360/useInstrumentTab';
import { useBackTarget, useNavigateWithOrigin } from '../../../hooks/useDetailOrigin';
import { rotaDaEmenda } from '../emendas360/rotaDaEmenda';
import {
  hojeEmBrasilia,
  useAutoresEmendas,
  useBeneficiariosEmendas,
  useCredorDiferente,
  useDiferencasDeEmpenho,
  useItensCaep,
  useKitsEmendas,
  useNotasDasLinhas,
  usePedidosEmendas,
  usePodeGerirEmendas,
  usePodeVerContratos,
  useMapaGruposBeneficiarios
} from '../../../hooks/useEmendas';
import { fatiasDaCaptacao } from '../../../config/captacaoEmendas';
import { CaptacaoBotao, CaptacaoNoTopo } from '../CaptacaoDoPedido';
import { usePrecosParaEmenda } from '../../../hooks/useEmendasQuadro';
import { avisosDoPedido, linhasAtivas, reservadoPorItem, ultimoContatoPorAutor, valorDoPedidoNaEtapa, AUTOR_A_DEFINIR } from '../../../utils/emendasPedidos';
import { nomeDoPedido, rotaDoPedido } from '../../../utils/emendasNomeDoPedido';
import type { AutorEmenda, NotaDaLinha } from '../../../services/emendasService';
import type { CredorNoPedido } from '../../../utils/emendasConferenciaNota';
import { LinhasPorAta } from '../PedidoAberto';
import { proximaAcaoDaJanela } from '../proximaAcaoDaJanela';
import { pedidoDoEndereco } from './pedidoDoEndereco';
import { QuadroGabinete } from '../QuadroGabinete';
import { emendaDoPedidoNoQuadro } from '../../../utils/emendasQuadro';
import { PedidoModal } from '../PedidoModal';
import { EtapaPedidoModal, type AcaoDaJanela, type ContextoDaJanela } from '../EtapaPedidoModal';
import { AnulacaoModal } from '../AnulacaoModal';
import { AutorizacaoQuadrosModal } from '../AutorizacaoQuadrosModal';
import { Pedido360Header } from './Pedido360Header';
import { AndamentoDoPedido } from './AndamentoDoPedido';
import { ExecucaoDoPedidoAba } from './ExecucaoDoPedidoAba';
import { ConferenciaDoOficio } from './ConferenciaDoOficio';
import { PEDIDO360_ABAS, type Pedido360Aba } from './pedido360Abas';

const SEM_NOTAS = new Map<string, NotaDaLinha>();
const SEM_CREDOR: CredorNoPedido[] = [];
const IDS_DAS_ABAS = PEDIDO360_ABAS.map((a) => a.id);

/**
 * Pedido 360 (protótipo aprovado em 27/10/2026): o pedido de emenda na mesma casca das telas Ata, Contrato e Item,
 * com cartão no topo e as abas Andamento · Itens · Execução · Quadro do ofício. As ações abrem as mesmas janelas da
 * lista de antes. Lê o mesmo cache da lista de Pedidos.
 */
export const Pedido360Page: React.FC = () => {
  const params = useParams<{ autorId?: string; ano?: string; ordem?: string; id?: string }>();
  const location = useLocation();
  const back = useBackTarget({ path: '/emendas/pedidos', label: 'Voltar para Pedidos' });
  const navegar = useNavigateWithOrigin();
  const { data: pedidos = [], isLoading, isError, error, refetch } = usePedidosEmendas();
  const { data: notas = SEM_NOTAS } = useNotasDasLinhas();
  const { conferencia, diferencas, porItem: conferenciaPorItem, resolvidos } = useDiferencasDeEmpenho();
  const { porPedido: credorPendente, todosPorPedido: credorDoPedido } = useCredorDiferente();
  const { data: itensLista = [], isLoading: carregandoItens } = useItensCaep();
  const { data: autores = [] } = useAutoresEmendas();
  const { data: beneficiariosLista = [] } = useBeneficiariosEmendas();
  const { data: kits = [] } = useKitsEmendas();
  const podeGerir = usePodeGerirEmendas();
  const podeVerContratos = usePodeVerContratos();
  const { precos } = usePrecosParaEmenda();
  const hoje = hojeEmBrasilia();

  const itens = useMemo(() => new Map(itensLista.map((i) => [i.itemKey, i])), [itensLista]);
  const autorPorId = useMemo(() => new Map<string, AutorEmenda>(autores.map((a) => [a.id, a])), [autores]);
  const beneficiarios = useMemo(() => new Map(beneficiariosLista.map((b) => [b.id, b])), [beneficiariosLista]);
  const pedido = useMemo(() => pedidoDoEndereco(pedidos, params), [pedidos, params]);

  const { activeTab, goToTab, tabsRef, searchParams } = useInstrumentTab<Pedido360Aba>({ tabs: IDS_DAS_ABAS, defaultTab: 'andamento' });
  // Vindo do Item 360 › Emendas (?item=): as linhas daquele item ficam em destaque e o parâmetro acompanha as abas.
  const itemDeOrigem = searchParams.get('item');
  const irPara = (aba: Pedido360Aba) => goToTab(aba, itemDeOrigem ? { item: itemDeOrigem } : undefined);

  const [editando, setEditando] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [janela, setJanela] = useState<{ acao: AcaoDaJanela; contexto?: ContextoDaJanela } | null>(null);
  // Conferência do ofício (protótipo aprovado em 28/10/2026): abre no lugar das abas, numa área larga, e não em janela.
  const [conferindo, setConferindo] = useState<{ devolvendo: boolean } | null>(null);
  // Captação principal (migration 218): botão no cartão e gaveta entre o cartão e as abas, como na Ata 360.
  const gruposDosBeneficiarios = useMapaGruposBeneficiarios();
  const [captacaoAberta, setCaptacaoAberta] = useState(false);

  if (isLoading || carregandoItens) {
    return (
      <Instrument360Page>
        <InstrumentPageState kind="loading" title="Carregando o pedido" />
      </Instrument360Page>
    );
  }
  if (isError) {
    return (
      <Instrument360Page>
        <InstrumentPageState
          kind="error"
          title="Não foi possível carregar o pedido"
          message={(error as Error | null)?.message || 'Falha ao consultar os pedidos.'}
          onRetry={() => void refetch()}
          backLabel={back.label}
          onBack={back.back}
        />
      </Instrument360Page>
    );
  }
  if (!pedido) {
    return (
      <Instrument360Page>
        <InstrumentPageState
          kind="notFound"
          title="Pedido não encontrado"
          message="O endereço não corresponde a nenhum pedido. Ele pode ter mudado de número ao ganhar a emenda; procure pelo parlamentar na lista de Pedidos."
          backLabel={back.label}
          onBack={back.back}
        />
      </Instrument360Page>
    );
  }
  // Aberto pelo identificador interno, mas já tem número: vai para o endereço do número, levando a aba e a origem.
  if (params.id && pedido.numeroNoAno) {
    return <Navigate to={`${rotaDoPedido(pedido)}${location.search}`} replace state={location.state} />;
  }

  const p = pedido;
  const autor = p.autorId ? autorPorId.get(p.autorId) : undefined;
  const nomeDoAutor = autor?.nome ?? (p.autorId ?? AUTOR_A_DEFINIR);
  const avisos = avisosDoPedido(p, itens, hoje, notas, diferencas.get(p.id), credorPendente.get(p.id));
  const valor = valorDoPedidoNaEtapa(p, itens, precos);
  const captacao = fatiasDaCaptacao([p], gruposDosBeneficiarios, itens, precos);
  const onAcao = (acao: AcaoDaJanela, contexto?: ContextoDaJanela) =>
    acao === 'CONFERIDO' || acao === 'DIVERGENCIA' ? setConferindo({ devolvendo: acao === 'DIVERGENCIA' }) : setJanela({ acao, contexto });
  // Só com o ofício recebido: depois de registrar, o pedido muda de etapa e a tela volta às abas.
  const naConferencia = Boolean(conferindo && podeGerir && p.etapa === 'OFICIO');
  const tabs = PEDIDO360_ABAS.map((a) => (a.id === 'itens' ? { ...a, label: `Itens (${linhasAtivas(p).length})` } : a));

  return (
    <Instrument360Page>
      <Instrument360Head resumoNoCelular>
        <Pedido360Header
          p={p}
          autor={autor}
          itens={itens}
          beneficiarios={beneficiarios}
          notas={notas}
          avisos={avisos}
          valor={valor}
          podeGerir={podeGerir}
          back={back}
          onProxima={() => onAcao(proximaAcaoDaJanela(p))}
          onAlterar={() => setEditando(true)}
          onCancelar={() => onAcao('CANCELAR')}
          onAnular={() => setAnulando(true)}
          onAba={irPara}
          onAbrirParlamentar={p.autorId ? () => navegar(`/emendas/parlamentares/${encodeURIComponent(p.autorId!)}`) : undefined}
          onAbrirEmenda={p.siopEmenda ? () => navegar(rotaDaEmenda({ ano: p.siopEmendaAno ?? null, numero: p.siopEmenda! })) : undefined}
          verMais={<CaptacaoBotao fatias={captacao} aberto={captacaoAberta} onToggle={() => setCaptacaoAberta((v) => !v)} />}
        />
        <CaptacaoNoTopo fatias={captacao} beneficiarios={beneficiarios} aberto={captacaoAberta} onFechar={() => setCaptacaoAberta(false)} />
        {!naConferencia && (
          <Instrument360Tabs ref={tabsRef} tabs={tabs} active={activeTab} onSelect={irPara} idPrefix="pedido" ariaLabel={`Seções do ${nomeDoPedido(p).toLowerCase()}`} />
        )}
      </Instrument360Head>

      {naConferencia ? (
        <ConferenciaDoOficio
          pedido={p}
          pedidos={pedidos}
          itens={itens}
          itensLista={itensLista}
          beneficiarios={beneficiarios}
          beneficiariosLista={beneficiariosLista}
          autor={autor}
          nomeDoAutor={nomeDoAutor}
          precos={precos}
          reservadoFora={reservadoPorItem(pedidos, p.id)}
          hoje={hoje}
          iniciarDevolvendo={conferindo?.devolvendo}
          onSair={() => setConferindo(null)}
          onNovaMinuta={() => {
            setConferindo(null);
            irPara('quadro');
          }}
        />
      ) : (
        <Instrument360TabPanel idPrefix="pedido" activeTab={activeTab}>
          {activeTab === 'andamento' && (
            <InstrumentSection id="pedido-andamento" title="Andamento" subtitle="As etapas do pedido como tarefas: o que já foi feito, o que é com a CAEP e o que depende de outra unidade" icon={ListTodo}>
              <AndamentoDoPedido
                p={p}
                itens={itens}
                notas={notas}
                avisos={avisos}
                hoje={hoje}
                podeGerir={podeGerir}
                podeVerContratos={podeVerContratos}
                onAcao={onAcao}
                onAlterar={() => setEditando(true)}
                onAnular={() => setAnulando(true)}
              />
            </InstrumentSection>
          )}
          {activeTab === 'itens' && (
            <InstrumentSection id="pedido-itens" title="Itens por ata" subtitle="Cada item com o beneficiário, a solicitação, a nota e o contrato" icon={Layers}>
              <LinhasPorAta
                p={p}
                itens={itens}
                beneficiarios={beneficiarios}
                notas={notas}
                precos={precos}
                podeGerir={podeGerir}
                podeVerContratos={podeVerContratos}
                hoje={hoje}
                itemDeOrigem={itemDeOrigem}
                onAcao={onAcao}
                conferencia={conferenciaPorItem}
                resolvidos={resolvidos}
              />
              {(() => {
                const tiradas = p.linhas.filter((l) => l.cancelada);
                if (!tiradas.length) return null;
                return (
                  <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: '0.75rem' }} data-testid={`pedido360-tiradas-${p.id}`}>
                    {tiradas.length} {tiradas.length === 1 ? 'item tirado' : 'itens tirados'} do pedido: {[...new Set(tiradas.map((l) => l.canceladaMotivo).filter(Boolean))].join(' ')}
                  </div>
                );
              })()}
            </InstrumentSection>
          )}
          {activeTab === 'execucao' && (
            <InstrumentSection id="pedido-execucao" title="Execução" subtitle="Da nota de empenho ao pagamento, nota por nota" icon={Wallet}>
              <ExecucaoDoPedidoAba
                p={p}
                itens={itens}
                notas={notas}
                conferencia={conferencia}
                credor={credorDoPedido.get(p.id) ?? SEM_CREDOR}
                podeGerir={podeGerir}
                podeVerContratos={podeVerContratos}
              />
            </InstrumentSection>
          )}
          {activeTab === 'quadro' && (
            <InstrumentSection id="pedido-quadro" title="Quadro do ofício" subtitle="O quadro da minuta do ofício, para copiar" icon={FileText}>
              <QuadroGabinete autor={autor} linhas={linhasAtivas(p)} data={p.reservadoEm} devolvidoEm={p.devolvidoEm} emenda={emendaDoPedidoNoQuadro(p)} testId="pedido360-quadro" />
            </InstrumentSection>
          )}
        </Instrument360TabPanel>
      )}

      {editando && (
        <PedidoModal
          pedido={p}
          autores={autores}
          itens={itensLista}
          kits={kits}
          beneficiarios={beneficiariosLista}
          reservadoFora={reservadoPorItem(pedidos, p.id)}
          ultimoContato={ultimoContatoPorAutor(pedidos)}
          hoje={hoje}
          onClose={() => setEditando(false)}
        />
      )}
      {anulando && <AnulacaoModal pedido={p} itens={itens} notas={notas} nomeDoAutor={nomeDoAutor} onClose={() => setAnulando(false)} />}
      {janela?.acao === 'QUADROS_AUTORIZACAO' && janela.contexto?.ataKey && (
        <AutorizacaoQuadrosModal pedido={p} ataKey={janela.contexto.ataKey} pedidos={pedidos} itens={itens} autores={autorPorId} beneficiarios={beneficiarios} podeGerir={podeGerir} onClose={() => setJanela(null)} />
      )}
      {janela && janela.acao !== 'QUADROS_AUTORIZACAO' && (
        <EtapaPedidoModal pedido={p} acao={janela.acao} contexto={janela.contexto} itens={itens} nomeDoAutor={nomeDoAutor} onClose={() => setJanela(null)} />
      )}
    </Instrument360Page>
  );
};

