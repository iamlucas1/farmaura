---
name: auditoria-completa-seguranca
description: Use for a full, periodic, strictly read-only security/vulnerability/supply-chain/git-history audit of the whole Farmaura product (farmaura + farmaura-api + associated Docker/Nginx infra) — not for a scan of a single change (use prompt-varredura-vulnerabilidades for that).
---

# Auditoria Completa de Segurança — Farmaura / Farmaura API

Quero que você faça uma **auditoria COMPLETA, profunda e estritamente observacional** de segurança, vulnerabilidades, validações, autenticação, autorização, integridade de dados, concorrência, exposição indevida de informações, infraestrutura, histórico Git, supply chain e arquitetura dos sistemas abaixo.

## ESCOPO PRINCIPAL

Analise integralmente:

* Frontend: `farmaura`
* Backend/API: `farmaura-api`
* Git e todo histórico acessível dos dois repositórios
* Docker, Docker Compose, Dockerfiles e infraestrutura associada
* Reverse proxy, gateway, Nginx ou equivalentes, caso existam
* CI/CD
* GitHub Actions ou automações equivalentes
* Variáveis de ambiente e gerenciamento de segredos
* Dependências frontend e backend
* Bancos de dados, migrations, models, repositories e queries
* Filas, workers, schedulers e tarefas assíncronas
* Uploads e armazenamento de arquivos
* Integrações externas
* Integrações com IA/LLMs, caso existam
* Autenticação, sessões, JWT, cookies e tokens
* APIs internas e externas
* Webhooks
* Logs e observabilidade
* Configurações de produção, desenvolvimento e homologação
* Scripts administrativos, shell scripts e scripts de manutenção
* Arquivos ignorados ou potencialmente esquecidos
* Arquivos e configurações históricas recuperáveis pelo Git

Também analise o diretório/repositório:

`dev-obsidian`

O `dev-obsidian` será utilizado **somente para documentar os resultados da auditoria**.

---

# REGRA MAIS IMPORTANTE: NÃO TOMAR DECISÕES NEM ALTERAR O FARMAURA

Esta auditoria é **READ-ONLY / OBSERVACIONAL**.

Você NÃO está autorizado a corrigir automaticamente nenhuma vulnerabilidade.

Você NÃO deve:

* alterar arquivos do `farmaura`;
* alterar arquivos do `farmaura-api`;
* alterar configurações de infraestrutura;
* alterar Dockerfiles;
* alterar Docker Compose;
* alterar Nginx;
* alterar CI/CD;
* alterar workflows;
* alterar GitHub Actions;
* alterar variáveis de ambiente;
* alterar dependências;
* atualizar pacotes;
* remover pacotes;
* atualizar versões;
* modificar banco de dados;
* executar migrations;
* alterar migrations;
* modificar autenticação;
* alterar permissões;
* revogar tokens;
* revogar API keys;
* rotacionar secrets;
* trocar senhas;
* desativar serviços;
* bloquear usuários;
* alterar regras de firewall;
* alterar DNS;
* modificar código;
* criar commits;
* fazer push;
* abrir Pull Requests;
* fazer merge;
* alterar branches;
* reescrever histórico Git;
* apagar secrets do histórico;
* executar `git filter-repo`;
* executar BFG;
* remover arquivos do Git;
* alterar `.gitignore`;
* corrigir automaticamente qualquer vulnerabilidade;
* tomar decisões arquiteturais pelo sistema.

Mesmo que encontre uma vulnerabilidade **CRÍTICA**, apenas:

1. investigue;
2. confirme;
3. determine o impacto;
4. determine a evidência;
5. determine onde ela ocorre;
6. documente o risco;
7. documente possíveis formas de correção;
8. deixe a decisão e implementação para uma etapa futura.

Não considere a descoberta de uma vulnerabilidade como autorização para corrigi-la.

---

# DEV-OBSIDIAN — DOCUMENTAÇÃO DOS ACHADOS

Antes de criar qualquer documentação nova, analise os arquivos existentes dentro do `dev-obsidian`.

Entenda:

* estrutura das pastas;
* padrão dos documentos;
* nomes dos arquivos;
* idioma;
* profundidade técnica;
* estilo de escrita;
* títulos;
* subtítulos;
* uso de Markdown;
* frontmatter;
* tags;
* links internos;
* wikilinks;
* nomenclatura;
* organização das auditorias;
* forma de documentar riscos;
* forma de documentar código;
* forma de registrar tarefas futuras;
* forma de registrar decisões ou pendências.

