import React from 'react';
import { NewPasswordScreen } from '../components/auth/NewPasswordScreen';

export const RedefinirSenhaRoute: React.FC = () => (
  <NewPasswordScreen
    title="Criar nova senha"
    subtitle="Escolha uma nova senha para o seu acesso institucional."
    submitLabel="Salvar nova senha"
    successTitle="Senha alterada"
    successText="Sua nova senha já está valendo. Use-a nos próximos acessos."
    invalidText="O link de recuperação expirou ou já foi usado. Solicite um novo link para redefinir sua senha."
  />
);
