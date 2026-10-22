"""Shared helpers for the validators.

Python 3.9, standard library only. No network calls, no model calls.

Every check reports problems as lines of the form

    FAIL <check>/<code> <path> [id=<id>] : <message>
    WARN <check>/<code> <path> [id=<id>] : <message>

one per line, paths relative to the repository root, so the agent that wrote
the content can act on the line without re-reading everything.
"""

import json
import os
import re
import sys

REGISTER_PATH = "content/provenance.json"
CONTENT_DIR = "content"
HERE = os.path.dirname(os.path.abspath(__file__))
SCHEMA_DIR = os.path.join(HERE, "schemas")
DEFAULT_ROOT = os.path.dirname(os.path.dirname(HERE))


class Report:
    """Collects FAIL and WARN lines for one check."""

    def __init__(self, check):
        self.check = check
        self.fails = []
        self.warns = []
        self.notes = []

    def _line(self, level, code, path, ident, message):
        where = path or "-"
        if ident is not None:
            where = "%s id=%s" % (where, ident)
        line = "%s %s/%s %s : %s" % (level, self.check, code, where, message)
        return one_line(line)

    def fail(self, code, path, message, ident=None):
        self.fails.append(self._line("FAIL", code, path, ident, message))

    def warn(self, code, path, message, ident=None):
        self.warns.append(self._line("WARN", code, path, ident, message))

    def note(self, message):
        self.notes.append(one_line("NOTE %s : %s" % (self.check, message)))

    def lines(self):
        return sorted(self.fails) + sorted(self.warns) + self.notes

    def emit(self, stream=None):
        stream = stream or sys.stdout
        for line in self.lines():
            stream.write(line + "\n")
        status = "FAILED" if self.fails else "passed"
        stream.write(
            "%s: %s (%d failures, %d warnings)\n"
            % (self.check, status, len(self.fails), len(self.warns))
        )
        return 1 if self.fails else 0


def one_line(text):
    """Escapes control characters, so a value with a newline in it cannot
    split one problem across two report lines."""
    return "".join(
        ch.encode("unicode_escape").decode("ascii") if ord(ch) < 32 or ch == "\x7f" else ch
        for ch in text)


def rel(root, path):
    return os.path.relpath(path, root).replace(os.sep, "/")


def is_hidden(name):
    """A dotfile or dot-directory name (".DS_Store", ".git"). Content never
    has one; editors and the OS leave them behind (work orders 002, 010)."""
    return name.startswith(".")


def walk_files(root, subdir):
    """Every regular file under root/subdir, sorted, as repo-relative paths.
    Dotfiles and everything under a dot-directory are skipped, for every
    check."""
    base = os.path.join(root, subdir)
    out = []
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = sorted(d for d in dirnames if not is_hidden(d))
        for name in sorted(filenames):
            if not is_hidden(name):
                out.append(rel(root, os.path.join(dirpath, name)))
    return out


def load_json(root, relpath):
    """Returns (data, error_message). error_message is None on success."""
    try:
        with open(os.path.join(root, relpath), "r", encoding="utf-8") as fh:
            return json.load(fh), None
    except (ValueError, UnicodeDecodeError) as exc:
        return None, "does not parse as JSON: %s" % exc
    except OSError as exc:
        return None, "cannot be read: %s" % exc


def content_files(root):
    """Content files: everything under content/ except the register."""
    return [p for p in walk_files(root, CONTENT_DIR) if p != REGISTER_PATH]


def collect_ids(node, pointer=""):
    """Every value of a key named "id", at any depth, with its JSON Pointer.

    Yields (pointer_to_the_id_value, value).
    """
    if isinstance(node, dict):
        for key in node:
            child = pointer + "/" + escape_pointer_token(key)
            if key == "id":
                yield child, node[key]
            else:
                for item in collect_ids(node[key], child):
                    yield item
    elif isinstance(node, list):
        for index, value in enumerate(node):
            for item in collect_ids(value, "%s/%d" % (pointer, index)):
                yield item


# Jeremy's answer to work order 007 Q12: a zone economy file's top-level
# "anchors" object holds the draftsman's free-form assumptions, so an "id"
# inside it is not a content id.
ID_EXEMPT_KEYS = (("tuning.economy/", "anchors"),)


def content_ids(data):
    """collect_ids for a whole content file, leaving out each exempt top-level
    key of a file whose schema starts with the paired prefix."""
    declared = data.get("schema") if isinstance(data, dict) else None
    skip = set(key for prefix, key in ID_EXEMPT_KEYS
               if isinstance(declared, str) and declared.startswith(prefix))
    if not skip:
        for item in collect_ids(data):
            yield item
        return
    for key in data:
        if key in skip:
            continue
        child = "/" + escape_pointer_token(key)
        if key == "id":
            yield child, data[key]
        else:
            for item in collect_ids(data[key], child):
                yield item


def escape_pointer_token(token):
    return str(token).replace("~", "~0").replace("/", "~1")


def resolve_pointer(document, pointer):
    """RFC 6901. Returns (found, value)."""
    if pointer == "":
        return True, document
    if not pointer.startswith("/"):
        return False, None
    node = document
    for raw in pointer[1:].split("/"):
        token = raw.replace("~1", "/").replace("~0", "~")
        if isinstance(node, dict):
            if token not in node:
                return False, None
            node = node[token]
        elif isinstance(node, list):
            if not re.fullmatch(r"0|[1-9][0-9]*", token):
                return False, None
            index = int(token)
            if index >= len(node):
                return False, None
            node = node[index]
        else:
            return False, None
    return True, node