Depois disso, escreva os documentos da auditoria **seguindo o mesmo padrão e estilo já utilizado no `dev-obsidian`**.

Não invente um novo padrão se já existir um padrão consolidado.

Você pode criar ou atualizar documentação dentro do `dev-obsidian` quando necessário para registrar os achados, mas **não altere código ou infraestrutura do Farmaura**.

A documentação deve permitir que posteriormente eu entre no `dev-obsidian`, veja cada risco identificado e faça as correções de maneira controlada.

---

# NÃO EXPOR SEGREDOS NA DOCUMENTAÇÃO

Caso encontre:

* API key;
* JWT signing key;
* private key;
* OAuth secret;
* database password;
* SMTP password;
* encryption key;
* webhook secret;
* access token;
* refresh token;
* session secret;
* cloud credential;
* Google credential;
* OpenAI key;
* Gemini key;
* AWS key;
* SSH key;
* certificado privado;
* token do GitHub;
* token de CI/CD;
* ou qualquer outro segredo;

NÃO copie o segredo integralmente para o relatório.

Mascare o valor.

Exemplo:

`sk-proj-ABCD...WXYZ`

Documente:

* tipo do segredo;
* arquivo;
* linha ou localização;
* commit onde apareceu;
* branch/tag quando relevante;
* data aproximada;
* se continua presente no HEAD;
* se existe somente no histórico;
* serviço ao qual aparentemente pertence;
* possível impacto;
* recomendação futura.

Nunca replique credenciais completas em arquivos do `dev-obsidian`.

---

# AUDITORIA DO HISTÓRICO GIT E SEGREDOS VAZADOS

Faça uma investigação específica e profunda do Git dos repositórios `farmaura` e `farmaura-api`.

Não analise apenas o estado atual dos arquivos.

Analise também, quando tecnicamente acessível:

* histórico de commits;
* branches;
* branches remotas;
* tags;
* commits antigos;
* arquivos deletados;
* arquivos renomeados;
* alterações de `.env`;
* alterações de arquivos de configuração;
* alterações em Docker;
* alterações de CI/CD;
* histórico de GitHub Actions;
* arquivos que tiveram secrets removidos posteriormente;
* credenciais temporariamente commitadas;
* tokens temporariamente commitados;
* arquivos `.env` removidos;
* certificados;
* private keys;
* arquivos `.pem`;
* `.p12`;
* `.pfx`;
* `.key`;
* credentials JSON;
* service accounts;
* arquivos de configuração de cloud;
* secrets em YAML;
* secrets em JSON;
* secrets em JavaScript/TypeScript;
* secrets em Python;
* secrets em Shell;
* secrets em logs;
* secrets em documentação;
* secrets em arquivos de teste;
* secrets em fixtures;
* secrets em exemplos;
* secrets em backups;
* secrets em patches;
* secrets em arquivos gerados;
* secrets em arquivos anteriormente rastreados pelo Git.

Procure padrões associados a:

* OpenAI;
* Google;
* Gemini;
* GitHub;
* AWS;
* Cloudflare;
* Stripe;
* bancos de dados;
* Redis;
* SMTP;
* OAuth;
* JWT;
* SSH;
* certificados TLS;
* storage;
* S3-compatible storage;
* serviços de observabilidade;
* APIs de terceiros;
* webhooks;
* secrets internos.

Também procure por:

* senhas hardcoded;
* connection strings;
* tokens Bearer;
* Basic Auth;
* URLs contendo usuário e senha;
* chaves criptográficas;
* salts usados de maneira inadequada;
* secrets de sessão;
* credentials de testes que possam ser reais.

Verifique se algum segredo encontrado no histórico parece ter sido posteriormente removido do código.

A remoção do segredo do HEAD **não significa que o risco deixou de existir**.

Documente a existência histórica e informe que deverá ser avaliada futuramente a necessidade de:

* rotação;
* revogação;
* invalidação;
* substituição;
* limpeza de histórico.

Mas NÃO execute essas ações.

Quando possível, utilize ferramentas de detecção de secrets de maneira somente leitura, como scanners equivalentes a:

* Gitleaks;
* TruffleHog;
* detect-secrets;

sempre sem alterar os repositórios.

Faça também análise manual para reduzir falsos negativos.

---

# 1. AUTENTICAÇÃO, SESSÃO, JWT E AUTORIZAÇÃO

Verifique toda a arquitetura de autenticação.

Analise:

* login;
* logout;
* cadastro;
* ativação;
* reset de senha;
* recuperação de conta;
* alteração de senha;
* alteração de email;
* MFA, se existir;
* refresh token;
* access token;
* cookies;
* sessões;
* OAuth;
* magic links;
* tokens temporários.

