#!/usr/bin/env python3
"""PreToolUse: keep agents out of the canon files above their clearance.

Telling agents to stop reading at Layer 1 failed three times in work order 037,
so this refuses the read. Agents use docs/canon/slices/ instead.

Who is barred from what:
  docs/canon/reveals.md, docs/canon/locked.md   everyone
  docs/gdd.md                                   everyone but the draftsman
  docs/canon/characters.md                      every named agent but the
                                                scrivener, whose work orders
                                                attach it; a call with no
                                                agent name is left alone there
Claude Code names the agent; a call it cannot place counts as no agent.

How a call is caught:
  1. Naming a barred file, in any letter case, quoted or escaped.
  2. A wildcard, or a $variable, that could expand to a barred file, including
     after a cd in the same command, and a copy elsewhere ending canon/<file>.
  3. A search that walks into a barred file: grep -r, rg, ag, ack, git grep,
     find -exec, and the Grep tool. Name the folders to search, or exclude
     docs (grep --exclude-dir='docs', quoted, since an unquoted docs at the end
     of a grep -r is refused outright; rg -g '!docs'; git grep ... -- ':!docs').
  4. A listing of a folder holding a barred file, fed to xargs, a loop or $().

It reads the command, never the files, so a script or program that opens a
file without naming it in the command is not caught; nor is a path built at
run time, nor a file copied or archived elsewhere and read under another name.
If it cannot judge a call (bad input, a pattern it cannot parse, more than
eight seconds), it refuses with exit 2 rather than crash, since a crash may be
read as allow.
Tests: scripts/validate/hook_cases.json, run by scripts/validate/run.py.
"""
import fnmatch
import glob as globmod
import json
import os
import re
import shlex
import signal
import sys

GDD = re.compile(r"(?<![\w-])gdd\.md\b", re.IGNORECASE)
SEALED = re.compile(r"(?<![\w-])(reveals|locked)\.md\b", re.IGNORECASE)
CAST = re.compile(r"(?<![\w-])characters\.md\b", re.IGNORECASE)
# A recursive search of docs/ reaches the same files without naming them.
SWEEP = re.compile(r"\b(rg|grep\s+(-\w+\s+)*-\w*[rR]\w*)\s[^|;&]*\bdocs(/canon)?/?(\s|$)")

REPO = os.path.normpath(os.environ.get("CLAUDE_PROJECT_DIR") or os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
MAGIC = re.compile(r"[*?\[{]")
VARIABLE = re.compile(r"\$$|\$\{[^}]*\}|\$\([^)]*\)?|\$[A-Za-z_][A-Za-z_0-9]*|\$[0-9@*#?$!-]|`[^`]*`?|\$[^/]*")
SEPARATOR = set(";&|()")
WRAPPERS = {"sudo", "env", "command", "builtin", "exec", "nice", "nohup", "time",
            "timeout", "stdbuf", "xargs", "parallel", "caffeinate"}
GREPS = {"grep", "egrep", "fgrep", "zgrep", "ggrep", "ugrep"}
WALKERS = {"ag", "ack", "ack-grep", "pt", "sift"}
LOOPS = {"xargs", "parallel", "while", "for", "read", "until"}
MARKDOWN_TYPES = {"md", "markdown", "all"}
SEARCH_HELP = (" Name the folders to search, or exclude docs: grep -r ... --exclude-dir='docs',"
               " rg -g '!docs', git grep ... -- ':!docs'.")


def refuse(why):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": why + " Use docs/canon/slices/reveals-layer1.md and the other slices; docs/canon/slices/gdd-cleared.md once Jeremy has checked it.",
    }}))
    sys.exit(0)


def barred(agent):
    """Paths under a docs/ folder that this agent may not reach."""
    rels = ["canon/reveals.md", "canon/locked.md"]
    if agent != "draftsman":
        rels.append("gdd.md")
    if agent not in (None, "", "scrivener"):
        rels.append("canon/characters.md")
    return rels


def protected(agent):
    """Absolute, lower-cased paths of the barred files, here and in worktrees."""
    docs = [os.path.join(REPO, "docs")]
    docs += sorted(globmod.glob(os.path.join(REPO, ".claude", "worktrees", "*", "docs")))
    return [os.path.join(d, r).lower() for d in docs for r in barred(agent)]


