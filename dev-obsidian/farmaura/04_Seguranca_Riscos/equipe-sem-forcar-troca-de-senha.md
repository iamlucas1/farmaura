# Criação de conta de equipe (Team) sem convite/e-mail e sem forçar troca de senha

**Tipo:** Risco identificado
**Severidade:** Média
**Status:** Aberto
**Data de identificação:** 2026-07-25

## Descrição

`POST /team/members` (`team_service.py`, admin-only) cria um novo usuário interno com a senha informada **diretamente pelo admin no corpo do request**, em texto claro até o backend fazer o hash — sem qualquer fluxo de convite por e-mail, sem senha temporária e sem `must_change_password=True`. O próprio frontend (`team-screen.jsx`) já assume isso explicitamente: "Informe a senha ao funcionário por fora — não existe envio automático de e-mail."

Isso diverge do fluxo de primeiro acesso do cliente PDV (`PortalService.request_marketplace_first_access`), que gera senha temporária de 12 caracteres e força `must_change_password=True` no próximo login. Também não existe endpoint de "reset de senha por admin" nem forma de marcar `must_change_password=True` num membro já existente — se um admin quiser forçar a troca depois, não há como pelo produto.

Achado durante o levantamento para [[../02_Documentacao/Modulo_Auth|Modulo_Auth]] e [[../02_Documentacao/Modulo_Lojas_Fornecedores_Equipe|Modulo_Lojas_Fornecedores_Equipe]].

## Impacto

- A senha definitiva do funcionário passa por um canal fora do sistema (verbal, mensagem, etc.), sem controle de que foi entregue com segurança.
- Sem `must_change_password`, o funcionário pode continuar usando indefinidamente uma senha escolhida por terceiro (o admin), nunca trocando por vontade própria — prática de higiene de credenciais abaixo do padrão já adotado no resto do sistema (ver [[../00_Decisoes/2026-07-20-politica-de-senha-forte|política de senha forte]], que cobre a força da senha mas não esse fluxo de entrega).
- Não há como um admin revogar/forçar reset de uma credencial comprometida de outro membro da equipe sem desativar a conta inteira.

## Mitigação / Tratamento

Nenhuma ainda. Tratamento natural: alinhar o fluxo de criação de equipe ao já existente para clientes — gerar senha temporária + `must_change_password=True` (ou enviar convite por e-mail com link de definição de senha), e adicionar um endpoint `POST /team/members/{id}/force-password-reset` para o caso de credencial comprometida.

## Referências

`farmaura-api/app/services/team_service.py` (`create_member`), `farmaura-api/app/services/portal_service.py` (`request_marketplace_first_access`, fluxo equivalente já implementado para clientes), `farmaura/react/internal/screens/team-screen.jsx`.

## Ver também

- [[../00_Decisoes/2026-07-20-politica-de-senha-forte|Política de senha forte]] — cobre força da senha, não este fluxo de entrega.

## Atualizações

- 2026-07-25: nota criada, a partir do levantamento feito para documentar os módulos Auth e Lojas/Fornecedores/Equipe.