Para JWT, verifique:

* algoritmo;
* assinatura;
* chave;
* rotação;
* `issuer`;
* `audience`;
* `expiration`;
* `nbf`;
* `iat`;
* `jti`;
* validação de claims;
* tamanho;
* informações armazenadas;
* PII presente;
* permissões presentes;
* dados financeiros;
* dados sensíveis;
* dados de negócio;
* possibilidade de replay;
* token fixation;
* token leakage;
* reutilização;
* revogação;
* comportamento após logout;
* comportamento após troca de senha;
* comportamento após alteração de permissões.

Procure:

* Broken Access Control;
* IDOR/BOLA;
* autorização horizontal;
* autorização vertical;
* privilege escalation;
* tenant breakout;
* impersonação indevida;
* trust excessivo no frontend.

Toda operação sensível deve ser analisada quanto a:

* autenticação;
* autorização;
* tenant;
* ownership;
* perfil;
* papel;
* escopo;
* estado do recurso.

---

# 2. MULTI-TENANCY E ISOLAMENTO

Caso o Farmaura seja multi-tenant, investigue profundamente isolamento entre:

* empresas;
* organizações;
* usuários;
* clientes;
* farmácias;
* profissionais;
* pacientes;
* unidades;
* documentos;
* arquivos;
* dashboards;
* integrações.

Verifique consultas e mutações que deveriam possuir filtro por tenant.

Procure acesso cruzado por manipulação de:

* ID;
* UUID;
* query param;
* path param;
* body;
* header;
* cookie.

---

# 3. BOLA, BFLA, IDOR E ENUMERAÇÃO

Faça busca sistemática por:

* Broken Object Level Authorization;
* Broken Function Level Authorization;
* IDOR;
* IDs sequenciais;
* identificadores previsíveis;
* enumeração;
* UUID mal utilizado;
* endpoints administrativos acessíveis indevidamente;
* alteração manual de identificadores.

Não considere UUID substituto de autorização.

---

# 4. VALIDAÇÃO DE INPUT

Revise todos os inputs relevantes.

Analise:

* tipo;
* formato;
* tamanho;
* comprimento;
* range;
* enums;
* datas;
* timestamps;
* timezone;
* números;
* valores monetários;
* arrays;
* objetos;
* JSON;
* campos opcionais;
* campos obrigatórios;
* campos desconhecidos;
* coerção;
* normalização;
* sanitização.

Procure:

* mass assignment;
* overposting;
* prototype pollution;
* type confusion;
* integer overflow;
* truncamento;
* NaN;
* Infinity;
* negative values inesperados;
* campos adicionais silenciosamente aceitos.

O backend nunca deve depender exclusivamente da validação do frontend.

---

# 5. INJEÇÕES

Procure sistematicamente:

* SQL Injection;
* NoSQL Injection;
* command injection;
* OS command injection;
* LDAP Injection;
* XPath Injection;
* template injection;
* SSTI;
* code injection;
* expression injection;
* CRLF Injection;
* header injection;
* CSV Injection / Formula Injection;
* log injection;
* path traversal;
* SSRF;
* XXE;
* XSS refletido;
* XSS armazenado;
* DOM XSS;
* open redirect;
* unsafe deserialization.

---

# 6. SSRF

Faça análise específica de SSRF.

Procure qualquer funcionalidade que aceite:

* URLs;
* callbacks;
* webhooks;
* imagens externas;
* downloads externos;
* imports;
* previews;
* PDFs;
* fetch remoto;
* integrações;
* proxy de mídia.

Analise possibilidade de acesso a:

* localhost;
* `127.0.0.1`;
* redes privadas;
* Docker network;
* metadata endpoints;
* serviços administrativos;
* Redis;
* bancos internos;
* APIs internas.

Documente qualquer risco.

Não explore destrutivamente.

---

# 7. FRONTEND ↔ BACKEND

Compare `farmaura` com `farmaura-api`.

Não audite os projetos isoladamente.

Mapeie:

* chamadas API;
* endpoints;
* payloads;
* respostas;
* autenticação;
* headers;
* query params;
* estados;
* permissões esperadas;
* permissões efetivamente verificadas.

Identifique situações em que:

* frontend esconde recurso que API permite;
* frontend valida algo que API não valida;
* API aceita campos extras;
* UI considera recurso somente leitura mas API permite alteração;
* payload pode ser manipulado;
* IDs podem ser substituídos;
* permissões são verificadas apenas no frontend.

---