def glob_re(pattern):
    """Shell or ripgrep glob to a regex: * and ? stay inside one folder, ** does not."""
    out, depth, i, n = [], 0, 0, len(pattern)
    while i < n:
        c = pattern[i]
        if c == "*":
            if pattern[i:i + 2] == "**":
                out.append(".*")
                i += 2
                continue
            out.append("[^/]*")
        elif c == "?":
            out.append("[^/]")
        elif c == "[":
            j = pattern.find("]", i + 2)
            if j == -1:
                out.append(re.escape(c))
            else:
                body = pattern[i + 1:j]
                if body[:1] in ("!", "^"):
                    body = "^" + body[1:]
                cls = "[" + body.replace("\\", "\\\\") + "]"
                try:
                    re.compile(cls)
                except re.error:
                    cls = "[^/]"  # unreadable class: any one character
                out.append(cls)
                i = j + 1
                continue
        elif c == "{":
            out.append("(?:")
            depth += 1
        elif c == "," and depth:
            out.append("|")
        elif c == "}" and depth:
            out.append(")")
            depth -= 1
        else:
            out.append(re.escape(c))
        i += 1
    out.append(")" * depth)
    try:
        return re.compile("".join(out), re.S)
    except re.error:
        return re.compile(".*", re.S)  # unreadable pattern: matches anything


def wild(token):
    """A token with each $variable or `command` read as a wildcard."""
    return VARIABLE.sub("*", token)


def resolve(path, cwd):
    path = os.path.expanduser(path)
    if not os.path.isabs(path):
        path = os.path.join(cwd, path)
    return os.path.normpath(path).lower()


def ancestors(path):
    while True:
        yield path
        parent = os.path.dirname(path)
        if parent == path:
            return
        path = parent


def covered(root, prot):
    """(barred file, the folder or file of it that root matches) for each file root reaches."""
    rx = glob_re(root)
    hits = []
    for target in prot:
        for place in ancestors(target):
            if rx.fullmatch(place):
                hits.append((target, place))
                break
    return hits


def token_reaches(token, cwd, prot, agent):
    """True if a wildcard token could expand to a barred file."""
    token = wild(token)
    if not MAGIC.search(token):
        return False
    rx = glob_re(resolve(token, cwd))
    if any(rx.fullmatch(target) for target in prot):
        return True
    # A copy elsewhere, or a worktree: match the tail, canon/<file> or docs/gdd.md.
    parts = token.lower().rstrip("/").split("/")
    tails = []
    for rel in barred(agent):
        names = ("docs/" + rel).split("/")
        tails += ["/".join(names[-k:]) for k in range(2, len(names) + 1)]
    for k in range(2, len(parts) + 1):
        tail_rx = glob_re("/".join(parts[-k:]))
        if any(tail_rx.fullmatch(t) for t in tails):
            return True
    return False


def lex(command):
    command = command.replace("\\\n", " ").replace("\n", " ; ")
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars=True)
        lexer.whitespace_split = True
        return list(lexer)
    except ValueError:
        return command.split()


def segments(tokens):
    """Simple commands, with redirections dropped."""
    out, current, skip = [], [], False
    for i, tok in enumerate(tokens):
        if skip:
            skip = False
            continue
        if tok and set(tok) <= set("();<>|&") and ("<" in tok or ">" in tok):
            skip = not tok.endswith("&") or tok in ("&>", "&>>")
            if current and current[-1].isdigit():
                current.pop()
            continue
        if tok and set(tok) <= SEPARATOR:
            if current:
                out.append(current)
            current = []
            continue
        current.append(tok)
    if current:
        out.append(current)
    return out


def unwrap(words):
    """Drop VAR=value prefixes and wrappers such as sudo, env, timeout, xargs."""
    words = list(words)
    piped = False
    while words:
        head = os.path.basename(words[0].lstrip("`$("))
        if re.match(r"^[A-Za-z_][A-Za-z_0-9]*=", words[0]):
            words.pop(0)
            continue
        if head not in WRAPPERS:
            break
        piped = piped or head in ("xargs", "parallel")
        words.pop(0)
        valued = {"sudo": "ugCDhpTr", "nice": "n", "timeout": "sk", "stdbuf": "ioe",
                  "xargs": "IiLlnPsdEa", "env": "uSC", "caffeinate": "tw"}.get(head, "")
        while words and (words[0].startswith("-") or "=" in words[0].split("/")[0]):
            flag = words.pop(0)
            if len(flag) == 2 and flag[1] in valued and words:
                words.pop(0)
        if head == "timeout" and words:
            words.pop(0)
    if words:
        words[0] = os.path.basename(words[0].lstrip("`$("))
    return words, piped


