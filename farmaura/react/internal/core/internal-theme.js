/* FARMAURA Console — tema de cor (claro / escuro / automático).
   O CSS (internal.css) decide o tema pelo atributo data-theme na raiz do documento:
   "light" e "dark" forçam um tema; sem o atributo, vale a preferência do sistema
   operacional (prefers-color-scheme). A escolha de cada pessoa é gravada na conta
   dela no servidor (users.ui_theme) — este módulo só aplica o valor no DOM. */

const THEME_OPTIONS = [
  { key: "auto", label: "Automático" },
  { key: "light", label: "Claro" },
  { key: "dark", label: "Escuro" },
];

const THEME_KEYS = THEME_OPTIONS.map((option) => option.key);

function applyInternalTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") {
    root.setAttribute("data-theme", theme);
  } else {
    root.removeAttribute("data-theme");
  }
}

export { THEME_KEYS, THEME_OPTIONS, applyInternalTheme };
