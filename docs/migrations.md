# Migrations do banco (Supabase)

Resumo de cada migration de `supabase/migrations/`: o que cria, muda ou apaga no banco. No fim estão os grupos por tema, os jobs do pg_cron e as tabelas que existem hoje.

O **Nº** é o número no fim do nome do arquivo (é como a equipe se refere: "migration 109"). A numeração tem repetições: 20 a 23 aparecem duas vezes, com datas diferentes (a segunda vez está marcada com "b"). Os arquivos 34 e 35 vêm antes do 33, e não existe a 79. A ordem real de aplicação é a do nome do arquivo.

Situação em 14/10/2026: 126 arquivos, de `20260917000001` a `20261014000124`.

## Lista completa

| Nº | Arquivo | O que faz |
|---|---|---|
| 1 | `20260917000001_canonical_schema.sql` | Esquema inicial: atas (`atas_registro_preco`), itens (`itens_ata`), unidades internas (`internal_departments`), processos SEI, alocações por unidade (`arp_allocations` + `item_allocation_state`) e as tabelas manuais de empenho e contrato. |
| 2 | `20260917000002_rbac_and_rls.sql` | `user_roles` e `has_role`; RLS em todas as tabelas; escrita restrita a gestor/admin. |
| 3 | `20260917000003_audit_triggers.sql` | `audit_logs` e o gatilho `trg_audit_log_capture` (inclusão, alteração e exclusão nas tabelas manuais). Só o admin lê. |
| 4 | `20260917000004_rpc_allocations.sql` | `save_allocations_atomic`: grava as alocações de um item de uma vez, com controle de versão. |
| 5 | `20260917000005_rpc_contracts.sql` | `save_manual_contrato_atomic`: contrato manual exige ao menos um empenho vinculado. |
| 6 | `20260917000006_backend_authority_hardening.sql` | Sem escrita direta em alocações e contratos manuais (só por função); versão esperada nas regravações. |
| 7 | `20260917000007_rpc_empenho_links.sql` | `item_empenho_link_state` e `save_empenho_links_atomic` (empenho ligado à alocação). |
| 8 | `20260917000008_manual_data_transactions.sql` | Funções atômicas e versão para empenhos manuais e suas quantidades. |
| 9 | `20260918000009_department_authority.sql` | Criar, excluir e fundir unidades internas. |
| 10 | `20260918000010_sei_authority.sql` | Gravar e excluir processos SEI. |
| 11 | `20260921000011_revoke_direct_write_sei_departments.sql` | Sem escrita direta em unidades internas e processos SEI. |
| 12 | `20260921000012_rpc_delete_manual_contrato.sql` | `delete_manual_contrato_atomic`. |
| 13 | `20260922000013_contract_management_schema.sql` | Gestor do contrato (`contract_managers`), modelos e plano de tarefas por contrato (`contract_task_*`). |
| 14 | `20260922000014_rpc_contract_management.sql` | `normalize_contract_key` (UASG-NÚMERO-ANO) e funções de gestor, modelos e planos. |
| 15 | `20260924000015_arp_item_contract_links.sql` | `arp_item_contract_links` (item da ata ↔ contrato) e funções de vincular/desvincular. |
| 16 | `20260924000016_canonical_empenhos_schema.sql` | `empenhos`, `arp_item_empenhos`, `contrato_empenhos` e `empenho_eventos_historico`. |
| 17 | `20260924000017_rpc_empenhos_atomic.sql` | Gravar a nota e ligá-la ao item e ao contrato. |
| 18 | `20260924000018_empenho_sync_and_views.sql` | Views: resumo das notas, série mensal, saldo detalhado do item (`v_arp_item_saldo_detalhado`), lastro do contrato. |
| 19 | `20260924000019_seed_standard_contract_task_templates.sql` | 8 modelos padrão de gestão contratual da Lei 14.133. |
| 20 | `20260925000020_rpc_get_system_users.sql` | `get_system_users` (usuários e situação do login). |
| 21 | `20260925000021_fix_arp_allocations_updated_at.sql` | Coluna `updated_at` em `arp_allocations`. |
| 22 | `20260925000022_fix_get_system_users_unassigned_fallback.sql` | Usuário sem perfil aparece como "sem perfil". |
| 23 | `20260925000023_rbac_foundation_phase1.sql` | Novo controle de acesso: `roles`, `permissions`, `role_permissions`, `role_domain_scopes`, `user_scope_assignments`, `user_roles.role_id`. |
| 24 | `20260925000024_rbac_authorization_engine.sql` | `has_permission` e `has_scope` (negam por padrão). |
| 25 | `20260925000025_migrate_save_allocations_atomic_to_permission_scope.sql` | Alocações exigem `allocations.manage` com escopo. |
| 26 | `20260925000026_migrate_save_empenho_links_atomic_to_permission_scope.sql` | O mesmo para `save_empenho_links_atomic`. |
| 27 | `20260925000027_migrate_department_rpcs_to_permission.sql` | Unidades internas exigem `departments.manage`. |
| 28 | `20260925000028_migrate_merge_department_allocations_to_permission_scope.sql` | Fusão de unidades exige `allocations.manage`. |
| 29 | `20260925000029_merge_department_allocations_origin_must_be_legacy.sql` | Fusão só a partir de nome antigo ou unidade inativa. |
| 30 | `20260925000030_create_gestor_saldo_role.sql` | Perfil `gestor_saldos`. |
| 31 | `20260925000031_get_system_users_expose_allocation_scope.sql` | Lista de usuários mostra o escopo de alocação. |
| 32 | `20260925000032_gestor_saldo_scope_global.sql` | Gestor de saldo vale para todas as atas. |
| 34 | `20260925000034_contract_task_templates_rpc_grants.sql` | Editar modelos de tarefas (etapas e tarefas). |
| 35 | `20260925000035_sync_arp_allocations_updated_at.sql` | Registra no repositório a coluna que já existia no banco (não muda nada). |
| 33 | `20260926000033_align_gestor_scope_to_contracts.sql` | `gestor` fica só com contratos; gestor de saldo ganha `departments.manage`. |
| 21b | `20260927000021_task_execution_mode.sql` | Modo de execução da tarefa (interna, externa, automática, confirmação). |
| 22b | `20260927000022_contract_payment_cycles.sql` | `contract_payment_cycles` (pagamento, antes guardado no navegador). |
| 23b | `20260927000023_identity_bridge_contract_tasks.sql` | Responsável da tarefa ligado ao usuário (`responsavel_user_id`). |
| 36 | `20260928000036_harden_get_system_users_execute.sql` | Visitante não logado não chama `get_system_users`. |
| 37 | `20260928000037_identity_bridge_contract_managers.sql` | Gestor do contrato ligado ao usuário (`gestor_user_id`). |
| 38 | `20260929000038_ata_managers_schema.sql` | `ata_managers` (gestor por ata). |
| 39 | `20260930000039_ata_management_schema.sql` | Modelos e plano de tarefas por ata (`ata_task_*`). |
| 40 | `20260930000040_rpc_ata_management.sql` | Funções dos modelos e planos de ata. |
| 41 | `20260930000041_drop_unused_sei_write_rpcs.sql` | Apaga as funções de gravar SEI; a tabela fica só para leitura. |
| 42 | `20261001000042_contract_task_plan_crud.sql` | Plano do contrato editável (etapas e tarefas). |
| 43 | `20261001000043_ata_task_plan_crud.sql` | O mesmo para o plano da ata. |
| 44 | `20261001000044_task_plan_modules.sql` | Cada modelo aplicado vira um módulo do plano. |
| 45 | `20261001000045_rename_payment_macro_recepcao.sql` | Etapa 1 do pagamento: "Recepção do Atesto". |
| 46 | `20261002000046_reminder_dismissals.sql` | `reminder_dismissals` (lembrete dispensado). |
| 47 | `20261002000047_security_advisor_hardening.sql` | Funções que gravam fora do alcance de não logados; `search_path` fixo. |
| 48 | `20261002000048_arp_item_contract_dismissals.sql` | `arp_item_contract_dismissals` ("este contrato não é deste item"). |
| 49 | `20261002000049_link_contract_to_items_atomic.sql` | Vincula um contrato a vários itens de uma vez. |
| 50 | `20261002000050_arp_item_contract_links_sem_quantidade.sql` | Vínculo item ↔ contrato sem quantidade digitada (vem da API). |
| 51 | `20261002000051_empenho_item_quantidade_fonte.sql` | Empenho do item vem do contrato vinculado, com a origem da quantidade. |
| 52 | `20261002000052_item_saldo_oficial_empenhos.sql` | `arp_item_saldo_oficial` (empenhado segundo o Compras.gov.br). |
| 53 | `20261002000053_empenhos_so_contrato_fora_saldo_oficial.sql` | Acerto: empenho que só o contrato conhece fica fora do saldo oficial. |
| 54 | `20261002000054_saldo_item_por_quantidade_contratada.sql` | Consumo do item = quantidade contratada nos contratos vinculados. |
| 55 | `20261002000055_gestor_vincula_empenho_unidade.sql` | Permissão `allocations.link_empenho` (nota → unidade interna). |
| 56 | `20261002000056_quantitativo_senasp_item.sql` | `itens_ata.quantidade_senasp`; saldo sobre a cota da SENASP. |
| 57 | `20261002000057_alert_settings.sql` | `alert_settings` (regras de alerta; só o admin grava). |
| 58 | `20261002000058_ciclo_pagamento_tres_marcos.sql` | Marcos do ciclo de pagamento com data e prazos; documentos e eventos do ciclo. |
| 59 | `20261002000059_holidays.sql` | `holidays` (feriados). |
| 60 | `20261002000060_recria_modelo_acompanhamento_pagamento.sql` | Recria o modelo de acompanhamento de pagamento. |
| 61 | `20261002000061_justificativa_prazo_so_alem_do_padrao.sql` | Justificativa só quando o prazo passa do padrão. |
| 62 | `20261002000062_excluir_ciclo_pagamento.sql` | Excluir ciclo de pagamento (só admin). |
| 63 | `20261002000063_pagamentos_sem_checklist.sql` | Pagamento só com os marcos; regularidade fiscal na conferência. |
| 64 | `20261003000064_task_plan_module_nome.sql` | Nome próprio do módulo do plano. |
| 65 | `20261004000065_leitura_somente_autenticados.sql` | Toda leitura só para usuário logado. |
| 66 | `20261005000066_ajuste_complexidade_instrumento.sql` | `instrument_complexity_overrides` (complexidade ajustada pelo coordenador). |
| 67 | `20261005000067_fk_usuarios_set_null.sql` | Excluir usuário não é bloqueado; referências ficam vazias, nome em texto mantido. |
| 68 | `20261005000068_renomear_perfil.sql` | `rename_role` (nome de exibição dos perfis). |
| 69 | `20261005000069_atribuicao_so_coordenador_e_contrato_sem_ata.sql` | Só o coordenador atribui gestor; contrato herda o gestor da ata; `contract_sem_ata_confirmacoes`. |
| 70 | `20261005000070_vinculo_ata_assume_gestor_e_avisos.sql` | Ata sem gestor assume o do contrato; `distribuicao_avisos`. |
| 71 | `20261005000071_descarte_ata_do_contrato.sql` | `contract_ata_descartes` ("esta ata não é a deste contrato"). |
| 72 | `20261006000072_contratos_oficiais.sql` | `contratos_oficiais` e `sincronizacao_fontes` (controle e trava da sincronização). |
| 73 | `20261006000073_itens_ata_fornecedor_identificador_longo.sql` | Coluna do fornecedor cabe identificador estrangeiro. |
| 74 | `20261006000074_advisor_gatilhos_e_indices_fk.sql` | Funções de gatilho fora do alcance de não logados; índices em 16 chaves estrangeiras. |
| 75 | `20261006000075_advisor_policies_rls.sql` | Políticas repetidas da RLS arrumadas por desempenho. |
| 76 | `20261006000076_sincronizacao_acesso_do_servidor.sql` | `eh_service_role`; funções de sincronização aceitam o servidor. |
| 77 | `20261006000077_agendamento_da_sincronizacao.sql` | pg_cron e pg_net; `disparar_sincronizacao` (endereço e segredo no Vault); primeiros jobs. |
| 78 | `20261006000078_itens_dos_contratos.sql` | `itens_contrato`, `itens_contrato_leituras` e `gravar_itens_contratos`. |
| 80 | `20261006000080_situacao_sincronizacao_empenhos_contrato.sql` | `contrato_empenhos_sincronizacao` (última leitura de empenhos de cada contrato). |
| 81 | `20261006000081_ciclo_de_vida_vinculo_empenho_contrato.sql` | `sync_contract_empenhos_atomic` (lista vazia da fonte não remove nada). |
| 82 | `20261006000082_empenhos_no_servidor.sql` | Funções de empenho aceitam o servidor; jobs de empenhos. |
| 83 | `20261006000083_faturas_e_ordens_bancarias.sql` | Faturas (`contrato_faturas`, `fatura_empenhos`…) e ordens bancárias (`ordens_bancarias`, `np_consultas`); jobs. |
| 84 | `20261006000084_atas_e_itens_so_o_servidor_grava.sql` | Só o servidor grava atas e itens. |
| 85 | `20261006000085_vinculo_hibrido_empenho_contrato.sql` | Vínculo nota ↔ contrato com origem (fonte ou manual); `contrato_empenho_descartes`. |
| 86 | `20261007000086_contrato_em_varias_atas.sql` | Contrato em várias atas da mesma compra (cada item em uma ata só). |
| 87 | `20261007000087_ciclo_pagamento_portaria50.sql` | Ciclo de pagamento na Portaria 50/2025 e IN 77/2022; conciliação automática dos ciclos (cron). |
| 88 | `20261007000088_ciclo_escolher_fatura.sql` | `ligar_faturas_ciclo`; `limites_lei_14133_art75`. |
| 89 | `20261007000089_expectativa_pagamento_contrato.sql` | Como cada contrato é pago (mensal, por entrega, eventual). |
| 90 | `20261007000090_previsao_mensal_pagamentos.sql` | Previsão mensal de pagamentos e prazos de emendas. |
| 91 | `20261007000091_copia_unidades_dos_itens.sql` | `itens_ata_unidades_copia` (última lista válida dos órgãos de cada item). |
| 92 | `20261007000092_copia_adesoes_dos_itens.sql` | A cópia guarda também as adesões. |
| 93 | `20261007000093_copia_detalhes_dos_contratos.sql` | `contratos_detalhes_copia` (histórico, responsáveis e garantias). |
| 94 | `20261008000094_distribuicao_empenho_itens_contrato.sql` | Nota dividida pelos itens do contrato; automática em contrato de um item; views de execução. |
| 95 | `20261008000095_vinculo_automatico_ata_contrato.sql` | Vínculo automático ata ↔ contrato (compra + fornecedor + item); job de hora em hora. |
| 96 | `20261008000096_processo_da_compra_nas_atas.sql` | Processo da compra nas atas (PNCP). |
| 97 | `20261008000097_get_system_users_perfil_por_role_id.sql` | Lista de usuários lê o perfil de `role_id`. |
| 98 | `20261008000098_unidade_interna_so_gestor_coordenador.sql` | Só gestor e coordenador ligam a nota à unidade interna. |
| 99 | `20261008000099_apagar_copia_antiga_empenho_item.sql` | Apaga `arp_item_empenhos` (cópia fechada em `arp_item_empenhos_descartada`) e `arp_item_saldo_oficial`. |
| 100 | `20261008000100_prever_vinculos_automaticos_rapido.sql` | `prever_vinculos_automaticos` de ~20 s para menos de 1 s. |
| 101 | `20261008000101_avisos_resolvidos.sql` | `avisos_resolvidos` (com justificativa); apaga `reminder_dismissals`. |
| 102 | `20261008000102_base_senasp_acompanha_copia_orgaos.sql` | Cota SENASP recalculada quando a lista de órgãos muda. |
| 103 | `20261009000103_contratado_por_unidade_interna.sql` | Quantidade contratada ajustável com justificativa; divisão do contratado entre as unidades. |
| 104 | `20261009000104_quantidade_informada_nota_item.sql` | Gestor informa a quantidade da nota em cada item. |
| 105 | `20261009000105_atas_em_que_a_senasp_participa.sql` | Atas de outros órgãos em que a SENASP participa ou aderiu; jobs. |
| 106 | `20261009000106_atas_de_outros_orgaos_na_carteira.sql` | Essas atas na carteira; chave de gestão número-UASG. |
| 107 | `20261009000107_fornecedor_da_ata_pelo_pncp.sql` | `atas_fornecedor_pncp`: coordenador indica o fornecedor da ata só no PNCP. |
| 108 | `20261009000108_unidade_interna_em_uso_so_desativa.sql` | Unidade em uso só se desativa. |
| 109 | `20261013000109_quantitativos_ata_assinada.sql` | Ata assinada por órgão (nº SEI), histórico do registrado, remanejamentos, cota própria, contratos dos participantes; jobs. |
| 110 | `20261013000110_divisao_automatica_segura.sql` | Divisão automática só com uma unidade e quantidade que cabe no alocado. |
| 111 | `20261013000111_cadastro_uasgs.sql` | `uasgs_cadastro` (nome, cidade e UF das UASGs); job. |
| 112 | `20261013000112_vinculo_automatico_protege_trabalho_do_gestor.sql` | Cron marca para conferir em vez de apagar vínculo com trabalho do gestor. |
| 113 | `20261013000113_sincronizacao_protege_notas_e_faturas.sql` | Nota com trabalho do gestor e fatura em ciclo ficam a conferir. |
| 114 | `20261013000114_quantitativos_participante_e_adesao.sql` | Ata assinada em ata de outro órgão (só SENASP); `adesao_quantidade_informada`. |
| 115 | `20261013000115_vinculo_guarda_quem_vinculou.sql` | Vínculo guarda o nome de quem vinculou. |
| 116 | `20261013000116_alocacao_sem_ata_assinada.sql` | Colunas para os avisos de alocação sem ata assinada (sem bloqueio). |
| 117 | `20261013000117_empenhos_citados_fora_do_contrato.sql` | Notas citadas por fatura fora do contrato; "vou corrigir no Contratos.gov.br"; desliga o vínculo de nota à mão. |
| 118 | `20261013000118_vinculo_empenho_item_pelo_valor.sql` | Nota ao item pelo valor (origem VALOR). |
| 119 | `20261014000119_ob_paga_pela_outra_ug.sql` | `ob_cita_fatura`: OB da outra UG vale se cita a fatura. |
| 120 | `20261014000120_ob_cita_fatura_zeros.sql` | Citação aceita zeros à esquerda. |
| 121 | `20261014000121_itens_da_nota_siafi.sql` | Itens da nota pelo Portal da Transparência (origem SIAFI); jobs. |
| 122 | `20261014000122_resumo_faturas_sem_np.sql` | Resumo separa liquidadas sem NP. |
| 123 | `20261014000123_pagamento_a_conferir.sql` | `fatura_pagamento`: OB só confirma se citar a fatura ou pagar o fornecedor certo; job de recálculo. |
| 124 | `20261014000124_perfil_canonico_e_usuario_desativado.sql` | `has_role` lê `role_id`; `usuario_ativo`; usuário desativado perde o acesso na hora. |