def parse(args, short_valued, long_valued):
    """(options as (name, value), positionals before --, positionals after --)."""
    opts, before, after = [], [], []
    i, done = 0, False
    while i < len(args):
        a = args[i]
        i += 1
        if done:
            after.append(a)
        elif a == "--":
            done = True
        elif a.startswith("--"):
            name, eq, value = a[2:].partition("=")
            if not eq and name in long_valued and i < len(args):
                value = args[i]
                i += 1
            opts.append((name, value))
        elif a.startswith("-") and len(a) > 1:
            j = 1
            while j < len(a):
                ch = a[j]
                if ch in short_valued:
                    value = a[j + 1:]
                    if not value and i < len(args):
                        value = args[i]
                        i += 1
                    opts.append((ch, value))
                    break
                opts.append((ch, ""))
                j += 1
        else:
            before.append(a)
    return opts, before, after


def rg_match(rel, pattern):
    """gitignore-style: a glob without / matches any one name on the path."""
    pattern = pattern.lower()
    anchored = pattern.startswith("/")
    pattern = pattern.strip("/")
    parts = rel.split("/")
    rx = glob_re(pattern)
    if "/" not in pattern and not anchored:
        return any(rx.fullmatch(p) for p in parts)
    prefixes = ["/".join(parts[:k]) for k in range(1, len(parts) + 1)]
    return any(rx.fullmatch(p) for p in prefixes)


def rg_reads(rel, globs, types, types_not, typed):
    """Whether ripgrep's -g/--glob and -t/-T filters let it read rel."""
    decision = None
    for pattern, negated in globs:
        if rg_match(rel, pattern):
            decision = not negated
    if decision is None:
        decision = not any(not negated for _, negated in globs)
    if not decision:
        return False
    if typed:
        return True
    if types and not (set(types) & MARKDOWN_TYPES):
        return False
    if set(types_not) & {"md", "markdown"}:
        return False
    return True


def grep_reads(rel, includes, excludes, exclude_dirs):
    parts = rel.split("/")
    base, folders = parts[-1], parts[:-1]
    if any(fnmatch.fnmatchcase(d, x) for d in folders for x in exclude_dirs):
        return False
    if any(fnmatch.fnmatchcase(base, x) for x in excludes):
        return False
    if includes and not any(fnmatch.fnmatchcase(base, x) for x in includes):
        return False
    return True


def rel_to(target, place):
    if target == place:
        return os.path.basename(target)
    return os.path.relpath(target, place).replace(os.sep, "/")


def walk_hits(roots, cwd, prot, reads):
    """Barred files that a recursive walk from roots would read."""
    found = []
    for root in roots:
        for target, place in covered(resolve(wild(root), cwd), prot):
            if reads(rel_to(target, place)):
                found.append(target)
    return found


def grep_search(args, cwd, prot):
    opts, before, after = parse(args, "efmABCdD", {
        "regexp", "file", "max-count", "after-context", "before-context", "context",
        "directories", "devices", "label", "exclude", "include", "exclude-dir",
        "exclude-from", "binary-files", "group-separator"})
    names = {n for n, _ in opts}
    recursive = names & {"r", "R", "recursive", "dereference-recursive"} or any(
        n in ("d", "directories") and v == "recurse" for n, v in opts)
    if not recursive:
        return []
    pos = before + after
    if not names & {"e", "f", "regexp", "file"}:
        pos = pos[1:]
    lower = [(n, v.lower()) for n, v in opts]
    includes = [v for n, v in lower if n == "include"]
    excludes = [v for n, v in lower if n == "exclude"]
    exclude_dirs = [v.rstrip("/") for n, v in lower if n == "exclude-dir"]
    return walk_hits(pos or ["."], cwd, prot,
                     lambda rel: grep_reads(rel, includes, excludes, exclude_dirs))


def rg_search(args, cwd, prot):
    opts, before, after = parse(args, "efgtTmABCjMErd", {
        "regexp", "file", "glob", "iglob", "type", "type-not", "max-count",
        "after-context", "before-context", "context", "threads", "max-columns",
        "encoding", "replace", "max-depth", "max-filesize", "sort", "sortr", "colors",
        "color", "type-add", "type-clear", "path-separator", "pre", "pre-glob",
        "ignore-file", "engine", "context-separator", "field-match-separator",
        "field-context-separator", "dfa-size-limit", "regex-size-limit",
        "hyperlink-format", "generate"})
    names = {n for n, _ in opts}
    pos = before + after
    listing = "files" in names
    if not listing and not names & {"e", "f", "regexp", "file"}:
        pos = pos[1:]
    globs = []
    for n, v in opts:
        if n in ("g", "glob", "iglob"):
            globs.append((v[1:], True) if v.startswith("!") else (v, False))
    types = [v.lower() for n, v in opts if n in ("t", "type")]
    types_not = [v.lower() for n, v in opts if n in ("T", "type-not")]
    typed = bool(names & {"type-add", "type-clear"})
    hits = walk_hits(pos or ["."], cwd, prot,
                     lambda rel: rg_reads(rel, globs, types, types_not, typed))
    return hits, listing


