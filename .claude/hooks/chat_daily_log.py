#!/usr/bin/env python3
"""Stop hook: reconstrói dois logs diários a partir do transcript inteiro da
sessão, a cada vez que dispara — dev-obsidian/_Logs_Chat/ (conversa em texto)
e dev-obsidian/_Logs_Execucao/ (comandos rodados, saída deles e arquivos
editados, sem o conteúdo do código — isso já fica rastreável pelo git). Cada
chat aberto (sessão) grava no seu próprio arquivo em cada pasta, identificado
por projeto + sufixo curto do session_id, para não misturar conversas
concorrentes.

Reconstrói do zero (não faz append incremental com cursor): o Stop pode
disparar mais de uma vez para o mesmo turno lógico (ex: skills longas,
aprovações de ferramenta no meio do caminho), e um cursor incremental perde
ou fragmenta conteúdo quando isso acontece. Reprocessar o transcript inteiro
é barato (poucos milhares de linhas) e sempre produz o resultado correto,
não importa quantas vezes o hook rodou. Ver dev-obsidian/CLAUDE.md.
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
from pathlib import Path

TRACKED_FILE_TOOLS = {"Read", "Edit", "Write", "NotebookEdit"}

READ_LINE_NUMBER_RE = re.compile(r"^\s*\d+\t")


def fence_wrap(text: str, lang: str = "") -> str:
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
    return f"{fence}{lang}\n{text}\n{fence}"


def strip_read_line_numbers(text: str) -> str:
    """A tool Read devolve o conteúdo com `N\\t` no início de cada linha
    (estilo `cat -n`) — precisa tirar isso pra usar como base de diff."""
    return "\n".join(READ_LINE_NUMBER_RE.sub("", line) for line in text.split("\n"))


def make_diff(old_text: str, new_text: str, limit: int = 2500) -> str:
    """Diff estilo git (unified diff) entre a versão antiga e a nova de um
    arquivo/trecho. Vazio se não houver diferença real (ex: Edit que só
    mudou espaçamento e o difflib não achou nada pra mostrar)."""
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


FILE_OP_CLASS = {
    "leitura": "exec-file-op-read",
    "criado": "exec-file-op-create",
    "sobrescrito": "exec-file-op-update",
    "editado": "exec-file-op-update",
    "notebook editado": "exec-file-op-update",
}


def turn_heading(turn_idx: int, dt: datetime.datetime) -> str:
    """Título de turno usado nos dois logs (chat e execução) — mesmo texto
    nos dois arquivos, pra servir de âncora de link entre eles."""
    return f"Turno {turn_idx} · {dt.strftime('%H:%M')}"


def truncate_output(text: str, limit: int = 1500) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + f"\n… (saída truncada, {len(text)} caracteres no total)"


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

EXT_OVERRIDES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "application/pdf": "pdf",
}


def guess_ext(media_type: str) -> str:
    if media_type in EXT_OVERRIDES:
        return EXT_OVERRIDES[media_type]
    guessed = mimetypes.guess_extension(media_type or "")
    return guessed.lstrip(".") if guessed else "bin"

# Tags de sistema injetadas nas mensagens (contexto de ambiente, memória,
# seleção do IDE, etc.) que não fazem parte do que o usuário de fato digitou
# ou do que o Claude de fato respondeu — removidas do log.
NOISE_TAGS = [
    "system-reminder",
    "ide_selection",
    "ide_opened_file",
    "ide_diagnostics",
    "ide_terminal_selection",
    "user-prompt-submit-hook",
    "command-message",
    "command-name",
    "command-args",
    "command-contents",
    "local-command-stdout",
    "local-command-stderr",
]
NOISE_RE = [re.compile(rf"<{tag}>.*?</{tag}>", re.DOTALL) for tag in NOISE_TAGS]

# Slash command (ex: "/contexto farmaura"): o texto real digitado vira só
# <command-name>/contexto</command-name><command-args>farmaura</command-args>
# — sem isso, strip_noise() apagava as tags de comando e não sobrava nada,
# aparecendo como "sem texto" no log.
COMMAND_NAME_RE = re.compile(r"<command-name>(.*?)</command-name>", re.DOTALL)
COMMAND_ARGS_RE = re.compile(r"<command-args>(.*?)</command-args>", re.DOTALL)


def extract_command_invocation(text: str) -> str:
    if not isinstance(text, str):
        return ""
    name_m = COMMAND_NAME_RE.search(text)
    if not name_m:
        return ""
    name = name_m.group(1).strip()
    args_m = COMMAND_ARGS_RE.search(text)
    args = args_m.group(1).strip() if args_m else ""
    return f"{name} {args}".strip()

KNOWN_PROJECT_DIRS = {
    "farmaura",
    "farmaura-api",
    "docker",
    "lumos-gateway",
    "lumosmed",
    "lumos-api",
    "dev-obsidian",
}


def strip_noise(text: str) -> str:
    for pattern in NOISE_RE:
        text = pattern.sub("", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def format_user_text(raw_text: str) -> str:
    """Limpa o texto de ruído de sistema e, se for a ativação de um slash
    command (skill, prompt, etc.), mostra ele como um badge em vez de
    deixar sumir (as tags de comando são removidas por strip_noise)."""
    command = extract_command_invocation(raw_text)
    stripped = strip_noise(raw_text)
    if command:
        badge = f'<span class="chat-command">⚡ {command}</span>'
        return f"{badge}\n\n{stripped}".strip() if stripped else badge
    return stripped


def extract_text(content) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                t = block.get("text", "")
                if t:
                    parts.append(t)
        return "\n\n".join(parts).strip()
    return ""


def extract_attachments(content) -> list:
    """Extrai anexos embutidos (imagem, PDF, etc.) de uma mensagem do usuário.

    Blocos do tipo "image" ou "document" no formato de mensagens da Anthropic
    trazem os bytes em base64 diretamente em source.data — não é um link,
    é o arquivo inteiro dentro do transcript.
    """
    attachments = []
    if not isinstance(content, list):
        return attachments
    for block in content:
        if not isinstance(block, dict):
            continue
        if str(block.get("type", "")).lower() not in ("image", "document"):
            continue
        source = block.get("source")
        if not isinstance(source, dict) or not source.get("data"):
            continue
        media_type = source.get("media_type", "application/octet-stream")
        try:
            raw = base64.b64decode(source["data"])
        except Exception:
            continue
        attachments.append((media_type, raw))
    return attachments


def build_tool_results(entries: list) -> dict:
    """Mapeia tool_use_id -> dict com o resultado da ferramenta, pra casar
    cada chamada (Bash, Read, Edit, Write, ...) com o resultado dela (vêm em
    entradas separadas do transcript). `result_type` vem de `toolUseResult`
    — é o que diferencia, por exemplo, um Write que criou um arquivo novo
    (`"create"`) de um que sobrescreveu um existente (`"update"`)."""
    results = {}
    for entry in entries:
        if entry.get("type") != "user":
            continue
        content = entry.get("message", {}).get("content")
        if not isinstance(content, list):
            continue
        tool_use_result = entry.get("toolUseResult")
        for block in content:
            if not (isinstance(block, dict) and block.get("type") == "tool_result"):
                continue
            tid = block.get("tool_use_id")
            if not tid:
                continue
            out = block.get("content")
            if isinstance(out, list):
                out = extract_text(out)
            elif not isinstance(out, str):
                out = ""
            info = {"text": out, "is_error": bool(block.get("is_error"))}
            if isinstance(tool_use_result, dict):
                info["result_type"] = tool_use_result.get("type")
                info["stdout"] = tool_use_result.get("stdout")
                info["stderr"] = tool_use_result.get("stderr")
            results[tid] = info
    return results


def is_real_user_message(entry: dict) -> bool:
    if entry.get("type") != "user" or entry.get("isMeta"):
        return False
    content = entry.get("message", {}).get("content")
    if isinstance(content, str):
        return bool(content.strip())
    if isinstance(content, list):
        if any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content):
            return False
        return bool(extract_text(content))
    return False


def chat_slug(cwd: str, repo_root: Path) -> str:
    try:
        rel = Path(cwd).resolve().relative_to(repo_root)
        first = rel.parts[0] if rel.parts else ""
    except ValueError:
        first = ""
    if first in KNOWN_PROJECT_DIRS:
        return first
    if not first or first == ".":
        return "dev"
    slug = re.sub(r"[^a-z0-9]+", "-", first.lower()).strip("-")
    return slug or "dev"


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
        return 0

    if data.get("stop_hook_active"):
        return 0

    transcript_path = data.get("transcript_path")
    session_id = data.get("session_id") or "local"

    if not transcript_path or not Path(transcript_path).is_file():
        return 0

    repo_root = Path(__file__).resolve().parents[2]
    vault_dir = repo_root / "dev-obsidian"
    if not vault_dir.is_dir():
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
        return 0

    # cwd de origem da sessão, não o cwd corrente (que pode mudar por `cd`
    # dentro de comandos Bash ao longo da conversa) — mantém um único
    # arquivo por sessão mesmo se o diretório de trabalho mudar no meio.
    session_cwd = ""
    for entry in entries:
        if entry.get("cwd"):
            session_cwd = entry["cwd"]
            break

    tool_results = build_tool_results(entries)
    known_content = {}  # caminho -> último conteúdo visto nesta sessão (Read/Write/Edit), pra gerar diff

    turns = []  # (timestamp, user_text, assistant_text, attachments, actions)
    pending_user = None
    pending_ts = None
    pending_attachments = []
    pending_actions = []
    assistant_chunks = []

    for entry in entries:
        if is_real_user_message(entry):
            if pending_user is not None:
                turns.append((pending_ts, pending_user, "\n\n".join(assistant_chunks).strip(), pending_attachments, pending_actions))
            content = entry.get("message", {}).get("content")
            pending_user = format_user_text(extract_text(content))
            pending_ts = entry.get("timestamp")
            pending_attachments = extract_attachments(content)
            pending_actions = []
            assistant_chunks = []
        elif entry.get("type") == "assistant":
            msg_content = entry.get("message", {}).get("content")
            text = extract_text(msg_content)
            if text:
                assistant_chunks.append(strip_noise(text))
            if isinstance(msg_content, list):
                for block in msg_content:
                    if not (isinstance(block, dict) and block.get("type") == "tool_use"):
                        continue
                    name = block.get("name")
                    inp = block.get("input", {}) or {}
                    info = tool_results.get(block.get("id"), {})
                    if name == "Bash":
                        output = info.get("stdout") or info.get("text") or ""
                        stderr = info.get("stderr") or ""
                        if stderr and stderr not in output:
                            output = f"{output}\n{stderr}".strip() if output else stderr
                        pending_actions.append({
                            "kind": "bash",
                            "command": inp.get("command", ""),
                            "description": inp.get("description", ""),
                            "output": output,
                            "is_error": info.get("is_error", False),
                        })
                    elif name in TRACKED_FILE_TOOLS:
                        path = inp.get("file_path") or inp.get("notebook_path") or ""
                        if not path:
                            continue
                        diff_text = ""
                        if name == "Read":
                            label = "leitura"
                            read_result = info.get("text", "")
                            if read_result:
                                known_content[path] = strip_read_line_numbers(read_result)
                        elif name == "Write":
                            new_content = inp.get("content", "")
                            is_new = info.get("result_type") == "create"
                            label = "criado" if is_new else "sobrescrito"
                            if is_new:
                                diff_text = make_diff("", new_content)
                            elif path in known_content:
                                diff_text = make_diff(known_content[path], new_content)
                            known_content[path] = new_content
                        elif name == "Edit":
                            label = "editado"
                            old_s = inp.get("old_string", "")
                            new_s = inp.get("new_string", "")
                            diff_text = make_diff(old_s, new_s)
                            if path in known_content and old_s and old_s in known_content[path]:
                                count = -1 if inp.get("replace_all") else 1
                                known_content[path] = known_content[path].replace(old_s, new_s, count)
                        else:  # NotebookEdit
                            label = "notebook editado"
                            diff_text = make_diff(inp.get("old_string", ""), inp.get("new_source", ""))
                        pending_actions.append({"kind": "file", "path": path, "label": label, "diff": diff_text})
        elif entry.get("type") == "attachment" and entry.get("attachment", {}).get("type") == "queued_command":
            # Mensagem que o usuário mandou enquanto o turno atual ainda
            # estava em andamento e que o Claude Code absorveu no mesmo
            # turno (não vira uma entrada "user" própria) — sem isso, essas
            # instruções extras somem do log por completo.
            prompt = entry["attachment"].get("prompt")
            extra_text = format_user_text(extract_text(prompt))
            extra_attachments = extract_attachments(prompt)
            if pending_user is not None:
                if extra_text:
                    pending_user = (
                        f'{pending_user}\n\n<span class="chat-midturn-note">↳ mensagem enviada '
                        f'enquanto eu ainda respondia</span>\n\n{extra_text}'
                    )
                pending_attachments = pending_attachments + extra_attachments
            elif extra_text or extra_attachments:
                pending_user = extra_text
                pending_ts = entry.get("timestamp")
                pending_attachments = extra_attachments

    if pending_user is not None:
        turns.append((pending_ts, pending_user, "\n\n".join(assistant_chunks).strip(), pending_attachments, pending_actions))

    turns = [(ts, u, a, att, ac) for ts, u, a, att, ac in turns if u or a or att or ac]
    if not turns:
        return 0

    first_dt = parse_timestamp(turns[0][0]) if turns[0][0] else datetime.datetime.now().astimezone()
    day = first_dt.date().isoformat()
    slug = chat_slug(session_cwd, repo_root)
    suffix = session_id[:8] if session_id else "local"

    day_dir = vault_dir / "_Logs_Chat" / day
    day_dir.mkdir(parents=True, exist_ok=True)
    log_file = day_dir / f"claude-{slug}-{suffix}.md"
    exec_file_stem = f"_Logs_Execucao/{day}/claude-{slug}-{suffix}"
    chat_file_stem = f"_Logs_Chat/{day}/claude-{slug}-{suffix}"

    any_action = any(ac for *_rest, ac in turns)

    lines_out = ["---", "cssclasses: ia-nota chat-log", "---", "", f"# Chat {slug} (Claude Code) — {day} ({session_id})", ""]
    lines_out.append(f"- Diretório: `{session_cwd}`")
    lines_out.append(f"- Sessão: `{session_id}`")
    if any_action:
        lines_out.append(f"- Log de execução: [[{exec_file_stem}|abrir]]")
    lines_out.append("")

    attachments_dir = day_dir / "attachments"
    for turn_idx, (ts, user_text, assistant_text, attachments, actions) in enumerate(turns, start=1):
        dt = parse_timestamp(ts) if ts else datetime.datetime.now().astimezone()
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
                fname = f"claude-{slug}-{suffix}-{turn_idx}-{att_idx}.{ext}"
                (attachments_dir / fname).write_bytes(raw)
                rel = f"attachments/{fname}"
                if media_type.startswith("image/"):
                    lines_out.append(f"![imagem anexada]({rel})")
                else:
                    lines_out.append(f"[arquivo anexado ({media_type})]({rel})")
        lines_out.append("")
        if assistant_text:
            lines_out.append(f'<span class="chat-role chat-role-ai">Claude</span>\n\n{assistant_text}')
            lines_out.append("")
        lines_out.append("---")
        lines_out.append("")

    log_file.write_text("\n".join(lines_out), encoding="utf-8")

    # Fluxo de execução: comandos rodados (com saída) e arquivos editados,
    # sem o conteúdo do código — o git já rastreia isso pelo diff.
    exec_day_dir = vault_dir / "_Logs_Execucao" / day
    exec_lines = ["---", "cssclasses: ia-nota exec-log", "---", "", f"# Execução {slug} (Claude Code) — {day} ({session_id})", ""]
    exec_lines.append(f"- Diretório: `{session_cwd}`")
    exec_lines.append(f"- Sessão: `{session_id}`")
    exec_lines.append(f"- Log de chat: [[{chat_file_stem}|abrir]]")
    git_snapshot = get_git_snapshot(session_cwd)
    if git_snapshot:
        exec_lines.append(f"- Git (na última atualização deste log): {git_snapshot}")
    exec_lines.append("")

    for turn_idx, (ts, user_text, _assistant_text, _attachments, actions) in enumerate(turns, start=1):
        if not actions:
            continue
        dt = parse_timestamp(ts) if ts else datetime.datetime.now().astimezone()
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
                elif f["label"] == "sobrescrito":
                    exec_lines.append(f'`{f["path"]}`: _(conteúdo anterior não capturado nesta sessão — sem diff)_')
                    exec_lines.append("")
        exec_lines.append("---")
        exec_lines.append("")

    if any_action:
        exec_day_dir.mkdir(parents=True, exist_ok=True)
        exec_file = exec_day_dir / f"claude-{slug}-{suffix}.md"
        exec_file.write_text("\n".join(exec_lines), encoding="utf-8")

    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
