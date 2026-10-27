import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Modal } from '../../design-system/components/Modal';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppButton } from '../../design-system/components/AppButton';
import { AppInput, AppSelect, AppTextarea } from '../../design-system/components/FormFields';
import type { AcaoGestor, PrazoAncora, RegraTarefaGestao } from '../../types';
import type { TipoInstrumento } from '../../adapters/modeloGestaoRpcAdapter';
import { useSalvarRegraTarefaModelo } from '../../hooks/useModeloGestao';
import { ACAO_INFO, ACOES_GESTOR, descreverRegraPrazo, rotuloLista } from '../../utils/modeloGestao';

/**
 * Regra de uma tarefa do modelo (coordenador): ação do gestor, com quem, o que pedir/conferir,
 * regra de prazo e de resposta, esforço. Grava pela RPC da migration 215. Os planos que já
 * aplicaram o modelo não mudam.
 */

const ANCORAS: { value: PrazoAncora; label: string }[] = [
  { value: 'ANTERIOR', label: 'Depois da tarefa anterior' },
  { value: 'APLICACAO', label: 'Depois da data de partida do módulo' },
  { value: 'INICIO', label: 'Depois da assinatura do instrumento' },
  { value: 'VIGENCIA_FIM', label: 'Antes do fim da vigência' },
  { value: 'FIXO', label: 'Sem regra (o gestor informa a data)' }
];

const linhas = (texto: string) =>
  texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

const inteiro = (texto: string): number | null => {
  const n = parseInt(texto, 10);
  return Number.isFinite(n) ? n : null;
};

