---
cssclasses: ia-nota
---

# Política: Termos, Privacidade e Retenção de Dados devem acompanhar toda mudança real de dados/regras

**Tipo:** Política

## Descrição

As três páginas legais do marketplace (`farmaura/react/marketplace/screens/legal-screen.jsx` —
`TERMS_SECTIONS`, `PRIVACY_SECTIONS`, `RETENTION_SECTIONS`, ver
[[../00_Decisoes/2026-09-14-telas-de-termos-privacidade-e-retencao-de-dados|ADR de origem]]) foram
escritas a partir do comportamento real do produto, não de boilerplate — descrevem exatamente quais
dados são coletados, por quê, com quem são compartilhados e por quanto tempo são retidos.

**Sempre que uma mudança no produto tornar qualquer uma dessas três páginas desatualizada ou
factualmente incorreta, a mudança de código correspondente deve incluir a atualização da(s)
seção(ões) afetada(s) no mesmo trabalho — não como um débito técnico à parte.** Isso vale tanto
para quem está implementando a mudança de produto quanto para qualquer sessão de IA que a
implemente: checar este arquivo faz parte do trabalho, não é uma etapa opcional posterior.

### O que dispara uma atualização obrigatória

- **Novo campo de dado pessoal coletado** (cadastro, perfil, endereço, preferência) — mexe em
  `PRIVACY_SECTIONS` (`dados-coletados`) e, se afetar por quanto tempo o dado é guardado, também em
  `RETENTION_SECTIONS` (`prazos`).
- **Novo tratamento ou finalidade para um dado já coletado** (ex: um dado hoje usado só para
  entrega passa a alimentar recomendação/analytics) — `PRIVACY_SECTIONS` (`por-que`).
- **Novo terceiro que passa a receber dado pessoal** (novo provedor de pagamento, analytics, IA,
  logística, e-mail) — `PRIVACY_SECTIONS` (`compartilhamento`), listando o provedor e exatamente o
  que ele recebe, no mesmo padrão dos 4 já documentados (Asaas, Nominatim/OSM, Google Analytics,
  transportadora).
- **Mudança em regra de negócio que os Termos descrevem**: forma de pagamento aceita, prazo/regra
  de cancelamento e arrependimento, prazo de emissão fiscal, regra de validação de receita,
  mecânica de cashback/assinatura, política de senha/2FA/bloqueio de conta — `TERMS_SECTIONS`.
- **Mudança em capacidade real de exercício de direito do titular** — por exemplo, se um botão de
  autoexclusão/exportação de dados for implementado (hoje é 100% manual via WhatsApp/chat):
  atualizar `PRIVACY_SECTIONS` (`seus-direitos`) e `RETENTION_SECTIONS` (`como-pedir`), removendo a
  ressalva "ainda não existe autoatendimento" quando deixar de ser verdade.
- **Nova base legal ou mudança de retenção** (ex: mudança no prazo de guarda fiscal, nova exigência
  regulatória) — `RETENTION_SECTIONS`.

### O que **não** dispara isso

- Identidade jurídica da empresa (razão social, CNPJ, inscrição estadual, endereço) — já é lida
  dinamicamente de `portalData.marketplace`/`portalData.stores` via `LegalEntityBlock`
  (`resolveMarketplaceMeta`/`resolveStoreMeta`); preencher esses campos no console interno não
  exige nenhuma mudança neste arquivo.
- Mudanças puramente visuais (`LegalDocShell`, CSS) sem alteração de conteúdo.

## Motivo

Estas páginas existem justamente para não fabricar informação legal — foram escritas descrevendo a
realidade do produto (ver ADR de origem). Deixá-las desatualizadas depois de uma mudança real de
dados é o mesmo erro por omissão: a página continua parecendo precisa, mas passa a descrever um
produto que não existe mais. Para dado de saúde (receita médica) e dado sob LGPD isso não é só um
problema de UX, é risco de compliance — e o marketplace está em produção com pagamento e dado
sensível reais.

## Exceções conhecidas

Nenhuma até o momento. Ver
[[../06_Pendencias/revisao-juridica-termos-privacidade-retencao|pendência de revisão jurídica]] —
esta política reduz o risco de o texto ficar desatualizado, mas não substitui a revisão por um
advogado.

## Atualizações

- 2026-09-14: nota criada, a pedido do usuário, junto com a extensão visual do cabeçalho das três
  páginas (ver ADR de origem, seção Atualizações).