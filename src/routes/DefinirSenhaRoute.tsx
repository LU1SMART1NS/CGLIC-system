import React from 'react';
import { NewPasswordScreen } from '../components/auth/NewPasswordScreen';

export const DefinirSenhaRoute: React.FC = () => (
  <NewPasswordScreen
    title="Primeiro acesso"
    subtitle="Crie sua senha pessoal para ativar sua conta no CGLIC."
    submitLabel="Ativar minha conta"
    successTitle="Conta ativada"
    successText="Tudo pronto. Você será levado à tela principal do sistema."
    invalidText="O convite expirou ou já foi usado. Peça ao administrador do sistema que envie um novo convite."
    autoRedirect
  />
);
