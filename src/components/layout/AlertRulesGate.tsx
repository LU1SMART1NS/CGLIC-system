import React from 'react';
import { isSupabaseConfigured } from '../../services/supabaseClient';
import { loadAndApplyAlertSettings } from '../../services/alertSettingsService';
import { loadAndApplyHolidays } from '../../services/holidayService';
import { esperarNoMaximo, ESPERA_MAXIMA_REGRAS_MS } from '../../utils/esperarNoMaximo';

/**
 * Carrega as regras de alertas e o calendário de feriados ajustados na Administração antes de qualquer
 * tela calcular um alerta ou prazo em dias úteis, para nenhum painel nascer com a régua padrão e mudar
 * depois. Sem Supabase (testes/dev local) ou em caso de falha, segue com os padrões do código.
 * Se o banco demorar mais de 8 s, a tela abre com os padrões (antes ficava parada em "Carregando regras de
 * alertas..." sem prazo); as regras do banco passam a valer quando chegarem, nas telas abertas depois.
 */
export const AlertRulesGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = React.useState(!isSupabaseConfigured);

  React.useEffect(() => {
    if (ready) return;
    let active = true;
    void esperarNoMaximo(Promise.all([loadAndApplyAlertSettings(), loadAndApplyHolidays()]), ESPERA_MAXIMA_REGRAS_MS).then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, [ready]);

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', color: 'var(--primary)', fontSize: '0.9rem', fontWeight: 600 }}>
        Carregando regras de alertas...
      </div>
    );
  }
  return <>{children}</>;
};