# 8. CORS, CSRF E BROWSER SECURITY

Analise:

* CORS;
* credentials;
* allowed origins;
* wildcard origins;
* CSRF;
* SameSite;
* Secure;
* HttpOnly;
* cookie Domain;
* cookie Path;
* preflight;
* CSP;
* frame ancestors;
* clickjacking;
* mixed content;
* Referrer-Policy;
* Permissions-Policy;
* X-Content-Type-Options;
* HSTS.

---

# 9. UPLOAD E ARQUIVOS

Audite:

* uploads;
* downloads;
* previews;
* imports;
* exports;
* processamento de imagens;
* PDFs;
* planilhas;
* CSV;
* ZIP;
* documentos.

Verifique:

* limite de tamanho;
* MIME real;
* extensão;
* magic bytes;
* polyglot files;
* double extension;
* SVG;
* HTML;
* executáveis;
* malware;
* zip bomb;
* decompression bomb;
* path traversal;
* filename injection;
* sobrescrita;
* colisão;
* armazenamento público;
* autorização de download;
* URLs previsíveis;
* URLs assinadas;
* TTL de URLs;
* metadados;
* EXIF;
* nomes originais contendo PII.

---

# 10. IA, LLM E PROMPT INJECTION

Caso existam integrações com ChatGPT, OpenAI, Gemini ou outros modelos, investigue:

* prompt injection direta;
* prompt injection indireta;
* documentos maliciosos;
* PDFs maliciosos;
* OCR malicioso;
* imagens contendo instruções;
* HTML;
* Markdown;
* metadados;
* conteúdo externo;
* RAG poisoning;
* context poisoning;
* tool injection;
* function calling indevido;
* exfiltração;
* vazamento de system prompt;
* vazamento cross-tenant;
* execução automática baseada em output de IA.

Diferencie claramente:

* instruções do sistema;
* contexto confiável;
* conteúdo não confiável;
* conteúdo do usuário;
* conteúdo recuperado externamente.

Verifique se outputs do LLM podem provocar ações com efeitos reais sem validação determinística apropriada.

---

# 11. BANCO DE DADOS

Analise:

* models;
* repositories;
* services;
* ORM;
* SQL raw;
* migrations;
* constraints;
* foreign keys;
* unique indexes;
* indexes;
* cascade;
* soft delete;
* transactions;
* locks;
* isolation level.

Procure:

* ausência de tenant filter;
* duplicidade;
* inconsistência;
* race condition;
* orphan records;
* update perdido;
* TOCTOU;
* dados sensíveis sem proteção;
* queries excessivamente amplas;
* exportações sem limite;
* paginação sem limite.

---

# 12. CONCORRÊNCIA, IDEMPOTÊNCIA E RACE CONDITIONS

Analise operações suscetíveis a concorrência.

Inclua:

* pagamento;
* reembolso;
* estoque;
* movimentação;
* criação;
* alteração;
* confirmação;
* cancelamento;
* agendamento;
* upload;
* importação;
* jobs;
* webhooks;
* processamento assíncrono.

Considere:

* double click;
* refresh;
* retries;
* request duplicada;
* webhook duplicado;
* worker duplicado;
* execução concorrente;
* timeout seguido de retry.

Procure:

* ausência de idempotency key;
* ausência de unique constraints;
* race conditions;
* TOCTOU;
* locks insuficientes;
* transações incompletas;
* estados impossíveis.

---

# 13. REGRAS DE NEGÓCIO

Procure vulnerabilidades de lógica de negócio.

Considere:

* alteração arbitrária de valores;
* descontos;
* preços;
* quantidades;
* status;
* roles;
* permissões;
* flags;
* transições de estado;
* ações em ordem inesperada;
* bypass de etapas;
* repetição de ações;
* execução fora da sequência esperada.

---

# 14. INFRAESTRUTURA, DOCKER E NGINX

Audite:

* Dockerfiles;
* docker-compose;
* networks;
* volumes;
* ports;
* capabilities;
* privileged containers;
* usuário root;
* host mounts;
* Docker socket;
* secrets;
* health checks;
* restart policy;
* imagens base;
* tags;
* `latest`;
* exposição desnecessária de serviços.

Se existir Nginx ou equivalente, analise:

* TLS;
* proxy_pass;
* alias;
* root;
* directory listing;
* headers;
* host header;
* request smuggling;
* path normalization;
* alias/path confusion;
* cache;
* body limits;
* timeouts;
* buffers;
* upload buffering;
* exposição de arquivos internos;
* `.git`;
* `.env`;
* backups;
* source maps;
* arquivos temporários.

