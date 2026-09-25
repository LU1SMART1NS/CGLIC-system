-- ==============================================================================
-- MIGRATION 19: SEED DE MODELOS PADRÃO DE GESTÃO CONTRATUAL (LEI 14.133/2021)
-- Versão: 20260924000019_seed_standard_contract_task_templates.sql
-- Invariantes: P1 (SSOT), P3 (Database Integrity), P6 (Auditabilidade)
-- ==============================================================================

-- 1. TEMPLATES DE GESTÃO CONTRATUAL
INSERT INTO public.contract_task_templates (id, nome, descricao, ativo, created_at, updated_at)
VALUES
  (
    'tpl-prorrogacao-padrao-14133',
    'Workflow Padrão de Prorrogação Contratual (Lei 14.133/21)',
    'Roteiro instrutório e checklist operacional para renovação de vigência de contratos de serviços contínuos.',
    true,
    NOW(),
    NOW()
  ),
  (
    'tpl-acrescimo-padrao-14133',
    'Workflow Padrão de Acréscimo Quantitativo (Lei 14.133/21)',
    'Roteiro instrutório para acréscimo de quantitativo/valor em até 25% (ou 50% para reforma).',
    true,
    NOW(),
    NOW()
  ),
  (
    'tpl-supressao-padrao-14133',
    'Workflow Padrão de Supressão Quantitativa (Lei 14.133/21)',
    'Roteiro instrutório para redução unilateral (até 25%) ou bilateral (> 25%) de quantitativo/valor.',
    true,
    NOW(),
    NOW()
  ),
  (
    'tpl-reajuste-padrao-14133',
    'Workflow Padrão de Reajuste por Índice de Preços (Apostilamento)',
    'Roteiro instrutório para reajuste de preços de bens e serviços por índice contratual (art. 136, I).',
    true,
    NOW(),
    NOW()
  ),
  (
    'tpl-repactuacao-padrao-14133',
    'Workflow Padrão de Repactuação de Mão de Obra (Lei 14.133/21)',
    'Roteiro instrutório para repactuação de custos de serviços contínuos com dedicação exclusiva de mão de obra.',
    true,
    NOW(),
    NOW()
  ),
  (
    'tpl-alteracao-geral-14133',
    'Workflow Padrão de Alteração Administrativa / Qualitativa',
    'Roteiro instrutório geral para modificações contratuais e apostilamentos administrativos.',
    true,
    NOW(),
    NOW()
  ),
  (
    'tpl-encerramento-padrao-14133',
    'Workflow Padrão de Encerramento Regular (Lei 14.133/21)',
    'Roteiro instrutório para encerramento regular, atesto do TRD, liberação de garantia e liquidação final.',
    true,
    NOW(),
    NOW()
  ),
  (
    'tpl-rescisao-padrao-14133',
    'Workflow Padrão de Extinção Antecipada / Rescisão (Lei 14.133/21)',
    'Roteiro instrutório para rescisão unilateral ou consensual com contraditório e ampla defesa.',
    true,
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  ativo = EXCLUDED.ativo,
  updated_at = NOW();

-- 2. MACROTAREFAS DOS TEMPLATES
INSERT INTO public.contract_task_template_macrotasks (id, template_id, nome, ordem, created_at, updated_at)
VALUES
  -- Prorrogação (tpl-prorrogacao-padrao-14133)
  ('macro-prorr-1', 'tpl-prorrogacao-padrao-14133', '1. Avaliação de Interesse e Consulta à Contratada', 1, NOW(), NOW()),
  ('macro-prorr-2', 'tpl-prorrogacao-padrao-14133', '2. Economicidade, Vantajosidade e Habilitação', 2, NOW(), NOW()),
  ('macro-prorr-3', 'tpl-prorrogacao-padrao-14133', '3. Instrução Processual e Análise Jurídica', 3, NOW(), NOW()),
  ('macro-prorr-4', 'tpl-prorrogacao-padrao-14133', '4. Assinatura, Eficácia e Publicação', 4, NOW(), NOW()),

  -- Acréscimo (tpl-acrescimo-padrao-14133)
  ('macro-acresc-1', 'tpl-acrescimo-padrao-14133', '1. Instrução Técnica e Limites Quantitativos', 1, NOW(), NOW()),
  ('macro-acresc-2', 'tpl-acrescimo-padrao-14133', '2. Análise Jurídica e Decisão Administrativa', 2, NOW(), NOW()),
  ('macro-acresc-3', 'tpl-acrescimo-padrao-14133', '3. Assinatura, Publicação e Eficácia Oficial', 3, NOW(), NOW()),

  -- Supressão (tpl-supressao-padrao-14133)
  ('macro-supress-1', 'tpl-supressao-padrao-14133', '1. Justificativa de Desnecessidade e Limites', 1, NOW(), NOW()),
  ('macro-supress-2', 'tpl-supressao-padrao-14133', '2. Formalização do Termo Aditivo', 2, NOW(), NOW()),

  -- Reajuste (tpl-reajuste-padrao-14133)
  ('macro-reajuste-1', 'tpl-reajuste-padrao-14133', '1. Apuração do Índice e Memória de Cálculo', 1, NOW(), NOW()),
  ('macro-reajuste-2', 'tpl-reajuste-padrao-14133', '2. Lavratura do Termo de Apostilamento', 2, NOW(), NOW()),

  -- Repactuação (tpl-repactuacao-padrao-14133)
  ('macro-repact-1', 'tpl-repactuacao-padrao-14133', '1. Análise da CCT e Planilha de Custos', 1, NOW(), NOW()),
  ('macro-repact-2', 'tpl-repactuacao-padrao-14133', '2. Parecer Jurídico e Decisão', 2, NOW(), NOW()),
  ('macro-repact-3', 'tpl-repactuacao-padrao-14133', '3. Assinatura e Publicação', 3, NOW(), NOW()),

  -- Alteração Geral (tpl-alteracao-geral-14133)
  ('macro-alt-1', 'tpl-alteracao-geral-14133', '1. Instrução e Justificativa Administrativa', 1, NOW(), NOW()),
  ('macro-alt-2', 'tpl-alteracao-geral-14133', '2. Formalização e Registro', 2, NOW(), NOW()),

  -- Encerramento Regular (tpl-encerramento-padrao-14133)
  ('macro-close-1', 'tpl-encerramento-padrao-14133', '1. Verificação de Obrigações e TRD', 1, NOW(), NOW()),
  ('macro-close-2', 'tpl-encerramento-padrao-14133', '2. Formalização do Encerramento', 2, NOW(), NOW()),
  ('macro-close-3', 'tpl-encerramento-padrao-14133', '3. Publicação e Eficácia no PNCP', 3, NOW(), NOW()),

  -- Rescisão (tpl-rescisao-padrao-14133)
  ('macro-resc-1', 'tpl-rescisao-padrao-14133', '1. Motivação e Contraditório', 1, NOW(), NOW()),
  ('macro-resc-2', 'tpl-rescisao-padrao-14133', '2. Análise Jurídica e Decisão', 2, NOW(), NOW()),
  ('macro-resc-3', 'tpl-rescisao-padrao-14133', '3. Formalização e Liquidação', 3, NOW(), NOW()),
  ('macro-resc-4', 'tpl-rescisao-padrao-14133', '4. Publicação e Eficácia no PNCP', 4, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  template_id = EXCLUDED.template_id,
  nome = EXCLUDED.nome,
  ordem = EXCLUDED.ordem,
  updated_at = NOW();

-- 3. TAREFAS DOS TEMPLATES
INSERT INTO public.contract_task_template_tasks (id, macrotask_id, nome, ordem, created_at, updated_at)
VALUES
  -- Prorrogação - Macro 1
  ('task-prorr-1', 'macro-prorr-1', 'Elaborar Nota Técnica de Justificativa e Interesse da Administração', 1, NOW(), NOW()),
  ('task-prorr-2', 'macro-prorr-1', 'Expedir Ofício de Consulta de Interesse à Contratada (Prazo 10 dias úteis)', 2, NOW(), NOW()),
  ('task-prorr-3', 'macro-prorr-1', 'Obter e Juntar aos autos a Manifestação Formal da Contratada', 3, NOW(), NOW()),
  -- Prorrogação - Macro 2
  ('task-prorr-4', 'macro-prorr-2', 'Realizar Pesquisa de Preços de Mercado e Demonstração de Vantajosidade Econômica', 4, NOW(), NOW()),
  ('task-prorr-5', 'macro-prorr-2', 'Verificar Regularidade Fiscal, Trabalhista e Previdenciária no SICAF/CND/FGTS', 5, NOW(), NOW()),
  -- Prorrogação - Macro 3
  ('task-prorr-6', 'macro-prorr-3', 'Elaborar Minuta do Termo Aditivo de Prorrogação de Vigência', 6, NOW(), NOW()),
  ('task-prorr-6b', 'macro-prorr-3', 'Verificar pedidos pendentes de reajuste/repactuação e incluir ressalva na minuta', 7, NOW(), NOW()),
  ('task-prorr-7', 'macro-prorr-3', 'Submeter Processo à Consultoria Jurídica da União (CONJUR/AGU)', 8, NOW(), NOW()),
  ('task-prorr-8', 'macro-prorr-3', 'Atender eventuais recomendações constantes do Parecer Jurídico da CONJUR/AGU', 9, NOW(), NOW()),
  -- Prorrogação - Macro 4
  ('task-prorr-9', 'macro-prorr-4', 'Coletar Assinatura Eletrônica das Partes no SEI antes da expiração da vigência', 10, NOW(), NOW()),
  ('task-prorr-10', 'macro-prorr-4', 'Publicar Termo Aditivo no PNCP e no Diário Oficial da União (DOU)', 11, NOW(), NOW()),

  -- Acréscimo - Macro 1
  ('task-acresc-1', 'macro-acresc-1', 'Elaborar Nota Técnica com justificativa da necessidade de acréscimo de objeto/valor', 1, NOW(), NOW()),
  ('task-acresc-2', 'macro-acresc-1', 'Verificar limites legais (até 25% ordinário ou até 50% reforma, art. 125)', 2, NOW(), NOW()),
  ('task-acresc-3', 'macro-acresc-1', 'Verificar disponibilidade orçamentária para o acréscimo de despesa', 3, NOW(), NOW()),
  ('task-acresc-4', 'macro-acresc-1', 'Consultar concordância da Contratada e regularidade no SICAF', 4, NOW(), NOW()),
  -- Acréscimo - Macro 2
  ('task-acresc-5', 'macro-acresc-2', 'Elaborar Minuta do Termo Aditivo de Acréscimo', 5, NOW(), NOW()),
  ('task-acresc-6', 'macro-acresc-2', 'Submeter processo à Consultoria Jurídica (CONJUR/AGU)', 6, NOW(), NOW()),
  ('task-acresc-7', 'macro-acresc-2', 'Aprovar formalmente o aditamento pela autoridade competente', 7, NOW(), NOW()),
  -- Acréscimo - Macro 3
  ('task-acresc-8', 'macro-acresc-3', 'Coletar assinaturas no SEI e publicar Termo Aditivo no PNCP/DOU', 8, NOW(), NOW()),

  -- Supressão - Macro 1
  ('task-supress-1', 'macro-supress-1', 'Elaborar Nota Técnica justificando a redução de demanda ou desnecessidade dos itens', 1, NOW(), NOW()),
  ('task-supress-2', 'macro-supress-1', 'Calcular percentual de supressão sobre o valor inicial atualizado (sem compensação)', 2, NOW(), NOW()),
  ('task-supress-3', 'macro-supress-1', 'Obter concordância formal da Contratada caso a supressão exceda 25% (art. 126)', 3, NOW(), NOW()),
  -- Supressão - Macro 2
  ('task-supress-4', 'macro-supress-2', 'Elaborar Minuta de Termo Aditivo de Supressão e parecer jurídico se necessário', 4, NOW(), NOW()),
  ('task-supress-5', 'macro-supress-2', 'Assinar Termo Aditivo e publicar no PNCP/DOU', 5, NOW(), NOW()),

  -- Reajuste - Macro 1
  ('task-reajuste-1', 'macro-reajuste-1', 'Verificar data-base da proposta e cláusula de reajustamento no contrato', 1, NOW(), NOW()),
  ('task-reajuste-2', 'macro-reajuste-1', 'Apurar a variação acumulada do índice oficial pactuado (IPCA/INPC/IGP-M)', 2, NOW(), NOW()),
  ('task-reajuste-3', 'macro-reajuste-1', 'Elaborar Memória de Cálculo e Nota Técnica com os novos valores unitários e globais', 3, NOW(), NOW()),
  ('task-reajuste-4', 'macro-reajuste-1', 'Confirmar dotação orçamentária para a diferença de valor resultante', 4, NOW(), NOW()),
  -- Reajuste - Macro 2
  ('task-reajuste-5', 'macro-reajuste-2', 'Lavrar Termo de Apostilamento (dispensa parecer jurídico prévio se mantida a regra)', 5, NOW(), NOW()),
  ('task-reajuste-6', 'macro-reajuste-2', 'Juntar aos autos do processo SEI e enviar dados para divulgação no PNCP', 6, NOW(), NOW()),

  -- Repactuação - Macro 1
  ('task-repact-1', 'macro-repact-1', 'Conferir registro da Convenção Coletiva de Trabalho (CCT) no MTE', 1, NOW(), NOW()),
  ('task-repact-2', 'macro-repact-1', 'Verificar tempestividade e ausência de preclusão lógica em relação a prorrogações anteriores', 2, NOW(), NOW()),
  ('task-repact-3', 'macro-repact-1', 'Auditar analiticamente a Planilha de Custos e Formação de Preços apresentada pela Contratada', 3, NOW(), NOW()),
  -- Repactuação - Macro 2
  ('task-repact-4', 'macro-repact-2', 'Elaborar Minuta de Termo Aditivo de Repactuação e encaminhar à CONJUR/AGU', 4, NOW(), NOW()),
  ('task-repact-5', 'macro-repact-2', 'Emitir Nota de Empenho de reforço para a cobertura da diferença salarial e retroativos', 5, NOW(), NOW()),
  -- Repactuação - Macro 3
  ('task-repact-6', 'macro-repact-3', 'Assinar Termo Aditivo e publicar no PNCP/DOU', 6, NOW(), NOW()),

  -- Alteração Geral - Macro 1
  ('task-alt-1', 'macro-alt-1', 'Elaborar justificativa técnica para a alteração contratual ou apostilamento', 1, NOW(), NOW()),
  ('task-alt-2', 'macro-alt-1', 'Submeter à análise jurídica se o instrumento exigir parecer prévio', 2, NOW(), NOW()),
  -- Alteração Geral - Macro 2
  ('task-alt-3', 'macro-alt-2', 'Lavrar o instrumento formal (Termo Aditivo ou Apostilamento) e juntar ao processo SEI', 3, NOW(), NOW()),

  -- Encerramento Regular - Macro 1
  ('task-close-1', 'macro-close-1', 'Emitir Termo de Recebimento Definitivo (TRD) pelo fiscal/gestor', 1, NOW(), NOW()),
  ('task-close-2', 'macro-close-1', 'Verificar quitação de liquidações financeiras e anular saldos residuais de empenho', 2, NOW(), NOW()),
  ('task-close-3', 'macro-close-1', 'Expedir termo de liberação e restituição da garantia contratual se aplicável', 3, NOW(), NOW()),
  ('task-close-4', 'macro-close-1', 'Verificar regularidade fiscal e trabalhista final no SICAF', 4, NOW(), NOW()),
  -- Encerramento Regular - Macro 2
  ('task-close-5', 'macro-close-2', 'Formalizar termo de encerramento contratual e juntar ao processo SEI', 5, NOW(), NOW()),
  -- Encerramento Regular - Macro 3
  ('task-close-6', 'macro-close-3', 'Registrar encerramento no Contratos.gov.br e aguardar confirmação no PNCP', 6, NOW(), NOW()),

  -- Rescisão - Macro 1
  ('task-resc-1', 'macro-resc-1', 'Elaborar Nota Técnica com a motivação e caracterização das infrações contratuais', 1, NOW(), NOW()),
  ('task-resc-2', 'macro-resc-1', 'Notificar a Contratada para apresentar defesa prévia no prazo legal', 2, NOW(), NOW()),
  ('task-resc-3', 'macro-resc-1', 'Analisar defesa prévia da Contratada e emitir manifestação técnica conclusiva', 3, NOW(), NOW()),
  -- Rescisão - Macro 2
  ('task-resc-4', 'macro-resc-2', 'Submeter processo de rescisão à Consultoria Jurídica (CONJUR/AGU)', 4, NOW(), NOW()),
  ('task-resc-5', 'macro-resc-2', 'Decisão formal da autoridade competente quanto à extinção do contrato', 5, NOW(), NOW()),
  -- Rescisão - Macro 3
  ('task-resc-6', 'macro-resc-3', 'Lavrar Termo de Rescisão Contratual e notificar as partes', 6, NOW(), NOW()),
  ('task-resc-7', 'macro-resc-3', 'Apurar haveres, perdas e danos e destinação da garantia contratual', 7, NOW(), NOW()),
  -- Rescisão - Macro 4
  ('task-resc-8', 'macro-resc-4', 'Publicar o ato de extinção no PNCP/DOU e registrar no Contratos.gov.br', 8, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  macrotask_id = EXCLUDED.macrotask_id,
  nome = EXCLUDED.nome,
  ordem = EXCLUDED.ordem,
  updated_at = NOW();
