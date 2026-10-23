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
import { linkDoWhatsapp, pendenciasDoBeneficiario, type FormularioBeneficiario as Formulario } from '../../utils/emendasBeneficiarios';
import { ORGAOS_BENEFICIARIO } from '../../services/emendasQuadroService';

const EMAIL_PESSOAL = /@(gmail|hotmail|outlook|yahoo|bol|uol|live|icloud)\./i;

function receitaDoCadastro(b: BeneficiarioEmenda): DadosDaReceita {
  return {
    cnpj: b.cnpj,
    razaoSocial: b.razaoSocial,
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
    nomeCurto: b?.nomeCurto ?? '',
    orgao: b?.orgao ?? '',
    entregaCep: b ? formatarCep(b.entregaCep) : '',
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
  cnpjsExistentes: string[];
  onClose: () => void;
}

export const BeneficiarioModal: React.FC<Props> = ({ beneficiario, cnpjsExistentes, onClose }) => {
  const salvar = useSalvarBeneficiario();
  const toast = useToast();
  const [cnpj, setCnpj] = useState(beneficiario ? formatarCnpj(beneficiario.cnpj) : '');
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
    if (!beneficiario && cnpjsExistentes.includes(d)) {
      setErroCnpj('Este CNPJ já está cadastrado. Edite o beneficiário na lista.');
      return;
    }
    setBuscandoCnpj(true);
    try {
      const r = await consultarCnpj(d);
      setReceita(r);
      setReceitaLidaAgora(true);
      setCnpj(formatarCnpj(r.cnpj));
      setF((x) => ({ ...x, nomeCurto: x.nomeCurto || (r.nomeFantasia ?? r.razaoSocial).slice(0, 80) }));
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

  const pendencias = pendenciasDoBeneficiario(receita, f);

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentouSalvar(true);
    if (pendencias.length || !receita) return;
    const dados: BeneficiarioParaSalvar = {
      id: beneficiario?.id,
      versao: beneficiario?.versao,
      ativo: beneficiario?.ativo ?? true,
      cnpj: receita.cnpj,
      razaoSocial: receita.razaoSocial,
      naturezaJuridica: receita.naturezaJuridica,
      enteFederativo: receita.enteFederativo,
      situacaoCadastral: receita.situacaoCadastral,
      sedeEndereco: receita.sedeEndereco,
      sedeMunicipio: receita.sedeMunicipio,
      sedeUf: receita.sedeUf,
      sedeCep: receita.sedeCep,
      sedeTelefone: receita.sedeTelefone,
      sedeEmail: receita.sedeEmail,
      receitaLidaEm: receitaLidaAgora ? new Date().toISOString() : beneficiario?.receitaLidaEm ?? null,
      nomeCurto: f.nomeCurto.trim(),
      entregaCep: soDigitos(f.entregaCep),
      entregaLogradouro: f.entregaLogradouro.trim(),
      entregaNumero: f.entregaNumero.trim(),
      entregaComplemento: f.entregaComplemento.trim() || null,
      entregaBairro: f.entregaBairro.trim() || null,
      entregaMunicipio: f.entregaMunicipio.trim(),
      entregaUf: f.entregaUf.trim().toUpperCase(),
      responsavelNome: f.responsavelNome.trim(),
      responsavelCargo: f.responsavelCargo.trim() || null,
      responsavelTelefone: soDigitos(f.responsavelTelefone) || null,
      // Celular (11 números, 9 depois do DDD) é o que tem WhatsApp; a coluna guarda o mesmo que a tela mostra.
      responsavelWhatsapp: Boolean(linkDoWhatsapp(f.responsavelTelefone)),
      responsavelEmail: f.responsavelEmail.trim() || null,
      orgao: f.orgao || null
    };
    try {
      await salvar.mutateAsync(dados);
      toast.success(beneficiario ? `${dados.nomeCurto} atualizado.` : `${dados.nomeCurto} cadastrado.`);
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
      title={beneficiario ? `Editar ${beneficiario.nomeCurto}` : 'Novo beneficiário'}
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
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px' }}>
            <AppInput
              label="CNPJ do órgão *"
              value={cnpj}
              inputMode="numeric"
              placeholder="00.000.000/0000-00"
              onChange={(e) => setCnpj(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void buscarCnpj();
                }
              }}
              disabled={Boolean(beneficiario)}
              error={erroCnpj || undefined}
              data-testid="emendas-beneficiario-cnpj"
            />
          </div>
          <AppButton type="button" variant="outline" onClick={() => void buscarCnpj()} isLoading={buscandoCnpj} disabled={!cnpjValido(cnpj)} data-testid="emendas-beneficiario-buscar-cnpj">
            {beneficiario ? 'Atualizar pela Receita' : 'Buscar na Receita'}
          </AppButton>
        </div>

        {receita && (
          <div style={{ ...secao, background: 'var(--color-surface-2, #f8fafc)' }} data-testid="emendas-beneficiario-receita">
            <span style={rotulo}>Da Receita · só leitura{receitaLidaAgora ? ' · lido agora' : beneficiario?.receitaLidaEm ? ` · lido em ${new Date(beneficiario.receitaLidaEm).toLocaleDateString('pt-BR')}` : ''}</span>
            <dl style={{ ...grade('auto 1fr'), margin: 0, gap: '0.3rem 0.9rem', fontSize: '0.84rem' }}>
              <dt style={{ color: 'var(--color-text-muted)' }}>Razão social</dt>
              <dd style={{ margin: 0, fontWeight: 700 }}>{receita.razaoSocial}</dd>
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

        {receita && (
          <>
            <div style={grade('repeat(auto-fit, minmax(min(100%, 240px), 1fr))')}>
              <AppInput label="Nome curto *" hint="Como a CAEP chama o órgão nas listas (ex.: PMERJ)." value={f.nomeCurto} maxLength={80} onChange={(e) => muda('nomeCurto', e.target.value)} data-testid="emendas-beneficiario-nome-curto" />
              <AppSelect label="Órgão *" hint="Coluna ÓRGÃO do Anexo da reserva." value={f.orgao} onChange={(e) => muda('orgao', e.target.value)} data-testid="emendas-beneficiario-orgao">
                <option value="">Escolha</option>
                {ORGAOS_BENEFICIARIO.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </AppSelect>
            </div>

            <div style={secao}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={rotulo}>Endereço de entrega</span>
                {receita.sedeCep && (
                  <AppButton type="button" variant="link" size="sm" onClick={() => void buscarCep(receita.sedeCep!)}>
                    Usar o CEP da sede
                  </AppButton>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '0 1 170px' }}>
                  <AppInput
                    label="CEP *"
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
                <AppInput label="Logradouro *" value={f.entregaLogradouro} onChange={(e) => muda('entregaLogradouro', e.target.value)} />
                <AppInput label="Número *" value={f.entregaNumero} onChange={(e) => muda('entregaNumero', e.target.value)} data-testid="emendas-beneficiario-numero" />
              </div>
              <div style={grade('repeat(auto-fit, minmax(min(100%, 160px), 1fr))')}>
                <AppInput label="Complemento" placeholder="Bloco, sala, portão" value={f.entregaComplemento} onChange={(e) => muda('entregaComplemento', e.target.value)} />
                <AppInput label="Bairro" value={f.entregaBairro} onChange={(e) => muda('entregaBairro', e.target.value)} />
                <AppInput label="Município *" value={f.entregaMunicipio} onChange={(e) => muda('entregaMunicipio', e.target.value)} />
                <AppInput label="UF *" value={f.entregaUf} maxLength={2} onChange={(e) => muda('entregaUf', e.target.value.toUpperCase())} />
              </div>
              <span style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>O CEP preenche logradouro, bairro e município; tudo pode ser corrigido antes de salvar.</span>
            </div>

            <div style={secao}>
              <span style={rotulo}>Responsável pelo recebimento</span>
              <div style={grade('repeat(auto-fit, minmax(min(100%, 220px), 1fr))')}>
                <AppInput label="Nome *" value={f.responsavelNome} onChange={(e) => muda('responsavelNome', e.target.value)} data-testid="emendas-beneficiario-responsavel" />
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
              <span style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>Só contatos funcionais. Cada alteração fica no histórico, com quem alterou e quando.</span>
            </div>
          </>
        )}

        {tentouSalvar && pendencias.length > 0 && (
          <div style={aviso('erro')} role="alert" data-testid="emendas-beneficiario-pendencias">
            Falta: {pendencias.join(', ')}.
          </div>
        )}
      </form>
    </Modal>
  );
};