---

# 15. REDE INTERNA

Não considere a rede Docker automaticamente segura.

Analise:

* serviços expostos;
* portas;
* Redis;
* bancos;
* dashboards;
* admin panels;
* workers;
* metrics;
* debug endpoints.

Verifique movimentação lateral possível após comprometimento de um serviço.

---

# 16. TLS E CRIPTOGRAFIA

Analise:

* HTTPS;
* certificados;
* TLS;
* validação de certificados;
* comunicação interna;
* criptografia em repouso;
* criptografia em trânsito;
* algoritmos;
* geração de IV/nonces;
* randomização;
* hashes;
* salts;
* derivação de chave;
* uso incorreto de criptografia customizada.

Identifique qualquer uso de criptografia "caseira".

---

# 17. RATE LIMIT, BRUTE FORCE E DoS

Procure ausência ou insuficiência de proteção em:

* login;
* cadastro;
* reset de senha;
* MFA;
* OAuth;
* endpoints públicos;
* uploads;
* exports;
* buscas;
* IA;
* webhooks;
* geração de relatórios.

Analise:

* rate limiting;
* throttling;
* payload máximo;
* paginação;
* queries caras;
* regex vulnerável a ReDoS;
* loops;
* processamento de arquivos;
* decompression bomb;
* memory exhaustion;
* CPU exhaustion;
* connection exhaustion.

---

# 18. ERROS, LOGS E OBSERVABILIDADE

Procure:

* stack traces públicos;
* SQL;
* paths;
* hostnames;
* IPs internos;
* credentials;
* tokens;
* JWT;
* Authorization headers;
* cookies;
* PII;
* dados financeiros;
* informações privadas;
* request body completo;
* response body completo.

Verifique também se logs podem ser manipulados para causar log injection.

---

# 19. SUPPLY CHAIN

Faça análise completa de cadeia de suprimentos.

Analise:

* `package.json`;
* lockfiles;
* requirements;
* Poetry;
* Pipenv;
* npm;
* yarn;
* pnpm;
* pip;
* imagens Docker;
* pacotes do sistema;
* SDKs externos;
* GitHub Actions;
* plugins;
* scripts de build;
* scripts de instalação.

Procure:

* CVEs;
* dependências abandonadas;
* versões antigas;
* typosquatting;
* dependency confusion;
* ranges abertos;
* falta de lockfile;
* integridade não verificada;
* scripts `postinstall`;
* downloads em build;
* `curl | bash`;
* imagens não pinadas;
* tags `latest`;
* Actions referenciadas apenas por tag;
* binários baixados sem hash;
* dependências Git não pinadas.

Não atualize nada.

Somente documente.

---

# 20. CI/CD E GITHUB ACTIONS

Analise workflows e pipelines.

Procure:

* secrets acessíveis indevidamente;
* pull requests de forks com acesso a secrets;
* `pull_request_target`;
* execução de código não confiável;
* permissões excessivas do `GITHUB_TOKEN`;
* actions não pinadas;
* secrets impressos em logs;
* artifacts contendo secrets;
* cache poisoning;
* script injection através de parâmetros de PR/branch/commit;
* deploy sem aprovação;
* ambientes sem proteção;
* credenciais permanentes onde OIDC seria mais apropriado.

Não altere workflows.

---

# 21. DEPENDABOT E AUTOMAÇÕES

Caso existam bots ou automações, avalie:

* permissões;
* tokens;
* auto-merge;
* atualizações automáticas;
* execução automática de scripts;
* dependências alteradas sem revisão;
* possibilidade de supply-chain attack.

---

# 22. SOURCE MAPS, BUILDS E FRONTEND SECRETS

Verifique se builds frontend expõem:

* source maps;
* variáveis de ambiente;
* URLs internas;
* endpoints administrativos;
* tokens;
* credenciais;
* chaves privadas;
* configurações internas.

Diferencie corretamente API keys públicas/client-side de secrets que jamais deveriam estar no frontend.

---

# 23. CACHE

Analise caches:

* navegador;
* CDN;
* proxy;
* Nginx;
* Redis;
* backend;
* aplicação.

Procure risco de:

* cache poisoning;
* cache key confusion;
* conteúdo privado cacheado;
* resposta de usuário A entregue ao usuário B;
* tenant não incluído na cache key;
* headers de autenticação ignorados;
* invalidação incorreta.

---

# 24. SERIALIZAÇÃO E DESERIALIZAÇÃO

Procure:

