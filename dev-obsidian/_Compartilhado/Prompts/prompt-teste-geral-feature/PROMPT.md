---
name: prompt-teste-geral-feature
description: Use when verifying a new feature end to end before reporting it complete.
---

# End-to-End Feature Test

Test the current feature end to end: <describe>.

1. Read and apply `dev-obsidian/_Compartilhado/Skills/project-test-orientation/SKILL.md` to identify every relevant stack, container, port, and health endpoint.
2. Start the required stacks and exercise the happy path plus at least one relevant edge case through a real browser session or HTTP request; do not rely only on source-code reading.
3. For UI work, also read and apply `dev-obsidian/_Compartilhado/Skills/qa-functional-review/SKILL.md`.
4. For authentication, payment, upload, or sensitive-data work, also read and apply `dev-obsidian/_Compartilhado/Skills/security-vulnerability-testing/SKILL.md` and comply with the safe-testing policy.
5. Run the projects normal verification checks, including relevant build, test, and lint commands.
6. Report what was actually exercised, the result of each check, unresolved findings, and coverage limits.