## Por tema

- **Atas e itens:** 1, 56, 73, 84, 91–92, 96, 102, 105–107, 109, 111, 114, 116.
- **Contratos e gestão:** planos e modelos 5, 12–14, 19, 34, 21b, 23b, 37–44, 64; complexidade 66; gestor e distribuição 69–71, 86; contratos oficiais 72, itens 78, detalhes 93; avisos 46, 101.
- **Notas de empenho:** 16–18, 51–54, 80–82, 85, 94, 99, 104, 113, 117, 118, 121.
- **Faturas e OB:** 83, 119, 120, 122, 123.
- **Ciclo de pagamento e previsão:** 22b, 45, 58, 60–63, 87–90; feriados 59.
- **Alocação e unidades internas:** 4, 6–9, 11, 21, 28, 29, 35; nota → unidade 55, 98; contratado por unidade 103, 110; unidade em uso 108.
- **Vínculos automáticos:** item ↔ contrato 15, 48–50, 95, 100, 112, 115; nota ↔ item 94 (contrato de um item), 118 (pelo valor), 121 (SIAFI).
- **Sincronização e cron:** 72, 76, 77, 78, 80, 82, 83, 87, 91, 95, 105, 109, 111, 121, 123.
- **Segurança, perfis e RLS:** 2, 3, 6, 11, 20, 22–32, 33, 36, 47, 55, 65, 67, 68, 74, 75, 76, 84, 97, 98, 124.
- **Limpezas e acertos de dados:** 41, 53, 60, 99, 101, 110.