export const RegraTarefaModal: React.FC<{
  tipo: TipoInstrumento;
  tarefa: RegraTarefaGestao & { id: string; nome: string };
  onClose: () => void;
}> = ({ tipo, tarefa, onClose }) => {
  const salvar = useSalvarRegraTarefaModelo(tipo);
  const [acao, setAcao] = useState<AcaoGestor | ''>(tarefa.acao ?? '');
  const [comQuem, setComQuem] = useState(tarefa.comQuem ?? '');
  const [lista, setLista] = useState((tarefa.lista ?? []).join('\n'));
  const [ancora, setAncora] = useState<PrazoAncora | ''>(tarefa.prazoAncora ?? '');
  // Na vigência o coordenador digita quantos dias ANTES do fim; grava negativo (D−120 = −120).
  const [dias, setDias] = useState(tarefa.prazoDias === undefined ? '' : String(tarefa.prazoAncora === 'VIGENCIA_FIM' ? Math.abs(tarefa.prazoDias) : tarefa.prazoDias));
  const [uteis, setUteis] = useState(tarefa.prazoUteis ?? tarefa.prazoAncora !== 'VIGENCIA_FIM');
  const [prazoTexto, setPrazoTexto] = useState(tarefa.prazoTexto ?? '');
  const [respostaDias, setRespostaDias] = useState(tarefa.respostaDias === undefined ? '' : String(tarefa.respostaDias));
  const [respostaUteis, setRespostaUteis] = useState(tarefa.respostaUteis ?? true);
  const [respostaTexto, setRespostaTexto] = useState(tarefa.respostaTexto ?? '');
  const [nota, setNota] = useState(tarefa.nota ?? '');
  const [modeloSei, setModeloSei] = useState(tarefa.modeloSei ?? '');
  const [esforco, setEsforco] = useState(tarefa.esforcoMin ? String(tarefa.esforcoMin) : '');
  const [doPregao, setDoPregao] = useState(!!tarefa.doPregao);

  const contaDias = ancora !== '' && ancora !== 'FIXO';
  const diasNum = inteiro(dias);
  const diasGravados = contaDias && diasNum !== null ? (ancora === 'VIGENCIA_FIM' ? -Math.abs(diasNum) : diasNum) : null;
  const faltaDias = contaDias && (diasNum === null || diasNum < 0);
  const previa = ancora ? descreverRegraPrazo({ prazoAncora: ancora, prazoDias: diasGravados ?? undefined, prazoUteis: uteis }) : 'Sem regra de prazo';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (faltaDias) return;
    salvar.mutate(
      {
        id: tarefa.id,
        acao: acao || null,
        comQuem: comQuem.trim() || null,
        lista: acao === 'ORIENTAR' || acao === 'CONFERIR' || acao === 'LANCAR' ? linhas(lista) : null,
        nota: nota.trim() || null,
        modeloSei: modeloSei.trim() || null,
        prazoTexto: prazoTexto.trim() || null,
        prazoAncora: ancora || null,
        prazoDias: diasGravados,
        prazoUteis: contaDias ? uteis : null,
        respostaTexto: acao === 'ORIENTAR' ? respostaTexto.trim() || null : null,
        respostaDias: acao === 'ORIENTAR' ? inteiro(respostaDias) : null,
        respostaUteis: acao === 'ORIENTAR' ? respostaUteis : null,
        esforcoMin: inteiro(esforco),
        doPregao
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!salvar.isPending}
      size="lg"
      testId="regra-tarefa-modal"
      title="Regra da tarefa"
      subtitle={tarefa.nome}
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={salvar.isPending} />
          <AppButton type="submit" form="regra-tarefa-form" disabled={salvar.isPending || faltaDias} isLoading={salvar.isPending}>
            Salvar regra
          </AppButton>
        </>
      }
    >
      <form id="regra-tarefa-form" onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
        <AppSelect
          label="Ação do gestor"
          value={acao}
          onChange={(e) => setAcao(e.target.value as AcaoGestor | '')}
          hint={acao ? ACAO_INFO[acao].descricao : 'Sem ação definida'}
        >
          <option value="">Sem ação definida</option>
          {ACOES_GESTOR.map((a) => (
            <option key={a} value={a}>
              {ACAO_INFO[a].rotulo}
            </option>
          ))}
        </AppSelect>
        <AppInput
          label="Com quem"
          value={comQuem}
          onChange={(e) => setComQuem(e.target.value)}
          placeholder={acao === 'LANCAR' ? 'Ex.: Contratos.gov.br' : 'Ex.: Requisitante, CGOFI, fornecedor'}
          maxLength={200}
        />

        {(acao === 'ORIENTAR' || acao === 'CONFERIR' || acao === 'LANCAR') && (
          <div style={{ gridColumn: '1 / -1' }}>
            <AppTextarea
              label={`${rotuloLista(acao)} (um item por linha)`}
              rows={4}
              value={lista}
              onChange={(e) => setLista(e.target.value)}
            />
          </div>
        )}

        <AppSelect label="Prazo conta" value={ancora} onChange={(e) => setAncora(e.target.value as PrazoAncora | '')}>
          <option value="">Sem regra de prazo</option>
          {ANCORAS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </AppSelect>
        {contaDias ? (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <AppInput
              label={ancora === 'VIGENCIA_FIM' ? 'Dias antes do fim' : 'Dias'}
              type="number"
              min={0}
              max={1000}
              value={dias}
              onChange={(e) => setDias(e.target.value)}
              error={faltaDias ? 'Informe os dias' : undefined}
              style={{ width: '7rem' }}
            />
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', paddingBottom: '0.55rem' }}>
              <input type="checkbox" checked={uteis} onChange={(e) => setUteis(e.target.checked)} />
              dias úteis
            </label>
          </div>
        ) : (
          <div />
        )}
        <div style={{ gridColumn: '1 / -1', display: 'grid', gap: '0.25rem' }}>
          <AppInput
            label="Texto da regra (opcional)"
            value={prazoTexto}
            onChange={(e) => setPrazoTexto(e.target.value)}
            placeholder={previa}
            maxLength={120}
            hint={`Sem texto, o gestor vê: ${previa}`}
          />
        </div>

        {acao === 'ORIENTAR' && (
          <>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <AppInput
                label="Resposta em (dias)"
                type="number"
                min={0}
                max={1000}
                value={respostaDias}
                onChange={(e) => setRespostaDias(e.target.value)}
                style={{ width: '7rem' }}
              />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', paddingBottom: '0.55rem' }}>
                <input type="checkbox" checked={respostaUteis} onChange={(e) => setRespostaUteis(e.target.checked)} />
                dias úteis
              </label>
            </div>
            <AppInput
              label="Texto da resposta (opcional)"
              value={respostaTexto}
              onChange={(e) => setRespostaTexto(e.target.value)}
              placeholder="Ex.: resposta até D−45"
              maxLength={120}
            />
          </>
        )}

        <AppInput label="Modelo no SEI (opcional)" value={modeloSei} onChange={(e) => setModeloSei(e.target.value)} placeholder="Ex.: Despacho 106 (34328539)" maxLength={300} />
        <AppInput
          label="Esforço estimado (minutos)"
          type="number"
          min={0}
          max={2400}
          value={esforco}
          onChange={(e) => setEsforco(e.target.value)}
          hint="Expectativa, não medida real"
        />
        <div style={{ gridColumn: '1 / -1' }}>
          <AppTextarea label="Nota para o gestor (opcional)" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
        {tipo === 'ata' && (
          <label style={{ gridColumn: '1 / -1', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={doPregao} onChange={(e) => setDoPregao(e.target.checked)} />
            Vale para todas as atas do mesmo pregão
          </label>
        )}

        {salvar.isError && (
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 0.85rem', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', borderRadius: '6px', fontSize: '0.82rem' }}>
            <AlertCircle size={16} /> {(salvar.error as { message?: string } | null)?.message || 'Falha ao salvar a regra.'}
          </div>
        )}
        <div style={{ gridColumn: '1 / -1', fontSize: '0.75rem', color: '#64748b' }}>
          Vale para as próximas aplicações do modelo. Os planos que já aplicaram este modelo não mudam.
        </div>
      </form>
    </Modal>
  );
};
