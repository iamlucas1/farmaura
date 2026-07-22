---
name: prompt-varredura-vulnerabilidades
description: Use when performing a security review of a completed change involving authentication, payments, uploads, tenant data, or abuse-sensitive behavior.
---

# Security Vulnerability Scan

Perform a security scan of the current change or feature: <describe>.

1. Read and apply `dev-obsidian/_Compartilhado/Skills/project-test-orientation/SKILL.md` to identify the correct local testing target.
2. Read and apply `dev-obsidian/_Compartilhado/Skills/security-vulnerability-testing/SKILL.md`.
3. Respect `dev-obsidian/_Compartilhado/Padroes_Politicas/padrao-ataques-defesas-e-limites-de-teste.md`: test only the projects local Docker environment, never public domains or production; never expose real secrets; never scan outside the project network; treat `lumos-gateway` as sensitive.
4. Record every confirmed finding in `<project>/04_Seguranca_Riscos/` with severity and status.
5. Report the tested surface, passing controls, failures, registered findings, and coverage limits.
