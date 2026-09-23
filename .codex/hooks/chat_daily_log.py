#!/usr/bin/env python3
"""Stop hook: reconstrói dois logs diários a partir do transcript inteiro da
sessão — dev-obsidian/_Logs_Chat/ (conversa em texto) e
dev-obsidian/_Logs_Execucao/ (comandos rodados, saída deles e arquivos
editados, sem o conteúdo do código — isso já fica rastreável pelo git). Mesmo
formato usado pelo Claude Code (ver .claude/hooks/chat_daily_log.py). Cada
chat aberto (sessão) grava no seu próprio arquivo em cada pasta, identificado
por projeto + sufixo curto do session_id.

Reconstrói do zero (não faz append incremental com cursor): o Stop pode
disparar mais de uma vez para o mesmo turno lógico, e um cursor incremental
perde ou fragmenta conteúdo quando isso acontece. Ver dev-obsidian/CLAUDE.md.
"""
import base64
import difflib
import html
import json
import mimetypes
import re
import subprocess
import sys
import time
import datetime
import glob
from pathlib import Path


def truncate_output(text: str, limit: int = 1500) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + f"\n… (saída truncada, {len(text)} caracteres no total)"


def make_diff(old_text: str, new_text: str, limit: int = 2500) -> str:
    """Diff estilo git (unified diff) entre a versão antiga e a nova de um
    arquivo. Vazio se não houver diferença real."""
    old_lines = old_text.splitlines()
    new_lines = new_text.splitlines()
    diff_lines = list(difflib.unified_diff(old_lines, new_lines, lineterm="", n=2))
    if not diff_lines:
        return ""
    return truncate_output("\n".join(diff_lines), limit)


def render_diff_html(diff_text: str) -> str:
    """Renderiza o unified diff como HTML próprio (não um bloco ```diff)
    pra poder colorir com certeza via CSS — não depende de qual realce de
    sintaxe o Obsidian aplica (ou não) a blocos de código "diff"."""
    lines = diff_text.split("\n")
    out = ['<pre class="chat-diff">']
    for line in lines:
        esc = html.escape(line) if line else "&nbsp;"
        if line.startswith("+++") or line.startswith("---"):
            cls = "diff-file"
        elif line.startswith("+"):
            cls = "diff-add"
        elif line.startswith("-"):
            cls = "diff-del"
        elif line.startswith("@@"):
            cls = "diff-hunk"
        else:
            cls = "diff-ctx"
        out.append(f'<span class="{cls}">{esc}</span>')
    out.append("</pre>")
    return "\n".join(out)


def fence_wrap(text: str) -> str:
    """Bloco de código markdown com crases suficientes pra não quebrar
    quando o próprio conteúdo já tem ``` dentro (ex: comando que fez `cat`
    de um arquivo .md com blocos de código — muito comum nesta pasta)."""
    longest = 0
    run = 0
    for ch in text:
        if ch == "`":
            run += 1
            longest = max(longest, run)
        else:
            run = 0
    fence = "`" * max(3, longest + 1)
    return f"{fence}\n{text}\n{fence}"