# --------------------------------------------------------------------------
# Schemas
# --------------------------------------------------------------------------


def load_schemas(kind):
    """kind is "content" or "register". Returns {schema_id: schema_dict}."""
    registry = {}
    directory = os.path.join(SCHEMA_DIR, kind)
    for name in sorted(os.listdir(directory)):
        if not name.endswith(".schema.json"):
            continue
        with open(os.path.join(directory, name), "r", encoding="utf-8") as fh:
            schema = json.load(fh)
        registry[schema["$id"]] = schema
    return registry


_TYPES = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    "boolean": lambda v: isinstance(v, bool),
    "null": lambda v: v is None,
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "integer": lambda v: (
        isinstance(v, int) and not isinstance(v, bool)
    ) or (isinstance(v, float) and v.is_integer()),
}


def validate(instance, schema, root_schema=None, pointer=""):
    """A small JSON Schema (2020-12) subset validator.

    Supports: $ref (local #/$defs/...), type, enum, const, required,
    properties, additionalProperties, items, minItems, maxItems, minimum,
    exclusiveMinimum, maximum, minLength, pattern, and one keyword of this
    repo's own: maxWords (a string's whitespace-separated word count).

    Returns a list of (pointer, message).
    """
    root_schema = root_schema if root_schema is not None else schema
    errors = []

    if "$ref" in schema:
        ref = schema["$ref"]
        if not ref.startswith("#/"):
            return [(pointer, "schema error: unsupported $ref %s" % ref)]
        found, target = resolve_pointer(root_schema, ref[1:])
        if not found:
            return [(pointer, "schema error: unresolved $ref %s" % ref)]
        return validate(instance, target, root_schema, pointer)

    where = pointer or "/"

    if "type" in schema:
        allowed = schema["type"]
        if isinstance(allowed, str):
            allowed = [allowed]
        if not any(_TYPES[t](instance) for t in allowed):
            return [(where, "expected %s, got %s" % (
                " or ".join(allowed), _describe(instance)))]

    if "const" in schema and instance != schema["const"]:
        errors.append((where, "must equal %s" % json.dumps(schema["const"])))

    if "enum" in schema and instance not in schema["enum"]:
        errors.append((where, "must be one of %s, got %s" % (
            json.dumps(schema["enum"]), json.dumps(instance))))

    if isinstance(instance, str):
        if "minLength" in schema and len(instance) < schema["minLength"]:
            errors.append((where, "shorter than %d characters" % schema["minLength"]))
        if "pattern" in schema and not ecma_search(schema["pattern"], instance):
            errors.append((where, "does not match pattern %s" % schema["pattern"]))
        if "maxWords" in schema:
            words = len(instance.split())
            if words > schema["maxWords"]:
                errors.append((where, "has %d words; at most %d allowed"
                               % (words, schema["maxWords"])))

    if _TYPES["number"](instance):
        if "minimum" in schema and instance < schema["minimum"]:
            errors.append((where, "below minimum %s" % schema["minimum"]))
        if "exclusiveMinimum" in schema and instance <= schema["exclusiveMinimum"]:
            errors.append((where, "must be greater than %s" % schema["exclusiveMinimum"]))
        if "maximum" in schema and instance > schema["maximum"]:
            errors.append((where, "above maximum %s" % schema["maximum"]))

    if isinstance(instance, dict):
        for key in schema.get("required", []):
            if key not in instance:
                errors.append((where, "missing required field %r" % key))
        properties = schema.get("properties", {})
        additional = schema.get("additionalProperties", True)
        for key, value in instance.items():
            child = pointer + "/" + escape_pointer_token(key)
            if key in properties:
                errors.extend(validate(value, properties[key], root_schema, child))
            elif additional is False:
                errors.append((child, "field %r is not allowed by this schema" % key))
            elif isinstance(additional, dict):
                errors.extend(validate(value, additional, root_schema, child))

    if isinstance(instance, list):
        if "minItems" in schema and len(instance) < schema["minItems"]:
            errors.append((where, "fewer than %d items" % schema["minItems"]))
        if "maxItems" in schema and len(instance) > schema["maxItems"]:
            errors.append((where, "more than %d items" % schema["maxItems"]))
        if "items" in schema:
            for index, value in enumerate(instance):
                errors.extend(validate(
                    value, schema["items"], root_schema, "%s/%d" % (pointer, index)))

    return errors


def ecma_pattern(pattern):
    """JSON Schema patterns use ECMA-262 semantics, where "$" (no multiline
    flag) matches only at the very end of the string. Python's "$" also
    matches just before a trailing newline, so "id.x\\n" passed "^...$".
    Rewrites every unescaped "$" outside a character class as "\\Z"."""
    out, i, in_class = [], 0, False
    while i < len(pattern):
        ch = pattern[i]
        if ch == "\\":
            out.append(pattern[i:i + 2])
            i += 2
            continue
        if in_class:
            if ch == "]":
                in_class = False
        elif ch == "[":
            in_class = True
        elif ch == "$":
            ch = "\\Z"
        out.append(ch)
        i += 1
    return "".join(out)


def ecma_search(pattern, instance):
    return re.search(ecma_pattern(pattern), instance) is not None


def _describe(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    return "object"


def parse_root(argv):
    """Each check takes an optional --root (default: the repository root)."""
    root = DEFAULT_ROOT
    args = list(argv)
    if "--root" in args:
        index = args.index("--root")
        root = os.path.abspath(args[index + 1])
    return root
