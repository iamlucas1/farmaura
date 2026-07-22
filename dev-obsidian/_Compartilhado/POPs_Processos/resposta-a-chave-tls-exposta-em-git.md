# POP: resposta a chave privada TLS exposta no histórico git

**Fonte real:** `lumos-gateway/RUNBOOK-TLS-ROTATION.md` — runbook escrito para um incidente real já ocorrido nesse repositório (ver achado em [[../../lumosmed/04_Seguranca_Riscos/chaves-privadas-tls-expostas-no-historico-git|chaves-privadas-tls-expostas-no-historico-git]]). Generalizado aqui para qualquer repositório deste ecossistema que precise do mesmo procedimento.

## Quando usar

Sempre que uma chave privada TLS (`.pem`/`.key`), chave de conta ACME, ou qualquer segredo de assinatura for encontrado commitado em um repositório git — mesmo que já tenha sido removido em um commit posterior (remoção de arquivo **não** remove o conteúdo do histórico).

## Passos

1. **Revogar imediatamente** os certificados associados às chaves expostas junto à CA (Let's Encrypt: `certbot revoke --cert-path ... --reason keyCompromise --non-interactive`, um domínio por vez).
2. **Emitir certificados novos** para os domínios afetados.
3. **Limpar o histórico do git** — remoção de arquivo em um novo commit não basta, a chave continua recuperável via `git show <hash-antigo>:<caminho>`. Usar `git-filter-repo` ou BFG Repo Cleaner para reescrever o histórico e remover os blobs, depois `push --force` no remoto. Todos os colaboradores precisam clonar de novo após a limpeza.
4. **Rotacionar segredos derivados** — se a chave exposta também foi usada para mTLS ou para assinar tokens internos (ex: o par RSA usado por autenticação interna serviço-a-serviço, ver skill [[secure-service-communication]] e a ADR [[../../lumosmed/00_Decisoes/2026-03-27-autenticacao-interna-rs256-assinada|autenticacao-interna-rs256-assinada]]), gerar um par novo e atualizar onde a chave pública é consumida antes de destruir a chave privada exposta.
5. **Confirmar `.gitignore`** — garantir que `*.pem`, `*.key`, `*.crt`, `*.p12` e a pasta de certificados estão ignorados, e que certificados só vivem em volume externo/secret manager, nunca no repositório.
6. **Verificação de regressão** — grep no repositório e nos arquivos de compose/nginx por referências a caminho de certificado dentro do próprio repo (deve haver só referência ao volume montado, nunca a um caminho versionado).

## Responsável

Quem identificar o achado deve escalar imediatamente — revogação (passo 1) é urgente e não deve esperar planejamento, o resto do procedimento pode ser sequenciado logo em seguida.

## Risco se pulado

Chave privada TLS comprometida permite decifrar tráfego capturado ou personificar o domínio (man-in-the-middle) enquanto o certificado antigo continuar válido — a revogação e a limpeza do histórico remoto são as duas únicas mitigações reais; deixar o arquivo só "removido" no HEAD atual não protege nada.

## Atualizações

- 2026-07-19: nota criada.