## Jobs do pg_cron

Os jobs de sincronização chamam `disparar_sincronizacao(recurso, uasg)`, que aciona a Edge Function `sincronizar-fontes`. Horário = minuto de cada hora, no relógio do banco.

| Job | Horário | O que faz | Migration |
|---|---|---|---|
| sincronizar-contratos-200330 / -200331 | :05 | contratos | 77 |
| sincronizar-atas-participacao-200330 / -200331 | :10 / :12 | atas em que a SENASP participa ou aderiu | 105 |
| sincronizar-atas-200330 / -200331 | :15 | atas | 77 |
| sincronizar-faturas-200330 / -200331 | :20 / :22 | faturas | 83 |
| sincronizar-itens-contratos-200330 / -200331 | :25 | itens, histórico, responsáveis e garantias dos contratos | 78 (93 amplia) |
| recalcular-pagamento-faturas | :28 e :58 | `recalcular_pagamento_faturas()` | 123 |
| conciliar-ciclos-pagamento | :29 e :59 | `conciliar_ciclos_pagamento()` | 87 |
| sincronizar-contratos-participantes-200330 / -200331 | :32 / :34 | contratos dos órgãos participantes | 109 |
| sincronizar-saldos-itens | :35 | saldos dos itens | 77 |
| sincronizar-unidades-itens-200330 / -200331 | :40 / :42 | órgãos e adesões dos itens | 91 |
| sincronizar-empenhos-200330 / -200331 | :45 / :50 | empenhos | 82 |
| sincronizar-cadastro-uasgs | :48 | cadastro de UASGs | 111 |
| vincular-contratos-automaticamente | :55 | `executar_vinculos_automaticos(...,'CRON')` | 95 |
| sincronizar-ordens-bancarias-200330 / -200331 | :55 / :57 | ordens bancárias | 83 |
| sincronizar-itens-notas-siafi-200330 | :02 e :32 | itens da nota (Portal da Transparência) | 121 |
| sincronizar-itens-notas-siafi-200331 | :17 e :47 | itens da nota (Portal da Transparência) | 121 |
| limpar-historico-do-cron | domingo 03:00 | apaga o histórico do cron com mais de 7 dias | 77 |

