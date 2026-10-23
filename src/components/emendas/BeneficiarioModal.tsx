import React, { useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppInput, AppSelect } from '../../design-system/components/FormFields';
import { useToast } from '../../design-system/components/Toast';
import { useSalvarBeneficiario } from '../../hooks/useEmendas';
import {
  cnpjValido,
  consultarCep,
  consultarCnpj,
  formatarCep,
  formatarCnpj,
  formatarTelefone,
  soDigitos,
  type BeneficiarioEmenda,
  type BeneficiarioParaSalvar,
  type DadosDaReceita
} from '../../services/emendasService';
import { beneficiarioRepetido, linkDoWhatsapp, parecidosCom, pendenciasDoBeneficiario, type FormularioBeneficiario as Formulario } from '../../utils/emendasBeneficiarios';
import { localDoBeneficiario, rotuloBeneficiario } from '../../services/emendasService';
import { ORGAOS_BENEFICIARIO } from '../../services/emendasQuadroService';

const EMAIL_PESSOAL = /@(gmail|hotmail|outlook|yahoo|bol|uol|live|icloud)\./i;

function receitaDoCadastro(b: BeneficiarioEmenda): DadosDaReceita | null {
  if (!b.cnpj) return null;
  return {
    cnpj: b.cnpj,
    razaoSocial: b.razaoSocial ?? '',
    nomeFantasia: null,
    naturezaJuridica: b.naturezaJuridica,
    enteFederativo: b.enteFederativo,
    situacaoCadastral: b.situacaoCadastral,
    sedeEndereco: b.sedeEndereco,
    sedeMunicipio: b.sedeMunicipio,
    sedeUf: b.sedeUf,
    sedeCep: b.sedeCep,
    sedeTelefone: b.sedeTelefone,
    sedeEmail: b.sedeEmail
  };
}

function formularioDe(b: BeneficiarioEmenda | null): Formulario {
  return {
    nome: b?.nome ?? '',
    nomeCurto: b?.nomeCurto ?? '',
    orgao: b?.orgao ?? '',
    entregaCep: formatarCep(b?.entregaCep),
    entregaLogradouro: b?.entregaLogradouro ?? '',
    entregaNumero: b?.entregaNumero ?? '',
    entregaComplemento: b?.entregaComplemento ?? '',
    entregaBairro: b?.entregaBairro ?? '',
    entregaMunicipio: b?.entregaMunicipio ?? '',
    entregaUf: b?.entregaUf ?? '',
    responsavelNome: b?.responsavelNome ?? '',
    responsavelCargo: b?.responsavelCargo ?? '',
    responsavelTelefone: b?.responsavelTelefone ? formatarTelefone(b.responsavelTelefone) : '',
    responsavelEmail: b?.responsavelEmail ?? ''
  };
}

const secao: React.CSSProperties = { border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 8, padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' };
const rotulo: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted, #64748b)' };
const grade = (colunas: string): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: colunas, gap: '0.75rem' });
const aviso = (tom: 'erro' | 'info'): React.CSSProperties => ({
  fontSize: '0.8rem',
  fontWeight: 600,
  padding: '0.5rem 0.7rem',
  borderRadius: 6,
  background: tom === 'erro' ? 'var(--color-danger-bg, #fdecea)' : 'var(--color-info-bg, #e6eefb)',
  color: tom === 'erro' ? 'var(--color-danger, #b11b05)' : 'var(--color-info-text, #155bcb)'
});

interface Props {
  beneficiario: BeneficiarioEmenda | null;
  /** Todos os cadastros, para apontar repetido, parecido e CNPJ já usado. */
  lista: BeneficiarioEmenda[];
  /** Abre o cadastro que já existe no lugar deste. */
  onAbrir: (b: BeneficiarioEmenda) => void;
  onClose: () => void;
}

const sugestao: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.6rem',
  flexWrap: 'wrap',
  background: 'var(--color-surface, #fff)',
  color: 'var(--color-text, #0f172a)',
  borderRadius: 6,
  padding: '0.4rem 0.6rem',
  fontWeight: 500
};

