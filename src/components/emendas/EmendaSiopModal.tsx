import React, { useMemo, useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { AppInput, AppSelect, AppTextarea, AppDateInput } from '../../design-system/components/FormFields';
import { useToast } from '../../design-system/components/Toast';
import { hojeEmBrasilia, useSalvarEmendaSiop } from '../../hooks/useEmendas';
import { casaBusca } from '../../utils/emendasBeneficiarios';
import { autorPeloCodigo, lerNumeroDaEmenda, numeroDaEmenda } from '../../utils/emendasSemPedido';
import { dataBR } from '../../utils/emendasKits';
import { lerValorBR, mascaraValorBR } from '../../utils/mascaras';
import { nomeESigla, type AutorEmenda, type BeneficiarioEmenda, type EmendaSiop, type Gnd, type PedidoEmenda } from '../../services/emendasService';
import { carteiraDetalhe } from '../carteira/carteiraStyles';

const TIPO: Record<AutorEmenda['tipo'], string> = { DEPUTADO: 'Deputado', SENADOR: 'Senador', BANCADA: 'Bancada' };
const metaDoAutor = (a: AutorEmenda) => [TIPO[a.tipo], a.partido, a.uf].filter(Boolean).join(' · ');
const emReais = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  /** Vazio: emenda nova. */
  emenda: EmendaSiop | null;
  emendas: EmendaSiop[];
  pedidos: PedidoEmenda[];
  autores: AutorEmenda[];
  beneficiarios: BeneficiarioEmenda[];
  onClose: () => void;
}

/**
 * Registrar a emenda vista no SIOP (migration 205). O parlamentar vem pelo código do autor (os 4 primeiros dígitos do
 * nº), aprendido com as emendas e os pedidos que já têm o nº; código novo, a CAEP escolhe uma vez.
 */