* pickle;
* YAML inseguro;
* deserialize arbitrário;
* eval;
* exec;
* dynamic imports;
* objetos reconstruídos a partir de input não confiável.

---

# 25. REGEX E ReDoS

Procure expressões regulares aplicadas a input externo que possam apresentar backtracking catastrófico.

Analise especialmente:

* validações;
* parsing;
* URLs;
* emails;
* arquivos;
* HTML;
* logs.

---

# 26. WEBHOOKS

Analise:

* assinatura;
* timestamp;
* replay;
* idempotência;
* origem;
* secrets;
* comparação constant-time;
* retries;
* duplicidade;
* payload não confiável.

---

# 27. OAUTH E INTEGRAÇÕES EXTERNAS

Se houver OAuth/OIDC, analise:

* state;
* nonce;
* PKCE;
* redirect_uri;
* issuer;
* audience;
* token validation;
* account linking;
* session fixation;
* login CSRF;
* scopes excessivos.

---

# 28. GRAPHQL, WEBSOCKET, SSE E OUTROS PROTOCOLOS

Caso existam, analise especificamente:

GraphQL:

* introspection;
* depth;
* complexity;
* authorization resolver-by-resolver;
* batching;
* alias abuse.

WebSocket:

* autenticação;
* autorização;
* origin;
* reconexão;
* rooms/channels;
* cross-tenant leakage.

SSE:

* autenticação;
* streams;
* vazamento cross-user;
* reconexão.

---

# 29. DNS REBINDING E HOST HEADER

Quando aplicável, verifique:

* Host header injection;
* trusted hosts;
* geração de URLs absolutas;
* reset password URLs;
* OAuth URLs;
* reverse proxy trust;
* `X-Forwarded-*`;
* DNS rebinding.

---

# 30. PROXY TRUST E IP SPOOFING

Verifique se a aplicação confia indevidamente em:

* `X-Forwarded-For`;
* `X-Real-IP`;
* `Forwarded`;
* headers de proxy.

Analise impacto em:

* rate limiting;
* logs;
* autenticação;
* auditoria;
* allowlists.

---

# 31. DEBUG E AMBIENTES NÃO PRODUTIVOS

Procure:

* debug ligado;
* dev server;
* Swagger público;
* OpenAPI público;
* GraphQL playground;
* profiler;
* admin debug;
* test endpoints;
* staging acessível;
* mocks;
* usuários de teste;
* credenciais default.

---

# 32. BACKUPS E ARQUIVOS ESQUECIDOS

Procure:

* `.bak`;
* `.old`;
* `.backup`;
* `.zip`;
* `.tar`;
* dumps SQL;
* backups de `.env`;
* arquivos temporários;
* swap files;
* editor backups;
* logs;
* exports.

Analise tanto HEAD quanto histórico Git.

---

# 33. DADOS SENSÍVEIS E PRIVACIDADE

Identifique onde existem:

* PII;
* dados de saúde;
* CPF;
* emails;
* telefones;
* endereços;
* informações financeiras;
* dados farmacêuticos;
* credenciais;
* dados regulatórios.

Analise:

* minimização;
* exposição;
* retenção;
* logs;
* caches;
* analytics;
* terceiros;
* backups;
* exports.

Não faça alterações.

---

# 34. RISCOS DE EXCLUSÃO E SOFT DELETE

Verifique se dados marcados como removidos continuam acessíveis através de:

* IDs diretos;
* APIs;
* buscas;
* exports;
* relações;
* arquivos;
* caches.

---

# 35. AUDITORIA DE ENDPOINTS

Tente produzir um inventário dos endpoints relevantes do `farmaura-api`.

Para cada endpoint de segurança relevante, determine:

* método;
* rota;
* autenticação;
* autorização;
* tenant;
* ownership;
* validação;
* input;
* output;
* riscos;
* frontend consumidor;
* criticidade.

Priorize endpoints sensíveis.

---

# 36. CÓDIGO DUPLICADO E DIVERGÊNCIA DE SEGURANÇA

Procure validações ou regras de segurança duplicadas em vários lugares.

Identifique cenários onde:

* endpoint A valida corretamente;
* endpoint B faz a mesma operação sem validação;
* duas implementações divergiram;
* versões antigas continuam acessíveis;
* APIs legacy possuem segurança inferior.

---

# 37. DEAD CODE E ENDPOINTS LEGACY

Procure:

* endpoints antigos;
* rotas não utilizadas;
* código comentado contendo secrets;
* APIs legacy;
* feature flags antigas;
* versões anteriores;
* funções administrativas aparentemente abandonadas.

Código não utilizado também deve ser considerado superfície de ataque se continuar acessível.