def git_spec_matches(target, spec):
    return target == spec or target.startswith(spec.rstrip("/") + "/") or fnmatch.fnmatchcase(target, spec)


def git_command(args, cwd, prot):
    """(barred files git grep reads, barred files git ls-files lists)."""
    i = 0
    while i < len(args) and args[i].startswith("-"):
        flag = args[i]
        i += 1
        if flag in ("-C", "-c") and i < len(args):
            if flag == "-C":
                cwd = resolve(args[i], cwd)
            i += 1
    if i >= len(args) or args[i] not in ("grep", "ls-files"):
        return [], []
    sub, rest = args[i], args[i + 1:]
    opts, before, after = parse(rest, "efABCm" if sub == "grep" else "xX", {
        "regexp", "file", "after-context", "before-context", "context", "max-count",
        "max-depth", "threads", "exclude", "exclude-from"})
    names = {n for n, _ in opts}
    if sub == "grep" and not names & {"e", "f", "regexp", "file"}:
        before = before[1:]
    specs = list(after)
    for p in before:
        # Before --, a name that is not a path is a revision, which limits nothing.
        if p.startswith(":") or os.path.exists(os.path.join(cwd, p)) or MAGIC.search(wild(p)):
            specs.append(p)
    positives, negatives = [], []
    for spec in specs:
        spec = wild(spec)
        negated, base = False, cwd
        m = re.match(r"^:(\([^)]*\)|[!^/]*)", spec)
        if m and m.group(0) != ":":
            magic, spec = m.group(1), spec[m.end():]
            negated = "exclude" in magic or "!" in magic or "^" in magic
            if "top" in magic or "/" in magic:
                base = REPO.lower()
        target = resolve(spec or ".", base)
        (negatives if negated else positives).append(target)
    if not positives:
        positives = [cwd]
    hits = [t for t in prot
            if any(git_spec_matches(t, s) for s in positives)
            and not any(git_spec_matches(t, s) for s in negatives)]
    return (hits, []) if sub == "grep" else ([], hits)


def find_command(args, cwd, prot):
    """(barred files find -exec reads, barred files find lists)."""
    roots, i = [], 0
    while i < len(args) and args[i] in ("-H", "-L", "-P", "-E", "-X", "-s", "-x"):
        i += 1
    while i < len(args) and not args[i].startswith("-") and args[i] not in ("(", "!", ")"):
        roots.append(args[i])
        i += 1
    hits = walk_hits(roots or ["."], cwd, prot, lambda rel: True)
    if set(args[i:]) & {"-exec", "-execdir", "-ok", "-okdir"}:
        return hits, []
    return [], hits


def fd_command(args, cwd, prot):
    opts, before, after = parse(args, "xXetdEcjS", {
        "exec", "exec-batch", "extension", "type", "max-depth", "exclude", "color",
        "threads", "size", "changed-within", "changed-before", "owner", "search-path",
        "base-directory", "max-results"})
    pos = (before + after)[1:]
    pos += [v for n, v in opts if n in ("search-path", "base-directory")]
    hits = walk_hits(pos or ["."], cwd, prot, lambda rel: True)
    if {n for n, _ in opts} & {"x", "X", "exec", "exec-batch"}:
        return hits, []
    return [], hits