def get_git_snapshot(cwd: str) -> str:
    """Estado do git no momento em que este log foi escrito (não histórico
    por turno — é sempre o estado atual do repositório no disco)."""
    if not cwd:
        return ""
    try:
        branch = subprocess.run(
            ["git", "-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, timeout=5,
        ).stdout.strip()
        commit = subprocess.run(
            ["git", "-C", cwd, "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, timeout=5,
        ).stdout.strip()
        if not branch or not commit:
            return ""
        dirty = subprocess.run(
            ["git", "-C", cwd, "status", "--porcelain"],
            capture_output=True, text=True, timeout=5,
        ).stdout
        dirty_count = len([l for l in dirty.splitlines() if l.strip()])
        note = f" (árvore com {dirty_count} arquivo(s) não commitado(s))" if dirty_count else " (árvore limpa)"
        return f"`{branch}` @ `{commit}`{note}"
    except Exception:
        return ""


def extract_command_str(cmd) -> str:
    """O campo `command` de CommandExecution costuma vir como argv, ex:
    ["/usr/bin/zsh", "-lc", "comando real aqui"] — o comando real é o
    último elemento (o `-lc` manda o shell rodar essa string)."""
    if isinstance(cmd, list) and cmd:
        last = cmd[-1]
        return last if isinstance(last, str) else " ".join(str(c) for c in cmd)
    if isinstance(cmd, str):
        return cmd
    return ""

# Agrupa os diretórios reais do repositório em "famílias" de projeto pra
# nomear os arquivos de log — mesma tabela usada pelo hook do Claude Code
# (ver .claude/hooks/chat_daily_log.py), farmaura-api e docker são infra do
# mesmo produto que farmaura/, lumos-api é o backend do mesmo produto que
# lumosmed/. `dirs` é usado como sinal de cwd; `keywords` (case-insensitive,
# substring) é usado pra detectar por argumento de /contexto ou por assunto
# da conversa. Termos genéricos demais (ex: "gateway" sozinho, que também
# aparece falando de gateway de pagamento) ficam de fora de propósito pra
# não dar falso positivo.
PROJECT_FAMILIES = {
    "farmaura": {
        "dirs": {"farmaura", "farmaura-api", "docker"},
        "keywords": [
            "farmaura", "farmaura-api", "marketplace", "pdv", "farmacêutico",
            "farmaceutico", "prescriç", "prescric", "sefaz", "nfc-e", "nfce",
            "receituário", "receituario",
        ],
    },
    "lumosmed": {
        "dirs": {"lumosmed", "lumos-api"},
        "keywords": [
            "lumosmed", "lumos-api", "lumos_api", "lumos med", "clínica",
            "clinica", "prontuário", "prontuario", "lumosmed:",
        ],
    },
    "gateway": {
        "dirs": {"lumos-gateway"},
        "keywords": [
            "lumos-gateway", "lumos_gateway", "nginx", "certbot", "fail2ban",
            "geoip",
        ],
    },
    "dev-obsidian": {
        "dirs": {"dev-obsidian"},
        "keywords": ["dev-obsidian", "vault do obsidian", "cofre obsidian"],
    },
}

FILE_OP_CLASS = {
    "criado": "exec-file-op-create",
    "editado": "exec-file-op-update",
    "removido": "exec-file-op-delete",
}


def turn_heading(turn_idx: int, dt: datetime.datetime) -> str:
    """Título de turno usado nos dois logs (chat e execução) — mesmo texto
    nos dois arquivos, pra servir de âncora de link entre eles. Inclui a
    data (não só a hora): a numeração de turno é global pra sessão inteira
    (ver `days` em main()), então uma sessão que atravessa a meia-noite tem
    turnos de dias diferentes nos dois lados, e "HH:MM" sozinho não dava
    pra saber quando cada um rodou de fato."""
    return f"Turno {turn_idx} · {dt.strftime('%Y-%m-%d %H:%M')}"

EXT_OVERRIDES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "application/pdf": "pdf",
}

DATA_URI_RE = re.compile(r"^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$", re.DOTALL)


def guess_ext(media_type: str) -> str:
    if media_type in EXT_OVERRIDES:
        return EXT_OVERRIDES[media_type]
    guessed = mimetypes.guess_extension(media_type or "")
    return guessed.lstrip(".") if guessed else "bin"


def parse_data_uri(uri: str):
    m = DATA_URI_RE.match(uri)
    if not m:
        return None
    media_type, b64data = m.group(1), m.group(2)
    try:
        return media_type, base64.b64decode(b64data)
    except Exception:
        return None


TEXT_BLOCK_TYPES = {"text", "input_text", "output_text"}


def extract_item_text(item: dict) -> str:
    parts = []
    for block in item.get("content", []) or []:
        if isinstance(block, dict) and str(block.get("type", "")).lower() in TEXT_BLOCK_TYPES:
            t = block.get("text", "")
            if t:
                parts.append(t)
    return "\n\n".join(parts).strip()


def extract_item_attachments(item: dict) -> list:
    """Extrai anexos embutidos (imagem, PDF, etc.) de um item UserMessage.

    O formato exato varia entre versões do Codex CLI: versões antigas usam um
    campo `images` com data-URIs; versões atuais podem trazer blocos de
    conteúdo com `image_url` (data-URI) ou `source` (base64 estilo Anthropic).
    Tenta todas as formas conhecidas — na pior hipótese, não extrai nada, sem
    quebrar o log.
    """
    attachments = []
    for uri in item.get("images", []) or []:
        if isinstance(uri, str):
            parsed = parse_data_uri(uri)
            if parsed:
                attachments.append(parsed)
    for block in item.get("content", []) or []:
        if not isinstance(block, dict):
            continue
        btype = str(block.get("type", "")).lower()
        if "image" not in btype and "document" not in btype and "file" not in btype:
            continue
        uri = block.get("image_url") or block.get("url")
        if isinstance(uri, str) and uri.startswith("data:"):
            parsed = parse_data_uri(uri)
            if parsed:
                attachments.append(parsed)
            continue
        source = block.get("source")
        if isinstance(source, dict) and source.get("data"):
            media_type = source.get("media_type", "application/octet-stream")
            try:
                attachments.append((media_type, base64.b64decode(source["data"])))
            except Exception:
                pass
    return attachments


def family_from_text(text: str, min_hits: int = 1):
    """Conta ocorrências das keywords de cada família em `text` e devolve a
    família com mais acertos, se bater o mínimo exigido. `min_hits` mais
    alto pra varredura de assunto da conversa (evita 1 menção solta virando
    classificação) e mínimo de 1 pra argumento explícito de /contexto (ali
    a intenção já é explícita, uma menção basta)."""
    lowered = text.lower()
    best_family = None
    best_count = 0
    for family, spec in PROJECT_FAMILIES.items():
        count = sum(lowered.count(kw) for kw in spec["keywords"])
        if count > best_count:
            best_count = count
            best_family = family
    return best_family if best_count >= min_hits else None


# Diferente do Claude Code (que expande slash commands em
# <command-name>/contexto</command-name><command-args>...</command-args>),
# o Codex CLI grava o texto exatamente como o usuário digitou — então o
# comando aparece como texto puro "/contexto <args>" no início da mensagem.
CONTEXTO_RE = re.compile(r"^/contexto\b(.*)", re.IGNORECASE | re.DOTALL)


def find_first_contexto_args(entries: list):
    """Acha a primeira invocação de `/contexto` na sessão e devolve o texto
    dos args (pode ser ""). None se a skill nunca foi chamada nesta sessão."""
    for entry in entries:
        if entry.get("type") != "event_msg":
            continue
        payload = entry.get("payload", {})
        if payload.get("type") != "item_completed":
            continue
        item = payload.get("item", {})
        if item.get("type") != "UserMessage":
            continue
        m = CONTEXTO_RE.match(extract_item_text(item).strip())
        if m:
            return m.group(1).strip()
    return None


def family_from_cwd(cwd: str, repo_root: Path):
    try:
        rel = Path(cwd).resolve().relative_to(repo_root)
    except ValueError:
        return None
    first = rel.parts[0] if rel.parts else ""
    if not first or first == ".":
        return None
    for family, spec in PROJECT_FAMILIES.items():
        if first in spec["dirs"]:
            return family
    return None


def detect_project_family(entries: list, cwd: str, repo_root: Path) -> str:
    """Nome de projeto usado no arquivo de log (farmaura/lumosmed/gateway/
    dev-obsidian/dev) — mesma ordem de prioridade do hook do Claude Code
    (ver .claude/hooks/chat_daily_log.py):

    1. Argumento passado a `/contexto` no início da sessão — sinal mais
       explícito, o usuário disse com que projeto vai trabalhar.
    2. Assunto da conversa — contagem de palavras-chave de cada projeto no
       texto real trocado entre usuário e agente (UserMessage/AgentMessage).
    3. Diretório onde a sessão foi aberta, se cair dentro de uma pasta de
       projeto conhecida.

    Cai em "dev" se nenhum sinal for conclusivo."""
    contexto_args = find_first_contexto_args(entries)
    if contexto_args:
        family = family_from_text(contexto_args, min_hits=1)
        if family:
            return family

    conversation_text_parts = []
    for entry in entries:
        if entry.get("type") != "event_msg":
            continue
        payload = entry.get("payload", {})
        if payload.get("type") != "item_completed":
            continue
        item = payload.get("item", {})
        if item.get("type") not in ("UserMessage", "AgentMessage"):
            continue
        text = extract_item_text(item)
        if text:
            conversation_text_parts.append(text)
    family = family_from_text("\n".join(conversation_text_parts), min_hits=2)
    if family:
        return family

    return family_from_cwd(cwd, repo_root) or "dev"


def find_transcript(transcript_path: str, session_id: str) -> str:
    if transcript_path and Path(transcript_path).is_file():
        return transcript_path
    if not session_id:
        return ""
    home = Path.home() / ".codex"
    for base in ("sessions", "archived_sessions"):
        matches = glob.glob(str(home / base / "**" / f"rollout-*-{session_id}.jsonl"), recursive=True)
        if matches:
            return matches[0]
    return ""


def parse_timestamp(ts: str) -> datetime.datetime:
    try:
        return datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone()
    except Exception:
        return datetime.datetime.now().astimezone()


def read_stable_lines(path: Path, max_wait: float = 1.5, interval: float = 0.15) -> list:
    """Lê o transcript só depois que seu tamanho parar de crescer.

    O hook Stop dispara quase no mesmo instante em que a última mensagem é
    gravada; sem essa espera, é possível ler o arquivo alguns milissegundos
    antes do último flush em disco e perder a resposta final do turno.
    """
    last_size = -1
    waited = 0.0
    while waited < max_wait:
        size = path.stat().st_size
        if size == last_size:
            break
        last_size = size
        time.sleep(interval)
        waited += interval
    with open(path, "r", encoding="utf-8") as f:
        return f.readlines()


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except Exception:
        print("{}")
        return 0

    if data.get("stop_hook_active"):
        print("{}")
        return 0

    session_id = data.get("session_id") or "local"
    transcript_path = find_transcript(data.get("transcript_path"), session_id)

    repo_root = Path(__file__).resolve().parents[2]
    vault_dir = repo_root / "dev-obsidian"

    if not transcript_path or not vault_dir.is_dir():
        print("{}")
        return 0

    lines = read_stable_lines(Path(transcript_path))

    entries = []
    for raw in lines:
        raw = raw.strip()
        if not raw:
            continue
        try:
            entries.append(json.loads(raw))
        except Exception:
            continue

    if not entries:
        print("{}")
        return 0

    # cwd de origem da sessão (session_meta), não o cwd corrente — mantém um
    # único arquivo por sessão mesmo se o diretório de trabalho mudar.
    session_cwd = ""
    for entry in entries:
        if entry.get("type") == "session_meta":
            session_cwd = entry.get("payload", {}).get("cwd", "") or ""
            break

    turns = []  # (timestamp, user_text, assistant_text, attachments, actions)
    pending_user = None
    pending_ts = None
    pending_attachments = []
    pending_actions = []
    assistant_chunks = []
    known_content = {}  # caminho -> último conteúdo visto nesta sessão, pra gerar diff

    for entry in entries:
        if entry.get("type") != "event_msg":
            continue
        payload = entry.get("payload", {})
        if payload.get("type") != "item_completed":
            continue
        item = payload.get("item", {})
        item_type = item.get("type")

        if item_type == "UserMessage":
            if pending_user is not None:
                turns.append((pending_ts, pending_user, "\n\n".join(assistant_chunks).strip(), pending_attachments, pending_actions))
            pending_user = extract_item_text(item)
            pending_ts = entry.get("timestamp")
            pending_attachments = extract_item_attachments(item)
            pending_actions = []
            assistant_chunks = []
        elif item_type == "AgentMessage":
            text = extract_item_text(item)
            if text:
                assistant_chunks.append(text)
        elif item_type == "CommandExecution":
            pending_actions.append({
                "kind": "bash",
                "command": extract_command_str(item.get("command")),
                "description": "",
                "output": item.get("stdout", "") or "",
                "is_error": item.get("status") == "failed",
            })
        elif item_type == "FileChange":
            for path, change in (item.get("changes") or {}).items():
                change_type = change.get("type", "update") if isinstance(change, dict) else "update"
                label = {"add": "criado", "delete": "removido"}.get(change_type, "editado")
                new_content = change.get("content", "") if isinstance(change, dict) else ""
                diff_text = ""
                if label == "criado":
                    diff_text = make_diff("", new_content)
                elif label == "editado" and path in known_content:
                    diff_text = make_diff(known_content[path], new_content)
                if label == "removido":
                    known_content.pop(path, None)
                elif new_content:
                    known_content[path] = new_content
                pending_actions.append({"kind": "file", "path": path, "label": label, "diff": diff_text})

    if pending_user is not None:
        turns.append((pending_ts, pending_user, "\n\n".join(assistant_chunks).strip(), pending_attachments, pending_actions))

    turns = [(ts, u, a, att, ac) for ts, u, a, att, ac in turns if u or a or att or ac]
    if not turns:
        print("{}")
        return 0

    slug = detect_project_family(entries, session_cwd, repo_root)
    suffix = session_id[:8] if session_id else "local"
    git_snapshot = get_git_snapshot(session_cwd)

    # Numeração de turno é global pra sessão inteira (posição real na
    # conversa), não reinicia por dia — "Turno 15" continua sendo o mesmo
    # turno 15 mesmo se cair no arquivo do dia seguinte. Cada Stop
    # reconstrói o transcript inteiro do zero, e agora agrupa os turnos por
    # data de fato (não só a do primeiro turno): se a sessão atravessa a
    # meia-noite, os turnos de cada dia caem no arquivo diário
    # correspondente, e não ficam todos empilhados no arquivo do dia em que
    # a sessão começou.
    days = {}
    for turn_idx, (ts, user_text, assistant_text, attachments, actions) in enumerate(turns, start=1):
        dt = parse_timestamp(ts) if ts else datetime.datetime.now().astimezone()
        day = dt.date().isoformat()
        days.setdefault(day, []).append((turn_idx, dt, user_text, assistant_text, attachments, actions))

    for day, day_turns in days.items():
        day_dir = vault_dir / "_Logs_Chat" / day
        exec_day_dir = vault_dir / "_Logs_Execucao" / day
        exec_file_stem = f"_Logs_Execucao/{day}/codex-{slug}-{suffix}"
        chat_file_stem = f"_Logs_Chat/{day}/codex-{slug}-{suffix}"

        any_action = any(actions for *_rest, actions in day_turns)

        lines_out = ["---", "cssclasses: ia-nota chat-log", "---", "", f"# Chat {slug} (Codex CLI) — {day} ({session_id})", ""]
        lines_out.append(f"- Diretório: `{session_cwd}`")
        lines_out.append(f"- Sessão: `{session_id}`")
        if any_action:
            lines_out.append(f"- Log de execução: [[{exec_file_stem}|abrir]]")
        lines_out.append("")

        attachments_dir = day_dir / "attachments"
        for turn_idx, dt, user_text, assistant_text, attachments, actions in day_turns:
            heading = turn_heading(turn_idx, dt)
            lines_out.append(f"## {heading}")
            if actions:
                lines_out.append(f'<span class="log-crosslink">🔧 [[{exec_file_stem}#{heading}|ver execução deste turno]]</span>')
            lines_out.append("")
            if user_text:
                lines_out.append(f'<span class="chat-role chat-role-user">Você</span>\n\n{user_text}')
            else:
                lines_out.append(
                    '<span class="chat-role chat-role-user">Você</span> '
                    '<span class="chat-empty">(sem texto — turno automático/sistema)</span>'
                )
            if attachments:
                attachments_dir.mkdir(parents=True, exist_ok=True)
                lines_out.append("")
                for att_idx, (media_type, raw) in enumerate(attachments, start=1):
                    ext = guess_ext(media_type)
                    fname = f"codex-{slug}-{suffix}-{turn_idx}-{att_idx}.{ext}"
                    (attachments_dir / fname).write_bytes(raw)
                    rel = f"attachments/{fname}"
                    if media_type.startswith("image/"):
                        lines_out.append(f"![imagem anexada]({rel})")
                    else:
                        lines_out.append(f"[arquivo anexado ({media_type})]({rel})")
            lines_out.append("")
            if assistant_text:
                lines_out.append(f'<span class="chat-role chat-role-ai">Codex</span>\n\n{assistant_text}')
                lines_out.append("")
            lines_out.append("---")
            lines_out.append("")

        day_dir.mkdir(parents=True, exist_ok=True)
        log_file = day_dir / f"codex-{slug}-{suffix}.md"
        log_file.write_text("\n".join(lines_out), encoding="utf-8")

        # Fluxo de execução: comandos rodados (com saída) e arquivos
        # editados, sem o conteúdo do código — o git já rastreia isso pelo
        # diff.
        exec_lines = ["---", "cssclasses: ia-nota exec-log", "---", "", f"# Execução {slug} (Codex CLI) — {day} ({session_id})", ""]
        exec_lines.append(f"- Diretório: `{session_cwd}`")
        exec_lines.append(f"- Sessão: `{session_id}`")
        exec_lines.append(f"- Log de chat: [[{chat_file_stem}|abrir]]")
        if git_snapshot:
            exec_lines.append(f"- Git (na última atualização deste log): {git_snapshot}")
        exec_lines.append("")

        for turn_idx, dt, _user_text, _assistant_text, _attachments, actions in day_turns:
            if not actions:
                continue
            heading = turn_heading(turn_idx, dt)
            exec_lines.append(f"## {heading}")
            exec_lines.append(f'<span class="log-crosslink">💬 [[{chat_file_stem}#{heading}|ver conversa deste turno]]</span>')
            exec_lines.append("")
            commands = [a for a in actions if a["kind"] == "bash"]
            files = [a for a in actions if a["kind"] == "file"]
            if commands:
                exec_lines.append('<span class="exec-section">Comandos</span>')
                exec_lines.append("")
                for cmd in commands:
                    if cmd["description"]:
                        exec_lines.append(f"_{cmd['description']}_")
                    exec_lines.append(fence_wrap(f"$ {cmd['command']}"))
                    if cmd["output"]:
                        tag = ' <span class="exec-fail">falhou</span>' if cmd["is_error"] else ""
                        exec_lines.append(f"Saída:{tag}")
                        exec_lines.append(fence_wrap(truncate_output(cmd['output'])))
                    elif cmd["is_error"]:
                        exec_lines.append('Saída: <span class="exec-fail">falhou, sem conteúdo capturado</span>')
                    exec_lines.append("")
            if files:
                exec_lines.append('<span class="exec-section">Arquivos</span>')
                exec_lines.append("")
                for f in files:
                    cls = FILE_OP_CLASS.get(f["label"], "exec-file-op-update")
                    exec_lines.append(f'- `{f["path"]}` — <span class="exec-file-op {cls}">{f["label"]}</span>')
                exec_lines.append("")
                for f in files:
                    if f.get("diff"):
                        exec_lines.append(f'`{f["path"]}`:')
                        exec_lines.append("")
                        exec_lines.append(render_diff_html(f["diff"]))
                        exec_lines.append("")
                    elif f["label"] == "editado":
                        exec_lines.append(f'`{f["path"]}`: _(conteúdo anterior não capturado nesta sessão — sem diff)_')
                        exec_lines.append("")
            exec_lines.append("---")
            exec_lines.append("")

        if any_action:
            exec_day_dir.mkdir(parents=True, exist_ok=True)
            exec_file = exec_day_dir / f"codex-{slug}-{suffix}.md"
            exec_file.write_text("\n".join(exec_lines), encoding="utf-8")

    print("{}")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