---

# 38. GERAÇÃO DE LINKS E TOKENS TEMPORÁRIOS

Analise:

* reset password;
* email verification;
* magic links;
* compartilhamentos;
* convites;
* URLs assinadas.

Verifique:

* entropia;
* expiração;
* single-use;
* replay;
* revogação;
* associação ao usuário correto.

---

# 39. DATA EXPORT E EXFILTRAÇÃO EM MASSA

Analise endpoints de:

* listagem;
* busca;
* relatórios;
* CSV;
* Excel;
* PDF;
* backup;
* exportação.

Procure ausência de:

* paginação;
* tenant;
* authorization;
* limits;
* rate limits;
* proteção contra scraping.

---

# 40. DOCUMENTAÇÃO E CONFIGURAÇÕES COMO VETOR DE VAZAMENTO

Analise também:

* README;
* docs;
* exemplos;
* Postman collections;
* Insomnia;
* `.http`;
* Swagger;
* OpenAPI;
* scripts;
* comentários;
* notebooks;
* arquivos do VS Code;
* arquivos de IDE.

Credenciais frequentemente aparecem nesses arquivos.

---

# 41. TESTES COMO INDICADORES DE SEGURANÇA

Analise os testes existentes.

Identifique:

* regras de segurança cobertas;
* regras críticas sem testes;
* autorização sem testes negativos;
* multi-tenancy sem testes de isolamento;
* concorrência sem testes;
* idempotência sem testes;
* validações sem edge cases.

Não escreva nem modifique testes nesta auditoria.

Documente as lacunas.

---

# METODOLOGIA

Não faça somente buscas superficiais por palavras-chave.

Entenda o fluxo completo.

Sempre que possível siga:

`frontend → request → gateway/proxy → middleware → autenticação → autorização → controller/route → service → repository → banco → response → frontend`

Para operações assíncronas:

`request → fila → worker → integração externa → persistência → callback → usuário`

Para cada vulnerabilidade relevante, determine a causa raiz.

Evite relatar apenas o sintoma.

---

# VALIDAÇÃO DOS ACHADOS

Não registre uma hipótese como vulnerabilidade confirmada sem verificar evidências suficientes.

Classifique os achados como:

* **CONFIRMADO**
* **PROVÁVEL**
* **POSSÍVEL**
* **INFORMATIVO**

Diferencie claramente cada categoria.

Quando não conseguir confirmar algo devido a falta de infraestrutura, credencial, ambiente ou informação, registre a limitação.

Não invente evidências.

---

# SEVERIDADE

Classifique cada risco, quando aplicável, como:

* CRÍTICO
* ALTO
* MÉDIO
* BAIXO
* INFORMATIVO

Considere:

* explorabilidade;
* impacto;
* alcance;
* exposição pública;
* necessidade de autenticação;
* necessidade de privilégio;
* impacto cross-tenant;
* impacto financeiro;
* impacto em dados sensíveis;
* impacto operacional;
* possibilidade de comprometimento total.

Quando útil, informe CVSS aproximado, mas não trate o score como verdade absoluta.

---

# FORMATO DE CADA ACHADO

Para cada vulnerabilidade ou risco documentado no `dev-obsidian`, procure incluir, seguindo o estilo existente no repositório:

**Título**

**Status**
CONFIRMADO / PROVÁVEL / POSSÍVEL / INFORMATIVO

**Severidade**
CRÍTICO / ALTO / MÉDIO / BAIXO / INFORMATIVO

**Sistema afetado**
`farmaura`, `farmaura-api`, infraestrutura ou combinação.

**Categoria**
Ex.: Broken Access Control, Secret Exposure, SSRF, Supply Chain etc.

**Localização**
Arquivo, módulo, função, endpoint, commit ou configuração.

**Descrição**

**Evidência**

**Cenário de risco**

**Impacto**

**Pré-condições**

**Escopo afetado**

**Causa raiz**

**Correção sugerida para análise futura**

**Dependências da correção**

**Riscos de regressão**

**Como validar futuramente que a correção funcionou**

**Referências**, quando aplicável.

Não implemente a correção.

---

# ACHADOS CRÍTICOS

Caso encontre algo crítico, documente imediatamente de forma destacada no `dev-obsidian`.

Porém:

**CRITICIDADE NÃO AUTORIZA ALTERAÇÃO DO SISTEMA.**

Mesmo em caso de:

* chave privada exposta;
* database password exposta;
* token administrativo;
* RCE;
* autenticação quebrada;
* acesso cross-tenant;
* SQL Injection;
* segredo em histórico Git;
* bypass de autorização;