export const EmendaSiopModal: React.FC<Props> = ({ emenda, emendas, pedidos, autores, beneficiarios, onClose }) => {
  const salvar = useSalvarEmendaSiop();
  const toast = useToast();
  const hoje = hojeEmBrasilia();
  const anoDeHoje = Number(hoje.slice(0, 4));
  const [numero, setNumero] = useState(emenda ? `${emenda.ano} ${numeroDaEmenda(emenda.numero)}` : '');
  const [ano, setAno] = useState(emenda?.ano ?? anoDeHoje);
  const [autorEscolhido, setAutorEscolhido] = useState(emenda?.autorId ?? '');
  const [buscaAutor, setBuscaAutor] = useState('');
  const [valor, setValor] = useState(emenda?.valor != null ? emReais(emenda.valor) : '');
  // Valor e GND podem ficar para a conferência com o SIOP (migration 243): a CAEP registra pelo nº e ano.
  const [gnd, setGnd] = useState<Gnd | ''>(emenda ? emenda.gnd ?? '' : 'GND-4');
  const [vistaEm, setVistaEm] = useState(emenda?.vistaEm ?? hoje);
  const [beneficiarioId, setBeneficiarioId] = useState(emenda?.beneficiarioId ?? '');
  const [objeto, setObjeto] = useState(emenda?.objeto ?? '');
  const [observacao, setObservacao] = useState(emenda?.observacao ?? '');
  const [tentou, setTentou] = useState(false);

  const lido = lerNumeroDaEmenda(numero, ano);
  const codigos = useMemo(() => autorPeloCodigo(emendas, pedidos), [emendas, pedidos]);
  const autorPorId = useMemo(() => new Map(autores.map((a) => [a.id, a])), [autores]);
  const sugerido = lido ? codigos.get(lido.numero.slice(0, 4)) ?? null : null;
  const autorId = autorEscolhido || sugerido || '';
  const autor = autorId ? autorPorId.get(autorId) : undefined;
  const autoresEncontrados = useMemo(() => {
    const termo = buscaAutor.trim();
    if (!termo) return [];
    return autores.filter((a) => casaBusca(`${a.nome} ${a.partido ?? ''} ${a.uf ?? ''} ${TIPO[a.tipo]}`, termo)).slice(0, 8);
  }, [autores, buscaAutor]);
  // Nº que já tem pedido (conferido no SIOP): a emenda não está "sem pedido"; o banco também recusa.
  const pedidoDoNumero = lido
    ? pedidos.find((p) => p.etapa !== 'CANCELADO' && p.siopEmenda === lido.numero && (p.siopEmendaAno ?? lido.ano) === lido.ano && (!emenda || p.emendaId !== emenda.id))
    : undefined;
  const jaRegistrada = lido ? emendas.find((e) => e.numero === lido.numero && e.ano === lido.ano && e.id !== emenda?.id) : undefined;
  const valorLido = lerValorBR(valor);
  const beneficiariosOrdenados = useMemo(() => [...beneficiarios].filter((b) => b.ativo || b.id === beneficiarioId).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [beneficiarios, beneficiarioId]);

  const faltas: string[] = [];
  if (!lido) faltas.push('o nº da emenda');
  if (!autorId) faltas.push('o parlamentar');
  const valorInvalido = valor.trim() !== '' && (!valorLido || valorLido <= 0);
  if (valorInvalido) faltas.push('um valor maior que zero');
  if (!vistaEm) faltas.push('a data');

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (faltas.length || pedidoDoNumero || jaRegistrada || !lido) return;
    try {
      await salvar.mutateAsync({
        id: emenda?.id,
        versao: emenda?.versao,
        numero: lido.numero,
        ano: lido.ano,
        autorId,
        valor: valor.trim() ? valorLido : null,
        gnd: gnd || null,
        beneficiarioId: beneficiarioId || null,
        objeto: objeto.trim() || null,
        vistaEm,
        observacao: observacao.trim() || null
      });
      toast.success(emenda ? 'Emenda atualizada.' : `Emenda ${numeroDaEmenda(lido.numero)} registrada: entrou em Sem pedido.`);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!salvar.isPending}
      size="lg"
      testId="emendas-emenda-siop-modal"
      title={emenda ? `Emenda ${numeroDaEmenda(emenda.numero)} / ${emenda.ano}` : 'Registrar emenda do SIOP'}
      subtitle="Copie do SIOP o nº, o valor e o GND; o valor e o GND podem ficar para a conferência. O parlamentar vem pelo código do autor."
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={salvar.isPending} />
          <AppButton type="submit" form="emendas-emenda-siop-form" disabled={salvar.isPending || Boolean(pedidoDoNumero) || Boolean(jaRegistrada)} isLoading={salvar.isPending} data-testid="emendas-emenda-siop-salvar">
            {emenda ? 'Salvar' : 'Registrar emenda'}
          </AppButton>
        </>
      }
    >
      <form id="emendas-emenda-siop-form" onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '0.75rem', alignItems: 'start' }}>
          <AppInput
            label="Nº da emenda"
            hint="Ano + 8 dígitos, como no SIOP"
            placeholder="2026 4268 0021"
            inputMode="numeric"
            value={numero}
            onChange={(e) => {
              setNumero(e.target.value);
              const l = lerNumeroDaEmenda(e.target.value, null);
              if (l) setAno(l.ano);
            }}
            error={tentou && !lido ? 'Nº com 8 dígitos (ou 12, com o ano).' : undefined}
            data-testid="emendas-emenda-siop-numero"
          />
          {numero.replace(/\D/g, '').length !== 12 && (
            <AppSelect label="Ano" value={String(ano)} onChange={(e) => setAno(Number(e.target.value))} data-testid="emendas-emenda-siop-ano">
              {[anoDeHoje + 1, anoDeHoje, anoDeHoje - 1, anoDeHoje - 2].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </AppSelect>
          )}
          <AppInput
            label="Valor no SIOP"
            hint="Opcional: confirmado na conferência"
            placeholder="1.200.000,00"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(mascaraValorBR(e.target.value, valor))}
            error={tentou && valorInvalido ? 'Valor maior que zero, ou deixe em branco.' : undefined}
            data-testid="emendas-emenda-siop-valor"
          />
          <AppSelect label="GND" value={gnd} onChange={(e) => setGnd(e.target.value as Gnd | '')} data-testid="emendas-emenda-siop-gnd">
            <option value="">A ler no SIOP</option>
            <option value="GND-4">GND-4 · Investimento</option>
            <option value="GND-3">GND-3 · Custeio</option>
          </AppSelect>
          <AppDateInput label="Vista no SIOP em" max={hoje} value={vistaEm} onValueChange={setVistaEm} data-testid="emendas-emenda-siop-vista" />
        </div>

        {pedidoDoNumero && (
          <NoticeBar tone="warning" testId="emendas-emenda-siop-tem-pedido">
            Esta emenda já tem pedido ({pedidoDoNumero.oficioProcessoSei ? `Processo ${pedidoDoNumero.oficioProcessoSei}` : `reservado em ${dataBR(pedidoDoNumero.reservadoEm)}`}). Abra o pedido em vez de registrar a emenda.
          </NoticeBar>
        )}
        {jaRegistrada && (
          <NoticeBar tone="warning" testId="emendas-emenda-siop-repetida">
            A emenda {numeroDaEmenda(jaRegistrada.numero)} de {jaRegistrada.ano} já está registrada.
          </NoticeBar>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Parlamentar ou bancada</span>
          {autor ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', padding: '0.5rem 0.7rem', borderRadius: 8, background: 'var(--color-success-bg, #e3f3ea)' }} data-testid="emendas-emenda-siop-autor">
              <span>
                <b>{autor.nome}</b> <span style={carteiraDetalhe}>{metaDoAutor(autor)}</span>
              </span>
              {!autorEscolhido && sugerido && <span style={carteiraDetalhe}>pelo código {lido?.numero.slice(0, 4)}, já usado nas emendas dele</span>}
              <span style={{ flex: 1 }} />
              <ActionButton
                action="editar"
                type="button"
                size="sm"
                label="Trocar"
                onClick={() => {
                  setAutorEscolhido('');
                  setBuscaAutor(autor.nome.split(' ')[0]);
                }}
                data-testid="emendas-emenda-siop-trocar-autor"
              />
            </div>
          ) : (
            <>
              <AppInput
                type="search"
                aria-label="Buscar parlamentar"
                placeholder="Buscar deputado, senador ou bancada (nome, partido ou UF)"
                value={buscaAutor}
                onChange={(e) => setBuscaAutor(e.target.value)}
                error={tentou && !autorId ? 'Escolha o parlamentar.' : undefined}
                data-testid="emendas-emenda-siop-busca-autor"
              />
              {lido && !sugerido && <span style={carteiraDetalhe}>O código {lido.numero.slice(0, 4)} ainda não apareceu em nenhuma emenda ou pedido: escolha o parlamentar uma vez.</span>}
              {autoresEncontrados.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 8, overflow: 'hidden' }}>
                  {autoresEncontrados.map((a) => (
                    <AppButton
                      key={a.id}
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setAutorEscolhido(a.id);
                        setBuscaAutor('');
                      }}
                      style={{ justifyContent: 'flex-start', borderRadius: 0 }}
                      data-testid={`emendas-emenda-siop-autor-${a.id}`}
                    >
                      <b>{a.nome}</b>&nbsp;<span style={carteiraDetalhe}>{metaDoAutor(a)}</span>
                    </AppButton>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <AppSelect
          label="Beneficiário indicado no SIOP"
          hint="Se o SIOP trouxer. Ajuda a pôr a ASPAR do órgão dele em primeiro."
          value={beneficiarioId}
          onChange={(e) => setBeneficiarioId(e.target.value)}
          data-testid="emendas-emenda-siop-beneficiario"
        >
          <option value="">Não informado</option>
          {beneficiariosOrdenados.map((b) => (
            <option key={b.id} value={b.id}>
              {nomeESigla(b)}
              {b.entregaUf ? ` (${b.entregaUf})` : ''}
            </option>
          ))}
        </AppSelect>
        <AppTextarea label="Objeto no SIOP" hint="Texto livre, como está lá." rows={2} value={objeto} onChange={(e) => setObjeto(e.target.value)} data-testid="emendas-emenda-siop-objeto" />
        <AppTextarea label="Observação" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} data-testid="emendas-emenda-siop-observacao" />
        {!emenda && (
          <NoticeBar tone="info" testId="emendas-emenda-siop-aviso">
            Ao registrar, a emenda entra em <b>Sem pedido</b> e o aviso aparece no Início no mesmo dia. Sai sozinha quando o primeiro pedido com ela for criado.
          </NoticeBar>
        )}
      </form>
    </Modal>
  );
};
