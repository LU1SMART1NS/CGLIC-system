import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, KeyRound, LogOut, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
import { ActionButton, AppButton } from '../design-system';
import { MIN_PASSWORD_LENGTH, PasswordInput, traduzirErroAuth } from './auth/AuthLayout';

/** Nome exibido: cadastro (nome / full_name) ou, na falta, a parte local do e-mail. */
export function nomeDoUsuario(user: { email?: string | null; user_metadata?: Record<string, unknown> }): string {
  const meta = user.user_metadata ?? {};
  const nome = [meta.nome, meta.full_name].find((v): v is string => typeof v === 'string' && v.trim() !== '');
  return nome?.trim() || user.email?.split('@')[0] || 'Usuário';
}

const ChangePasswordModal: React.FC<{ email: string; onClose: () => void }> = ({ email, onClose }) => {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!atual) return setErro('Informe a senha atual.');
    if (nova.length < MIN_PASSWORD_LENGTH) return setErro(`A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    if (nova !== confirma) return setErro('As duas senhas novas não são iguais.');
    if (nova === atual) return setErro('A nova senha deve ser diferente da atual.');
    if (!supabase) return setErro('Serviço de autenticação indisponível.');

    setBusy(true);
    setErro(null);
    try {
      const { error: errAtual } = await supabase.auth.signInWithPassword({ email, password: atual });
      if (errAtual) {
        setErro('A senha atual está incorreta.');
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: nova });
      if (error) {
        setErro(traduzirErroAuth(error));
        return;
      }
      setOk(true);
    } catch (err) {
      setErro(traduzirErroAuth(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="user-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="user-modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
        <div className="user-modal__head">
          <h2 id="user-modal-title">Alterar senha</h2>
          <button type="button" className="user-modal__close" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        {ok ? (
          <div className="user-modal__body" role="status">
            <p>Senha alterada com sucesso.</p>
            <ActionButton action="fechar" type="button" fullWidth style={{ marginTop: '0.75rem' }} onClick={onClose} />
          </div>
        ) : (
          <form className="user-modal__body" onSubmit={submit} noValidate>
            {erro && <div className="user-modal__error" role="alert">{erro}</div>}
            <input type="email" autoComplete="username" value={email} readOnly hidden />
            <label htmlFor="pw-atual">Senha atual</label>
            <PasswordInput id="pw-atual" value={atual} onChange={setAtual} autoComplete="current-password" autoFocus />
            <label htmlFor="pw-nova">Nova senha</label>
            <PasswordInput id="pw-nova" value={nova} onChange={setNova} autoComplete="new-password" placeholder={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`} />
            <label htmlFor="pw-confirma">Confirme a nova senha</label>
            <PasswordInput id="pw-confirma" value={confirma} onChange={setConfirma} autoComplete="new-password" />
            <AppButton type="submit" fullWidth style={{ marginTop: '0.75rem' }} isLoading={busy}>{busy ? 'Salvando…' : 'Salvar nova senha'}</AppButton>
          </form>
        )}
      </div>
    </div>
  );
};

export const UserMenu: React.FC = () => {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const nome = nomeDoUsuario(user);

  return (
    <>
      <div className="user-menu" ref={ref}>
        <button type="button" className="user-menu__trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)} title={user.email ?? undefined}>
          <span className="user-menu__name">{nome}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {open && (
          <div className="user-menu__panel" role="menu">
            <div className="user-menu__who">
              <strong>{nome}</strong>
              <span>{user.email}</span>
            </div>
            {user.email && (
              <button type="button" role="menuitem" onClick={() => { setOpen(false); setPwOpen(true); }}>
                <KeyRound size={15} /> Alterar senha
              </button>
            )}
            <button type="button" role="menuitem" onClick={signOut}>
              <LogOut size={15} /> Sair
            </button>
          </div>
        )}
      </div>
      {pwOpen && user.email && <ChangePasswordModal email={user.email} onClose={() => setPwOpen(false)} />}
    </>
  );
};