não revogue, não delete, não altere e não corrija automaticamente.

Apenas documente claramente.

---

# CUIDADOS DURANTE A INVESTIGAÇÃO

Evite ações destrutivas.

Não faça exploração que possa:

* apagar dados;
* modificar dados;
* gerar cobranças;
* enviar emails;
* disparar mensagens;
* executar pagamentos;
* gerar reembolsos;
* cadastrar usuários reais;
* bloquear contas;
* causar indisponibilidade;
* executar DoS;
* enviar arquivos maliciosos para produção;
* disparar integrações reais;
* modificar infraestrutura.

Prefira:

* análise estática;
* leitura de código;
* leitura de configurações;
* análise de Git;
* análise de dependências;
* testes passivos;
* raciocínio sobre fluxos;
* ferramentas de análise que operem em modo somente leitura.

---

# NÃO CONFUNDIR AUSÊNCIA DE EVIDÊNCIA COM SEGURANÇA

Se não encontrar vulnerabilidade em determinado componente, não declare automaticamente que ele é seguro.

Informe apenas que:

> Nenhuma vulnerabilidade foi identificada dentro do escopo e evidências analisadas.

---

# PRIORIDADE DA AUDITORIA

Priorize especialmente riscos que possam resultar em:

1. comprometimento completo do sistema;
2. vazamento entre tenants;
3. vazamento de dados sensíveis;
4. comprometimento de contas;
5. exposição de secrets;
6. RCE;
7. SQL Injection;
8. SSRF com acesso à rede interna;
9. Broken Access Control;
10. privilege escalation;
11. comprometimento de CI/CD;
12. supply-chain attack;
13. manipulação financeira;
14. perda de integridade;
15. indisponibilidade.

---

# RELAÇÃO ENTRE OS ACHADOS

Não analise vulnerabilidades isoladamente.

Identifique cadeias de ataque possíveis.

Exemplo conceitual:

`XSS → roubo de sessão → acesso privilegiado → endpoint sem tenant validation → vazamento cross-tenant`

Ou:

`secret antigo no Git → credencial ainda válida → acesso à infraestrutura`

Ou:

`SSRF → Docker network → Redis sem autenticação → comprometimento interno`

Documente essas relações como **cadeias de risco**, mas não execute a cadeia contra ambientes reais.

---

# RESULTADO FINAL

Ao concluir a auditoria, quero que o `dev-obsidian` contenha documentação organizada e consistente com o estilo já existente, permitindo entender:

* quais riscos existem;
* onde estão;
* quais estão confirmados;
* quais são hipóteses;
* qual a severidade;
* qual o impacto;
* quais sistemas são afetados;
* quais secrets apareceram atualmente ou historicamente;
* quais riscos existem no Git;
* quais riscos existem na supply chain;
* quais riscos existem no frontend;
* quais riscos existem na API;
* quais riscos existem na infraestrutura;
* quais riscos existem nas integrações;
* quais riscos existem na arquitetura;
* como esses riscos podem ser corrigidos futuramente;
* qual seria uma forma adequada de validar a correção posteriormente.

Também produza, respeitando o estilo existente no `dev-obsidian`, uma visão consolidada que permita futuramente organizar as correções.

Entretanto, essa visão deve representar **priorização técnica de risco**, e não autorização para realizar as mudanças.

---

# REGRA FINAL

Sua função nesta execução é:

**ANALISAR → INVESTIGAR → CORRELACIONAR → CLASSIFICAR → DOCUMENTAR**

E NÃO:

**DECIDIR → CORRIGIR → ALTERAR → REVOGAR → ROTACIONAR → REMOVER → IMPLEMENTAR**

Faça uma auditoria extremamente rigorosa.

Não assuma segurança por ausência de evidência.

Não confie no frontend.

Não confie em IDs fornecidos pelo cliente.

Não confie em claims sem validação.

Não confie em rede interna.

Não confie em arquivos enviados pelo usuário.

Não confie em conteúdo enviado para IA.

Não confie em payloads de integrações externas sem validação.

Não confie que um segredo removido do HEAD nunca foi exposto.

Não confie que uma dependência é segura apenas porque é popular.

Não confie que uma proteção existente está correta sem seguir o fluxo completo no código.

**Nenhuma descoberta, independentemente da gravidade, autoriza você a tomar decisões ou realizar alterações no Farmaura ou Farmaura API. Todo resultado deve ser tratado como risco de segurança a ser documentado para correção futura através do fluxo definido no `dev-obsidian`.**
