# Regras de dados e decisões de negócio

Regras que valem para o sistema inteiro. Antes de criar um indicador, uma sugestão automática ou uma regra de vínculo, confira esta lista. Cada regra veio de uma decisão da coordenação ou de um erro já encontrado nos dados.

## Princípios

- **Nada inventado.** Todo dado na tela vem de um campo real das fontes oficiais ou do banco. Se a fonte não informa, a tela diz que não informa; não se estima nem se preenche com valor padrão. Não repetir o mesmo dado duas vezes na mesma tela.
- **O navegador só lê.** Toda leitura das fontes oficiais roda no servidor (Edge Function `sincronizar-fontes`, chamada pelo pg_cron). O navegador lê o banco; gravações do usuário passam por funções do banco (RPC) que conferem o perfil.
- **Automação nunca apaga trabalho humano sem aviso.** Quando a fonte deixa de confirmar algo em que o gestor já trabalhou (divisão por unidade, quantidade ajustada, nota com quantidade informada, fatura em ciclo de pagamento), o registro fica marcado "a conferir" e o coordenador decide, com justificativa.
- **Erro da fonte se corrige na fonte.** Empenho listado no contrato errado se corrige no Contratos.gov.br; a correção chega na próxima sincronização. O sistema não tem vínculo à mão de empenho a contrato (retirado em 13/10/2026).
- **Texto todo em maiúsculas** vindo das fontes é mostrado como frase normal; o resto aparece como veio.

## Quem é quem

- **Gestor** é o servidor atribuído no sistema (tabelas `ata_managers` e `contract_managers`), nunca o "gestor" que a API informa.
- Quem cuida da ata cuida dos contratos dela (garantido no banco). Um contrato pode ter itens de mais de uma ata da mesma compra; nesse caso só o coordenador decide o gestor.
- Perfis:
  - **Coordenador** (`admin`): faz tudo, inclusive decidir conflitos e marcar avisos como resolvidos.
  - **Gestor de atas e contratos** (`gestor`): cuida das próprias atas e contratos; informa e corrige a quantidade da ata assinada.
  - **Gestor de saldos** (`gestor_saldos`): aloca quantitativo às unidades internas, confirma remanejamentos entre órgãos; não vê o Financeiro nem a Administração.
  - **Leitor** (`leitor`): só consulta.

## Atas e itens

- **Cada ata tem um único fornecedor.** Matriz e filial contam como o mesmo, mas podem ter atas diferentes na mesma compra.
- O PNCP lista itens **da compra**, não da ata. Itens só são atribuídos a uma ata pelo PNCP quando a compra gerou uma ata só, ou quando o coordenador indicou o fornecedor da ata.
- O Compras.gov.br pode atrasar semanas na publicação de atas novas; por isso a sincronização também procura no PNCP as atas que faltam. Quando o PNCP não informa o fornecedor (compra com várias atas), a ata fica pendente até o coordenador indicar o fornecedor entre os que têm resultado publicado na compra (nada digitado).
- O PNCP às vezes numera diferente (ex.: 00068/2024 no Compras.gov.br é 90068 no PNCP). Comparar sempre também pelo número de controle.
- O número da compra que os contratos citam está no cadastro da compra do PNCP (`numeroCompra`), não no sequencial.
- Ata cancelada é reconhecida pelo `status_ata` gravado no banco.
- O nome do órgão vem do cadastro de UASGs (nome, cidade e UF), não do nome cortado que a ata traz.

## Quantitativos e saldo

- **Limite de adesão** vem de `maximoAdesao` (2 vezes o registrado na ata), nunca da quantidade da SENASP.
- **Cota própria da SENASP** = registrado da SENASP − quantidade gerenciada para participantes. Sem a quantidade da ata assinada informada, o limite é o registrado da SENASP (provisório, com aviso; a alocação não é bloqueada).
- O documento da ata assinada é o **número do documento SEI** (8 dígitos), não o número do processo.
- **Remanejado a menos é definitivo:** redução do registrado de um órgão depois do registro da ata conta como cessão do órgão; a exceção é marcada à mão ("Continua do órgão", com justificativa).
- Em ata de outro órgão (SENASP participante), a ata assinada é só a da SENASP e o limite é o registrado.

## Contratos

- **Vínculo automático contrato ↔ ata:** mesma compra + mesmo fornecedor (CNPJ, ou nome para estrangeiro) + cada item do contrato existe na ata, e em uma só ata provável. Os casos duvidosos vão para a fila Vínculos › Contratos à ata. O vínculo mostra quem vinculou.
- A **quantidade contratada** vem da fonte (Contratos.gov.br; se vazio, Compras.gov.br). O gestor pode ajustá-la com justificativa; a sincronização nunca apaga o ajuste e a tela mostra o valor da fonte ao lado.
- Contratado por unidade interna: cada unidade tem alocado ≥ contratado ≥ empenhado. Quando o item tem uma unidade só, a divisão é automática.

## Empenhos, faturas e pagamentos

- **Nenhuma fonte aberta diz o item da nota de empenho.** A nota é vinculada aos itens do contrato por número do item da compra (nunca pela posição):
  - automaticamente em contrato de um item só;
  - pelo valor, quando só um item explica o valor da nota;
  - pela nota no SIAFI (Portal da Transparência, itens da nota com quantidade);
  - ou à mão pelo gestor, com a soma igual ao valor da nota.
  Só nota vinculada aos itens conta como empenhado do item.
- O item da ata deriva do item do contrato; não se liga nota direto ao item da ata.
- A unidade interna da nota herda a do contrato; quando precisa ser escolhida, só com quantidade definida e só pelo gestor ou coordenador.
- **Ordem bancária de outra UG:** a nota de pagamento pode ser da outra UG (200330/200331). A OB só vale se citar a fatura; nunca casar OB da outra UG só pelo número da NP (o mesmo número pode ser documento diferente). Números de fatura só com dígitos valem com ou sem zeros à esquerda.
- NP zerada (`NP000000`, situação "Siafi Erro") não é NP válida.
- Fatura sem NP fica como "Sem como confirmar", fora do valor aguardando OB e da previsão.
- Restos a pagar ficaram para depois; o banco guarda só o valor inscrito.

## Fontes: comportamentos conhecidos

- PNCP responde 429 (limite de pedidos) com frequência: o código não insiste e guarda cache de 1 dia. Sem `tamanhoPagina`, devolve só 10 registros.
- Cada chamada a uma fonte no servidor tem prazo de 30 s; estourado, vira falha de rede e tenta de novo na próxima execução.
- O Contratos.gov.br às vezes lista empenho no contrato errado (corrigir lá).
- A API pública do Contratos.gov.br não tem consulta de atas, e a ata do PNCP não informa o fornecedor.
- Fornecedor estrangeiro aparece no PNCP com identificador `ESTRANG…`, não com CNPJ.
- O Compras.gov.br guarda só a última foto do registrado por órgão; o histórico começa quando o sistema passou a gravá-lo.

## Palavras

Uma palavra por sentido no sistema inteiro:

- **Distribuir / Distribuição** = só atas e contratos para gestores (Visão Geral › Distribuição).
- **Alocar** = quantitativo do item para as unidades internas.
- **Vincular** sempre diz a quê: ao contrato, aos itens, à unidade, à ata.
- Os códigos do banco (`A_DISTRIBUIR`, `DISTRIBUIDA`…) ficam como estão; só os rótulos seguem estas palavras.