Nenhum job foi removido: as migrations 87 e 123 usam `cron.unschedule` só para recriar o próprio job. O endereço da função e o segredo ficam no Vault, fora das migrations.

## Tabelas no estado final

- **Atas e itens:** `atas_registro_preco`, `itens_ata`, `itens_ata_unidades_copia`, `itens_ata_unidades_historico`, `atas_participacao`, `itens_ata_participacao`, `participacao_compras_lidas`, `atas_fornecedor_pncp`, `ata_item_quantidade_assinada`, `ata_item_assinada_registros`, `ata_item_remanejamentos`, `ata_item_continua_orgao`, `adesao_quantidade_informada`, `uasgs_cadastro`, `participantes_contratos_itens`, `participantes_contratos_leituras`.
- **Contratos e gestão:** `contratos_oficiais`, `itens_contrato`, `itens_contrato_leituras`, `contratos_detalhes_copia`, `contract_managers`, `ata_managers`, `contract_task_*` (6), `ata_task_*` (6), `instrument_complexity_overrides`, `contract_sem_ata_confirmacoes`, `contract_ata_descartes`, `distribuicao_avisos`, `avisos_resolvidos`.
- **Vínculos:** `arp_item_contract_links`, `arp_item_contract_dismissals`, `vinculo_automatico_execucoes`, `vinculo_automatico_a_conferir`, `vinculo_automatico_decisoes`.
- **Empenhos:** `empenhos`, `contrato_empenhos`, `empenho_eventos_historico`, `contrato_empenhos_sincronizacao`, `contrato_empenho_descartes`, `contrato_empenho_distribuicoes`, `contrato_empenho_itens`, `contrato_empenho_vinculo_recusado`, `contrato_empenho_ausente_da_fonte`, `ausente_da_fonte_decisoes`, `correcoes_empenho_na_fonte`, `empenho_leituras_siafi`, `empenho_itens_siafi`, `correcoes_nota_no_contrato`.
- **Faturas, OB e pagamento:** `contrato_faturas`, `fatura_empenhos`, `contrato_faturas_sincronizacao`, `fatura_ausente_da_fonte`, `fatura_pagamento`, `ordens_bancarias`, `np_consultas`, `contract_payment_cycles` e tabelas do ciclo (documentos, eventos, checklist, faturas, itens), `contrato_expectativa_pagamento`, `contrato_entregas_previstas`, `previsao_pagamentos`, `previsao_pagamentos_ajustes`, `prazos_emendas`, `limites_lei_14133_art75`, `holidays`, `alert_settings`.
- **Alocação e unidades:** `internal_departments`, `arp_allocations`, `item_allocation_state`, `empenho_links`, `item_empenho_link_state`, `contrato_item_quantidade_ajustes`, `contrato_item_divisoes`, `contrato_item_divisao_unidades`.
- **Controle e segurança:** `user_roles`, `roles`, `permissions`, `role_permissions`, `role_domain_scopes`, `user_scope_assignments`, `audit_logs`, `sincronizacao_fontes`.
- **Antigas, ainda no banco sem uso pelas telas:** `processos_sei` (só leitura), `empenhos_manuais`, `empenho_manual_quantidades`, `contratos_manuais`, `contrato_empenho_links`, `item_manual_empenho_state`, `item_manual_quantity_state`, e a cópia fechada `arp_item_empenhos_descartada` (99). A migration 51 previu apagar três delas, mas isso nunca foi feito.
- **Apagadas:** `arp_item_empenhos` e `arp_item_saldo_oficial` (99), `reminder_dismissals` (101).