def check_bash(command, cwd, agent, prot):
    tokens = lex(command)
    plain = " ".join(tokens)
    if SEALED.search(plain):
        refuse("That canon file is above agents' clearance.")
    if GDD.search(plain) and agent != "draftsman":
        refuse("The GDD is above this agent's clearance.")
    if agent not in (None, "", "scrivener") and CAST.search(plain):
        refuse("The cast file is above this agent's clearance.")

    looping = "$(" in command or "`" in command
    listed = []
    stack = []
    previous = cwd
    for seg in segments(tokens):
        words, piped = unwrap(seg)
        if not words:
            continue
        head, args = words[0], words[1:]
        looping = looping or piped or head in LOOPS
        if head in ("cd", "pushd", "popd"):
            targets = [a for a in args if not a.startswith("-") or a == "-"]
            if head == "popd":
                new = stack.pop() if stack else previous
            elif not targets:
                new = os.path.expanduser("~").lower()
            elif targets[0] == "-":
                new = previous
            else:
                new = resolve(wild(targets[0]), cwd)
            if head == "pushd":
                stack.append(cwd)
            previous, cwd = cwd, new
            continue

        for tok in args:
            value = tok.split("=", 1)[1] if tok.startswith("-") and "=" in tok else tok
            if tok.startswith("-") and "=" not in tok:
                continue
            if value.startswith("!") or tok.startswith("--exclude") or re.match(r"^:(\(exclude|[!^])", value):
                continue
            value = re.sub(r"^:(\([^)]*\)|/)", "", value)
            if token_reaches(value, cwd, prot, agent):
                refuse("A wildcard or variable here could open canon above this agent's clearance.")

        reads, lists = [], []
        if head in GREPS:
            reads = grep_search(args, cwd, prot)
        elif head in ("rg", "ripgrep"):
            hits, listing = rg_search(args, cwd, prot)
            (lists if listing else reads).extend(hits)
        elif head in WALKERS:
            positional = [a for a in args if not a.startswith("-")]
            reads = walk_hits(positional[1:] or ["."], cwd, prot, lambda rel: True)
        elif head == "git":
            reads, lists = git_command(args, cwd, prot)
        elif head == "find":
            reads, lists = find_command(args, cwd, prot)
        elif head in ("fd", "fdfind"):
            reads, lists = fd_command(args, cwd, prot)
        elif head in ("ls", "tree", "dir"):
            folders = [a for a in args if not a.startswith("-")]
            lists = [t for f in folders or ["."]
                     for t, place in covered(resolve(wild(f), cwd), prot) if place != t]
        if reads:
            refuse("This search reaches canon above this agent's clearance (%s)." % reads[0] + SEARCH_HELP)
        listed += lists
    if listed and looping:
        refuse("A listing fed to xargs, a loop or $() reaches canon above this agent's clearance (%s)." % listed[0])


def check_grep_tool(tool, cwd, prot):
    path = resolve(str(tool.get("path") or "."), cwd)
    pattern = tool.get("glob")
    globs = [(pattern[1:], True) if pattern.startswith("!") else (pattern, False)] if pattern else []
    kind = str(tool.get("type") or "").lower()
    found = [t for t, place in covered(path, prot)
             if rg_reads(rel_to(t, place), globs, [kind] if kind else [], [], False)]
    if found:
        refuse("This search reaches canon above this agent's clearance (%s)." % found[0]
               + " Give the Grep tool a path or glob that leaves out docs.")


def main():
    call = json.load(sys.stdin)
    tool = call.get("tool_input") or {}
    name = call.get("tool_name")
    agent = call.get("agent_type")
    cwd = os.path.normpath(str(call.get("cwd") or REPO)).lower()
    if name == "Bash":
        text = tool.get("command", "")
    else:
        text = " ".join(str(tool.get(key, "")) for key in ("file_path", "path", "pattern", "glob"))

    if SEALED.search(text):
        refuse("That canon file is above agents' clearance.")
    if GDD.search(text) and agent != "draftsman":
        refuse("The GDD is above this agent's clearance.")
    if agent not in (None, "", "scrivener") and CAST.search(text):
        refuse("The cast file is above this agent's clearance.")
    if name == "Bash" and SWEEP.search(text):
        refuse("A recursive search of docs/ reaches canon above this agent's clearance.")
    if name == "Grep" and re.search(r"(^|/)docs(/canon)?/?$", str(tool.get("path", ""))):
        refuse("A recursive search of docs/ reaches canon above this agent's clearance.")

    prot = protected(agent)
    if name == "Bash":
        check_bash(text, cwd, agent, prot)
    elif name == "Grep":
        check_grep_tool(tool, cwd, prot)
    elif name == "Read":
        path = str(tool.get("file_path", ""))
        if resolve(path, cwd) in prot or (MAGIC.search(path) and token_reaches(path, cwd, prot, agent)):
            refuse("That canon file is above this agent's clearance.")


def fail_closed(why):
    """Any failure to judge a call refuses it. Exit 2 is Claude Code's blocking
    exit whatever the settings say; any other non-zero exit lets the call through."""
    try:
        sys.stderr.write("The canon hook could not read this command (%s), so it refuses it."
                         " Put a long script in a file with the Write tool and run the file.\n" % why)
        sys.stderr.flush()
    finally:
        os._exit(2)


def on_alarm(signum, frame):
    raise TimeoutError("took too long")


if __name__ == "__main__":
    try:
        if hasattr(signal, "SIGALRM"):
            signal.signal(signal.SIGALRM, on_alarm)
            signal.alarm(8)  # the hook's timeout in settings.json is 10 seconds
        main()
    except SystemExit:
        raise
    except BaseException as err:  # noqa: B036 - fail closed on anything
        fail_closed(type(err).__name__)
