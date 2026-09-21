---
cssclasses: ia-nota
---

# 2026-09-20 — Modal "completar cadastro": veredito e adiamento guardados no banco, não no navegador

## Contexto

Depois do redesenho ([[2026-09-20-modal-completar-cadastro-enxuta-com-progresso|ADR anterior]]) o usuário testou no Chrome e a modal **não apareceu**. Os logs mostraram que o navegador carregou o bundle novo, fez login e buscou o perfil com sucesso, e todos os clientes do seed têm cadastro incompleto — o único fator restante era a chave `farmaura_profile_nudge_dismissed_at` que a versão antiga gravou no `localStorage` daquele Chrome (o adiamento de 14 dias, invisível e por navegador). Pedido do usuário: em vez de `localStorage`, guardar como flags no banco, incluindo as verificações, para que "resetar o navegador" volte a ser validado contra o servidor.

## Alternativas consideradas

- **Só limpar o `localStorage` daquele Chrome** — resolve o teste de hoje, não o problema: qualquer pessoa que dispensar a modal a perde por navegador/aparelho, e o cliente não tem como saber por que ela sumiu.
- **Guardar só o timestamp do "agora não" no banco e manter a checagem de campos vazios no navegador** — descartada: a checagem no navegador tinha o falso positivo conhecido (perfil ainda carregando com objeto vazio + `addresses = []`) e duplicava uma regra de negócio no cliente. O pedido incluía "as verificações", então elas também vão para o servidor.
- **Um endpoint separado `GET /customers/me/profile-nudge`** — descartada: uma chamada a mais no bootstrap e uma janela em que perfil e veredito ficam dessincronizados. O veredito viaja dentro de `GET /customers/me` (e nas respostas de `PUT /me/profile` e `PUT /me/avatar`), calculado na mesma leitura.

## Decisão

- **Coluna** `customers.profile_nudge_dismissed_at` (`timestamptz`, nula = nunca dispensou), migration `20260920_04` (aditiva, sem backfill).
- **Regra pura no domínio** (`app/domain/profile_nudge.py`, sem I/O): quais campos faltam (gênero, estado civil, filhos — `0` conta como resposta, só `NULL` é lacuna —, endereço principal) e se a modal está *devida* (falta algo **e** não há dispensa nos últimos `PROFILE_NUDGE_COOLDOWN` = 14 dias; a borda é inclusiva: aos 14 dias exatos volta). `datetime` sem fuso é lido como UTC.
- **`GET /customers/me`** passou a devolver `profile_nudge: { should_show, missing_fields[] }`, calculado por `CustomerService._build_profile_nudge` a partir do cliente e dos endereços persistidos — o navegador não decide nada.
- **`POST /customers/me/profile-nudge/dismiss`** (só cliente do marketplace, sempre a conta do próprio token, sem corpo): grava `now()` **do servidor** (relógio do cliente não influencia), idempotente, devolve o novo veredito. "Agora não", o X, Esc e o botão principal chamam o mesmo endpoint; falha de rede fecha a modal só naquela visita.
- **Frontend**: `localStorage` e a heurística local removidos de `ProfileCompletionNudge`; ela lê `profile.profileNudge`, mantém a pausa de 1,2 s só por estética (não mais para "esperar dados") e mostra as pílulas a partir de `missing_fields`.
- **Texto legal**: a Política de Privacidade (`legal-screen.jsx`, "Preferências de comunicação") passou a mencionar a data em que o cliente dispensou o convite — regra do projeto de manter o documento legal em sincronia com dado novo por cliente.

## Consequências

- **Migration obrigatória antes do deploy do backend novo** ([[../06_Pendencias/aplicar-migration-profile-nudge-em-producao|pendência]]): o modelo `Customer` passa a selecionar a coluna em toda leitura, então sem ela `GET /customers/me` (e o que lê clientes) falha.
- Resetar navegador, trocar de aparelho ou entrar em janela anônima **não** traz a modal de volta; só vence o prazo de 14 dias ou completar o cadastro a remove. Comportamento novo para quem tinha a chave antiga no `localStorage`: ela deixa de ter efeito (fica órfã, inofensiva).
- O falso positivo durante o carregamento (pendência anterior) some: o veredito só existe depois de o perfil chegar do servidor.
- **Verificado** (Postgres real, Docker local): veredito inicial, dispensa gravada, nova sessão mantém, prazo a 13d23h ainda dentro e a 14d1min vencido, isolamento entre clientes (dispensar como uma não afeta a outra), 401 sem token e 403 para funcionário; salvar perfil e avatar recalculam o veredito depois do commit (com RLS reaplicada) e completar os campos remove o aviso. Em **Chrome novo com perfil vazio**: primeira visita mostra, "Agora não" grava no banco e não deixa nenhuma chave no navegador, um Chrome novo em seguida **não** mostra, com a dispensa a 15 dias volta a mostrar (desktop e celular), e o botão principal fecha, grava a dispensa e leva ao perfil. 18 testes automatizados novos (regra pura, veredito do serviço com dublês, autorização da rota).
- **Limitação dos dados de teste**: nenhum dos 30 CPFs do seed é válido, então em contas do seed o botão principal não consegue gravar o consentimento de promoções (o `PUT /customers/me/profile` recusa com 422 "CPF inválido", erro engolido de propósito) — ver [[../06_Pendencias/cpfs-do-seed-invalidos-impedem-salvar-perfil|pendência]]. A dispensa e o redirecionamento funcionam mesmo assim.

## Ver também

- [[2026-09-20-modal-completar-cadastro-enxuta-com-progresso|Redesenho da modal]] — o visual (esta decisão não o altera).
- [[../06_Pendencias/modal-completar-cadastro-adiamento-por-navegador-e-falso-positivo|Pendência resolvida por esta decisão]]
- [[../02_Documentacao/Modulo_CRM|Modulo_CRM]]