export const BeneficiarioModal: React.FC<Props> = ({ beneficiario, lista, onAbrir, onClose }) => {
  const salvar = useSalvarBeneficiario();
  const toast = useToast();
  const [cnpj, setCnpj] = useState(formatarCnpj(beneficiario?.cnpj));
  const [receita, setReceita] = useState<DadosDaReceita | null>(beneficiario ? receitaDoCadastro(beneficiario) : null);
  const [receitaLidaAgora, setReceitaLidaAgora] = useState(false);
  const [f, setF] = useState<Formulario>(() => formularioDe(beneficiario));
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [erroCnpj, setErroCnpj] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [msgCep, setMsgCep] = useState<{ tom: 'erro' | 'info'; texto: string } | null>(null);
  const [tentouSalvar, setTentouSalvar] = useState(false);

  const muda = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setF((x) => ({ ...x, [k]: v }));

  const buscarCnpj = async () => {
    setErroCnpj('');
    const d = soDigitos(cnpj);
    setBuscandoCnpj(true);
    try {
      const r = await consultarCnpj(d);
      setReceita(r);
      setReceitaLidaAgora(true);
      setCnpj(formatarCnpj(r.cnpj));
      setF((x) => ({ ...x, nome: x.nome || r.razaoSocial.slice(0, 300) }));
      if (r.situacaoCadastral && r.situacaoCadastral.toUpperCase() !== 'ATIVA') setErroCnpj(`Na Receita o CNPJ está ${r.situacaoCadastral.toLowerCase()}. Confira antes de salvar.`);
    } catch (err) {
      setErroCnpj((err as Error).message);
    } finally {
      setBuscandoCnpj(false);
    }
  };

  const buscarCep = async (cepInformado?: string) => {
    setMsgCep(null);
    setBuscandoCep(true);
    try {
      const e = await consultarCep(cepInformado ?? f.entregaCep);
      setF((x) => ({ ...x, entregaCep: formatarCep(e.cep), entregaLogradouro: e.logradouro || x.entregaLogradouro, entregaBairro: e.bairro || x.entregaBairro, entregaMunicipio: e.municipio || x.entregaMunicipio, entregaUf: e.uf || x.entregaUf }));
      setMsgCep({ tom: 'info', texto: 'Endereço preenchido pelo CEP. Confira e complete o número.' });
    } catch (err) {
      setMsgCep({ tom: 'erro', texto: (err as Error).message });
    } finally {
      setBuscandoCep(false);
    }
  };

  const pendencias = pendenciasDoBeneficiario(f);
  const repetido = beneficiarioRepetido(lista, f.nome, f.entregaMunicipio, f.entregaUf, beneficiario?.id);
  const parecidos = repetido ? [] : parecidosCom(lista, f.nome, f.entregaMunicipio, f.entregaUf, beneficiario?.id);
  // Unidades do mesmo órgão usam o mesmo CNPJ: só avisa, para a pessoa escolher a unidade certa ou criar outra.
  const digitosCnpj = soDigitos(cnpj);
  const mesmoCnpj = digitosCnpj.length === 14 ? lista.filter((b) => b.id !== beneficiario?.id && b.cnpj === digitosCnpj) : [];
  // CNPJ digitado e não buscado na Receita não grava: os dados da Receita vêm juntos.
  const cnpjSemBusca = Boolean(digitosCnpj) && receita?.cnpj !== digitosCnpj;

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentouSalvar(true);
    if (pendencias.length || repetido || cnpjSemBusca) return;
    const dados: BeneficiarioParaSalvar = {
      id: beneficiario?.id,
      versao: beneficiario?.versao,
      ativo: beneficiario?.ativo ?? true,
      nome: f.nome.trim(),
      cnpj: receita?.cnpj ?? null,
      razaoSocial: receita?.razaoSocial || null,
      naturezaJuridica: receita?.naturezaJuridica ?? null,
      enteFederativo: receita?.enteFederativo ?? null,
      situacaoCadastral: receita?.situacaoCadastral ?? null,
      sedeEndereco: receita?.sedeEndereco ?? null,
      sedeMunicipio: receita?.sedeMunicipio ?? null,
      sedeUf: receita?.sedeUf ?? null,
      sedeCep: receita?.sedeCep ?? null,
      sedeTelefone: receita?.sedeTelefone ?? null,
      sedeEmail: receita?.sedeEmail ?? null,
      receitaLidaEm: receita ? (receitaLidaAgora ? new Date().toISOString() : beneficiario?.receitaLidaEm ?? null) : null,
      nomeCurto: f.nomeCurto.trim() || null,
      entregaCep: soDigitos(f.entregaCep) || null,
      entregaLogradouro: f.entregaLogradouro.trim() || null,
      entregaNumero: f.entregaNumero.trim() || null,
      entregaComplemento: f.entregaComplemento.trim() || null,
      entregaBairro: f.entregaBairro.trim() || null,
      entregaMunicipio: f.entregaMunicipio.trim() || null,
      entregaUf: f.entregaUf.trim().toUpperCase() || null,
      responsavelNome: f.responsavelNome.trim() || null,
      responsavelCargo: f.responsavelCargo.trim() || null,
      responsavelTelefone: soDigitos(f.responsavelTelefone) || null,
      // Celular (11 números, 9 depois do DDD) é o que tem WhatsApp; a coluna guarda o mesmo que a tela mostra.
      responsavelWhatsapp: Boolean(linkDoWhatsapp(f.responsavelTelefone)),
      responsavelEmail: f.responsavelEmail.trim() || null,
      orgao: f.orgao || null
    };
    try {
      await salvar.mutateAsync(dados);
      toast.success(beneficiario ? `${rotuloBeneficiario(dados)} atualizado.` : `${rotuloBeneficiario(dados)} cadastrado.`);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const emailPessoal = EMAIL_PESSOAL.test(f.responsavelEmail);

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!salvar.isPending}
      size="lg"
      testId="emendas-beneficiario-modal"
      title={beneficiario ? `Editar ${rotuloBeneficiario(beneficiario)}` : 'Novo beneficiário'}
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={salvar.isPending} />
          <AppButton type="submit" form="emendas-beneficiario-form" disabled={salvar.isPending} isLoading={salvar.isPending} data-testid="emendas-beneficiario-salvar">
            Salvar beneficiário
          </AppButton>
        </>
      }
    >
      <form id="emendas-beneficiario-form" onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <AppInput
          label="Nome do beneficiário *"
          hint="Sem a cidade e a UF: elas ficam no endereço de entrega."
          value={f.nome}
          maxLength={300}
          onChange={(e) => muda('nome', e.target.value)}
          data-testid="emendas-beneficiario-nome"
        />
        {repetido && (
          <div style={{ ...aviso('erro'), display: 'flex', flexDirection: 'column', gap: '0.45rem' }} role="alert" data-testid="emendas-beneficiario-repetido">
            <span>Já existe um beneficiário com este nome e local.</span>
            <div style={sugestao}>
              <span>
                <b>{rotuloBeneficiario(repetido)}</b>
                {localDoBeneficiario(repetido) && ` · ${localDoBeneficiario(repetido)}`}
              </span>
              <AppButton type="button" variant="outline" size="sm" onClick={() => onAbrir(repetido)}>
                Abrir o existente
              </AppButton>
            </div>
          </div>
        )}
        {parecidos.length > 0 && (
          <div style={{ ...aviso('info'), display: 'flex', flexDirection: 'column', gap: '0.45rem' }} data-testid="emendas-beneficiario-parecidos">
            <span>Parecido com {parecidos.length === 1 ? 'um cadastro' : `${parecidos.length} cadastros`}. É algum destes?</span>
            {parecidos.map((p) => (
              <div key={p.id} style={sugestao}>
                <span>
                  <b>{rotuloBeneficiario(p)}</b>
                  {localDoBeneficiario(p) && ` · ${localDoBeneficiario(p)}`}
                </span>
                <AppButton type="button" variant="outline" size="sm" onClick={() => onAbrir(p)}>
                  Usar este
                </AppButton>
              </div>
            ))}
            <span style={{ fontWeight: 500 }}>Se não for nenhum, salve normalmente.</span>
          </div>
        )}

        <div style={grade('repeat(auto-fit, minmax(min(100%, 240px), 1fr))')}>
          <AppInput label="Nome curto" hint="Como a CAEP chama o órgão nas listas (ex.: 14º GB Adamantina)." value={f.nomeCurto} maxLength={80} onChange={(e) => muda('nomeCurto', e.target.value)} data-testid="emendas-beneficiario-nome-curto" />
          <AppSelect label="Órgão" hint="Coluna ÓRGÃO do Anexo da reserva." value={f.orgao} onChange={(e) => muda('orgao', e.target.value)} data-testid="emendas-beneficiario-orgao">
            <option value="">A informar</option>
            {ORGAOS_BENEFICIARIO.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </AppSelect>
        </div>

        <div style={secao}>
          <span style={rotulo}>CNPJ · opcional</span>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 220px' }}>
              <AppInput
                label="CNPJ do órgão"
                value={cnpj}
                inputMode="numeric"
                placeholder="00.000.000/0000-00"
                onChange={(e) => {
                  setCnpj(e.target.value);
                  if (!soDigitos(e.target.value)) setReceita(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void buscarCnpj();
                  }
                }}
                error={erroCnpj || (tentouSalvar && cnpjSemBusca ? 'Busque o CNPJ na Receita ou apague o campo.' : undefined)}
                data-testid="emendas-beneficiario-cnpj"
              />
            </div>
            <AppButton type="button" variant="outline" onClick={() => void buscarCnpj()} isLoading={buscandoCnpj} disabled={!cnpjValido(cnpj)} data-testid="emendas-beneficiario-buscar-cnpj">
              {receita ? 'Atualizar pela Receita' : 'Buscar na Receita'}
            </AppButton>
          </div>
          {mesmoCnpj.length > 0 && (
            <div style={{ ...aviso('info'), display: 'flex', flexDirection: 'column', gap: '0.45rem' }} data-testid="emendas-beneficiario-mesmo-cnpj">
              <span>
                Este CNPJ já está em {mesmoCnpj.length === 1 ? '1 cadastro' : `${mesmoCnpj.length} cadastros`}. Se for outra unidade do mesmo órgão, salve
                normalmente; se for uma delas, use a existente.
              </span>
              {mesmoCnpj.slice(0, 5).map((p) => (
                <div key={p.id} style={sugestao}>
                  <span>
                    <b>{rotuloBeneficiario(p)}</b>
                    {localDoBeneficiario(p) && ` · ${localDoBeneficiario(p)}`}
                  </span>
                  <AppButton type="button" variant="outline" size="sm" onClick={() => onAbrir(p)}>
                    Usar este
                  </AppButton>
                </div>
              ))}
            </div>
          )}
          {receita && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }} data-testid="emendas-beneficiario-receita">
              <span style={rotulo}>Da Receita · só leitura{receitaLidaAgora ? ' · lido agora' : beneficiario?.receitaLidaEm ? ` · lido em ${new Date(beneficiario.receitaLidaEm).toLocaleDateString('pt-BR')}` : ''}</span>
              <dl style={{ ...grade('auto 1fr'), margin: 0, gap: '0.3rem 0.9rem', fontSize: '0.84rem' }}>
                <dt style={{ color: 'var(--color-text-muted)' }}>Razão social</dt>
                <dd style={{ margin: 0, fontWeight: 700 }}>{receita.razaoSocial || '—'}</dd>
                <dt style={{ color: 'var(--color-text-muted)' }}>Natureza</dt>
                <dd style={{ margin: 0 }}>{receita.naturezaJuridica ?? '—'}</dd>
                <dt style={{ color: 'var(--color-text-muted)' }}>Ente</dt>
                <dd style={{ margin: 0 }}>{receita.enteFederativo ?? '—'}</dd>
                <dt style={{ color: 'var(--color-text-muted)' }}>Situação</dt>
                <dd style={{ margin: 0 }}>{receita.situacaoCadastral ?? '—'}</dd>
                <dt style={{ color: 'var(--color-text-muted)' }}>Sede</dt>
                <dd style={{ margin: 0 }}>
                  {[receita.sedeEndereco, receita.sedeMunicipio && `${receita.sedeMunicipio}/${receita.sedeUf ?? ''}`, receita.sedeCep && `CEP ${formatarCep(receita.sedeCep)}`].filter(Boolean).join(' · ') || '—'}
                </dd>
                <dt style={{ color: 'var(--color-text-muted)' }}>Contato</dt>
                <dd style={{ margin: 0 }}>{[receita.sedeTelefone, receita.sedeEmail].filter(Boolean).join(' · ') || '—'}</dd>
              </dl>
            </div>
          )}
        </div>

        <div style={secao}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={rotulo}>Endereço de entrega · opcional</span>
            {receita?.sedeCep && (
              <AppButton type="button" variant="link" size="sm" onClick={() => void buscarCep(receita.sedeCep!)}>
                Usar o CEP da sede
              </AppButton>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '0 1 170px' }}>
              <AppInput
                label="CEP"
                value={f.entregaCep}
                inputMode="numeric"
                placeholder="00000-000"
                onChange={(e) => muda('entregaCep', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void buscarCep();
                  }
                }}
                data-testid="emendas-beneficiario-cep"
              />
            </div>
            <AppButton type="button" variant="outline" onClick={() => void buscarCep()} isLoading={buscandoCep} disabled={soDigitos(f.entregaCep).length !== 8} data-testid="emendas-beneficiario-buscar-cep">
              Buscar CEP
            </AppButton>
          </div>
          {msgCep && <div style={aviso(msgCep.tom)} role="status">{msgCep.texto}</div>}
          <div style={grade('minmax(0, 3fr) minmax(0, 1fr)')}>
            <AppInput label="Logradouro" value={f.entregaLogradouro} onChange={(e) => muda('entregaLogradouro', e.target.value)} />
            <AppInput label="Número" value={f.entregaNumero} onChange={(e) => muda('entregaNumero', e.target.value)} data-testid="emendas-beneficiario-numero" />
          </div>
          <div style={grade('repeat(auto-fit, minmax(min(100%, 160px), 1fr))')}>
            <AppInput label="Complemento" placeholder="Bloco, sala, portão" value={f.entregaComplemento} onChange={(e) => muda('entregaComplemento', e.target.value)} />
            <AppInput label="Bairro" value={f.entregaBairro} onChange={(e) => muda('entregaBairro', e.target.value)} />
            <AppInput label="Município" value={f.entregaMunicipio} onChange={(e) => muda('entregaMunicipio', e.target.value)} data-testid="emendas-beneficiario-municipio" />
            <AppInput label="UF" value={f.entregaUf} maxLength={2} onChange={(e) => muda('entregaUf', e.target.value.toUpperCase())} data-testid="emendas-beneficiario-uf" />
          </div>
          <span style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>O CEP preenche logradouro, bairro e município; tudo pode ser corrigido antes de salvar.</span>
        </div>

        <div style={secao}>
          <span style={rotulo}>Contato do beneficiário · opcional</span>
          <div style={grade('repeat(auto-fit, minmax(min(100%, 220px), 1fr))')}>
            <AppInput label="Nome" value={f.responsavelNome} onChange={(e) => muda('responsavelNome', e.target.value)} data-testid="emendas-beneficiario-responsavel" />
            <AppInput label="Cargo" value={f.responsavelCargo} onChange={(e) => muda('responsavelCargo', e.target.value)} />
            <AppInput
              label="Telefone"
              hint="Celular abre o WhatsApp na lista."
              inputMode="tel"
              placeholder="(00) 00000-0000"
              value={f.responsavelTelefone}
              onChange={(e) => muda('responsavelTelefone', e.target.value)}
              onBlur={() => muda('responsavelTelefone', formatarTelefone(f.responsavelTelefone))}
            />
            <AppInput
              label="E-mail institucional"
              type="email"
              placeholder="nome@orgao.gov.br"
              value={f.responsavelEmail}
              onChange={(e) => muda('responsavelEmail', e.target.value)}
              hint={emailPessoal ? 'Parece e-mail pessoal. Use o e-mail institucional do órgão.' : undefined}
            />
          </div>
          <span style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
            Pessoa do órgão com quem a CAEP fala. O responsável pelo recebimento é a comissão, definida depois. Cada alteração fica no histórico.
          </span>
        </div>

        {tentouSalvar && pendencias.length > 0 && (
          <div style={aviso('erro')} role="alert" data-testid="emendas-beneficiario-pendencias">
            Falta: {pendencias.join(', ')}.
          </div>
        )}
      </form>
    </Modal>
  );
};
