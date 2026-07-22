# Varredura de vulnerabilidades numa feature/PR

**Arquivo operacional:** `dev-obsidian/_Compartilhado/Prompts/prompt-varredura-vulnerabilidades/PROMPT.md`
## Quando usar

Antes de dar como concluída uma mudança que toca autenticação, pagamento, upload de arquivo ou dado sensível de tenant — como uma varredura de segurança final antes do merge.

## Prompt

```
Faça uma varredura de segurança na mudança atual (diff/feature: <descrever>).

1. Use a skill project-test-orientation para identificar qual stack subir e em qual porta/container testar — não adivinhe.
2. Use a skill security-vulnerability-testing para cobrir SQL injection, XSS, CSRF, race condition, resistência a brute force/DDoS/spam e drift de supply chain nas rotas/telas tocadas por esta mudança.
3. Respeite os limites seguros de teste (padrao-ataques-defesas-e-limites-de-teste, _Compartilhado/Padroes_Politicas/): só ambiente Docker local do próprio projeto, nunca domínio público/produção, nunca vazar segredo real, nunca varrer porta fora da rede do projeto, cuidado redobrado com lumos-gateway.
4. Para cada achado confirmado, registre em <projeto>/04_Seguranca_Riscos/ com severidade e status, em vez de só reportar em texto.
5. Ao final, resuma: o que foi testado, o que passou, o que falhou e o que ficou como achado registrado.
```

## Atualizações
- 2026-07-20: prompt operacional movido para o diretório correspondente neste cofre; esta nota permanece destinada à leitura humana.

- 2026-07-20: nota criada.
