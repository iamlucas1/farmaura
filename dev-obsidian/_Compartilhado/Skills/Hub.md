# Hub: Skills

Não é uma chave de projeto — não é código de produto de ninguém. Esta é a biblioteca canônica de skills que codificam requisitos de segurança e qualidade para todas as stacks (`farmaura`, `farmaura-api`, `lumos-api`, `lumosmed`), não só para uma. Está em `_Compartilhado/` porque, por definição, já é conteúdo transversal — e é candidata natural a ser copiada para outros repositórios que precisem do mesmo baseline (ver [[../README|_Compartilhado/README]] para as demais subpastas: Agentes, Prompts, Padrões/Políticas, POPs/Processos).

## Como ler e executar uma skill

Cada skill possui dois artefatos no mesmo diretório:

- `<skill-name>.md`: nota em português para leitura humana, navegação e contexto específico deste repositório;
- `<skill-name>/SKILL.md`: definição operacional completa, em formato próprio para agentes. É a fonte de verdade e deve ser lida integralmente antes da execução do trabalho aplicável.

`agent.md` e `claude.md` exigem que agentes identifiquem, leiam e apliquem as skills pertinentes antes de implementar, refatorar, revisar ou testar código. A nota humana complementa a orientação, mas não substitui o `SKILL.md`.

## Skills disponíveis

Skills não são leitura de fundo — devem ser invocadas e aplicadas ativamente ao escrever código em qualquer stack, não só em `farmaura-api/`.

- [[secure-api-endpoint]] — validação estrita de input, ownership, escopo de tenant, limites de abuso, idempotência e minimização de resposta em endpoints FastAPI.
- [[secure-auth-rbac-jwt]] — autenticação, JWT/refresh, RBAC, ownership, isolamento de tenant, fluxos sensíveis a CSRF, hashing de senha, política de senha forte, rate limit por IP e bloqueio exponencial por conta no login.
- [[secure-file-upload]] — upload/download, OCR, processamento de imagem/documento: validação de MIME, magic bytes, quota, path safety, autorização, limites de exaustão de recurso.
- [[secure-python-backend]] — fundação de backend Python (FastAPI) já em conformidade com o baseline de segurança do repositório.
- [[secure-service-communication]] — chamadas de rede entre stacks do repositório (farmaura ↔ farmaura-api, lumosmed ↔ lumos-api, qualquer serviço ↔ `lumos-gateway`): transporte seguro, CORS, transporte/armazenamento de token, CSRF, assinatura de request serviço-a-serviço. Tem uma implementação de referência real no repositório — ver a nota da skill.
- [[security-vulnerability-testing]] — testar/auditar código já escrito contra SQLi, XSS, CSRF, race condition, brute force/DDoS/spam e drift de supply chain. Skill de *testar*, não de escrever — complementa as cinco acima.
- [[qa-functional-review]] — passada de QA funcional: botão sem ação, função duplicada, estado de loading/vazio/erro ausente, rota órfã.
- [[project-test-orientation]] — orientação de qual stack/porta/container testar; usada pelas duas skills de teste acima para não adivinhar o alvo.

Cada skill tem sua própria nota humana, com contexto e referências de aplicação no código deste repositório, e a definição operacional completa em seu respectivo diretório `SKILL.md`.

## Atualizações

- 2026-07-20: definições operacionais `SKILL.md` passaram a viver nesta biblioteca; as notas `.md` permanecem para leitura humana.

## Navegação

- Decisão de arquitetura/produto que envolveu uma skill específica: registrar no projeto correspondente (`../../farmaura/00_Decisoes/`, `../../lumosmed/00_Decisoes/`), não aqui.
- Achado de segurança relacionado à aplicação de uma skill num projeto específico: registrar em `<projeto>/04_Seguranca_Riscos/` desse projeto.
- Skill nova, genérica o suficiente para qualquer repositório futuro (não específica deste): adicionar aqui mesmo, em `_Compartilhado/Skills/`, criando tanto a nota humana quanto o diretório com o `SKILL.md` executável.
