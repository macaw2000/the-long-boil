"""The strings a player can read, out of the client's TypeScript source.

A small lexer, not a compiler: it finds string literals, template text and JSX
text, and skips comments, regular expressions and every code identifier, so a
variable or a type named after a guarded word is never read as a player string.

Some strings are code even though they are strings. These are not returned:

- module paths (import, export, from, require);
- JSX attributes and object fields in CODE_FIELDS, such as className or id;
- object keys, and index keys such as x["key"];
- both sides of a comparison, case labels and members of a union type;
- id shapes: no spaces, no capitals, and a separator (item.rustmoor.spanner,
  place:story, a_b, a-b, ./art/x.png).

A plain lowercase word in any other position is kept, so a single-word label
is still read. A file the lexer cannot follow raises LexError, and the caller
fails it as not-checkable: the guard never passes a file it could not read.

Python 3.9, standard library only. No network calls, no model calls.
"""

import re

CODE_FIELDS = frozenset((
    "accessibilityRole", "autoCapitalize", "autoComplete", "className", "href", "id", "key",
    "keyboardType", "kind", "nativeID", "pointerEvents", "ref", "resizeMode", "source", "src",
    "style", "testID", "textContentType", "type",
))
_ID_SHAPE = re.compile(r"^[a-z0-9_.:/#@-]*$")
_SEPARATOR = re.compile(r"[_.:/#@-]")
_MODULE_WORDS = ("from", "import", "require", "export")
_REGEX_AFTER = "(,=:[!&|?{};+-*%<~^"
_JSX_AFTER = "(,=:?&|{[;"
_KEYWORDS_BEFORE_VALUE = ("return", "typeof", "case", "default", "yield", "else", "do", "in", "of")
_FIELD = re.compile(r"(?:^|[{,\s])([A-Za-z_$][\w$]*)\s*:\s*$")


class LexError(Exception):
    def __init__(self, line, message):
        Exception.__init__(self, message)
        self.line = line
        self.message = message


class _Lexer:
    def __init__(self, source, jsx):
        self.s = source
        self.n = len(source)
        self.i = 0
        self.jsx = jsx
        self.out = []
        self.muted = 0
        self.last = ""  # the last significant character
        self.word = ""  # the last word, when it was the last token

    def line(self, index=None):
        return self.s.count("\n", 0, self.i if index is None else index) + 1

    def emit(self, index, text):
        if not self.muted and text.strip():
            self.out.append((self.line(index), text))

    def is_code_string(self, start, end, text):
        """start is the opening quote, end is just past the closing one."""
        before = self.s[max(0, start - 80):start].rstrip()
        after = self.s[end:end + 8].lstrip()
        if self.word in _MODULE_WORDS or before.endswith("require("):
            return True
        if after.startswith(("===", "!==", "==", "!=")):
            return True
        if before.endswith(("===", "!==", "==", "!=")) or re.search(r"\bcase$", before):
            return True
        if before.endswith("|") and not before.endswith("||"):
            return True
        if after.startswith("|") and not after.startswith("||"):
            return True
        if after.startswith(":") and before.endswith(("{", ",")):
            return True
        if after.startswith("]") and re.search(r"[\w)\]]\[$", before):
            return True
        field = _FIELD.search(before)
        if field and field.group(1) in CODE_FIELDS:
            return True
        return bool(text) and bool(_ID_SHAPE.match(text)) and bool(_SEPARATOR.search(text))

    def string(self, quote):
        start = self.i
        self.i += 1
        chars = []
        while self.i < self.n:
            c = self.s[self.i]
            if c == "\\":
                chars.append(self.s[self.i + 1:self.i + 2])
                self.i += 2
                continue
            if c == quote:
                self.i += 1
                text = "".join(chars)
                if not self.is_code_string(start, self.i, text):
                    self.emit(start, text)
                self.last, self.word = '"', ""
                return
            if c == "\n":
                break
            chars.append(c)
            self.i += 1
        raise LexError(self.line(start), "unterminated string")

    def template(self):
        begin = self.i
        self.i += 1
        start = self.i
        chunk = []

        def flush():
            text = "".join(chunk)
            del chunk[:]
            if not (_ID_SHAPE.match(text) and _SEPARATOR.search(text)):
                self.emit(start, text)

        while self.i < self.n:
            c = self.s[self.i]
            if c == "\\":
                chunk.append(self.s[self.i + 1:self.i + 2])
                self.i += 2
            elif c == "`":
                flush()
                self.i += 1
                self.last, self.word = '"', ""
                return
            elif self.s.startswith("${", self.i):
                flush()
                self.i += 2
                self.code(True)
                start = self.i
            else:
                chunk.append(c)
                self.i += 1
        raise LexError(self.line(begin), "unterminated template")

    def regex(self):
        begin = self.i
        self.i += 1
        in_class = False
        while self.i < self.n:
            c = self.s[self.i]
            if c == "\n":
                break
            if c == "\\":
                self.i += 2
                continue
            if c == "[":
                in_class = True
            elif c == "]":
                in_class = False
            elif c == "/" and not in_class:
                self.i += 1
                self.last, self.word = '"', ""
                return
            self.i += 1
        raise LexError(self.line(begin), "unterminated regular expression")

    def regex_allowed(self):
        return self.word in _KEYWORDS_BEFORE_VALUE or (not self.word and (
            not self.last or self.last in _REGEX_AFTER))

    def jsx_allowed(self):
        following = self.s[self.i + 1:self.i + 2]
        if not (following.isalpha() or following == ">"):
            return False
        if self.word:
            return self.word in _KEYWORDS_BEFORE_VALUE
        return (not self.last or self.last in _JSX_AFTER
                or self.s[:self.i].rstrip().endswith("=>"))

    def skip_space(self):
        while self.i < self.n:
            if self.s[self.i].isspace():
                self.i += 1
            elif self.s.startswith("//", self.i):
                end = self.s.find("\n", self.i)
                self.i = self.n if end < 0 else end
            elif self.s.startswith("/*", self.i):
                end = self.s.find("*/", self.i)
                if end < 0:
                    raise LexError(self.line(), "unterminated comment")
                self.i = end + 2
            else:
                return

    def code(self, in_braces):
        """Walk code to end of input, or past the matching "}" when in_braces."""
        depth = 0
        while True:
            self.skip_space()
            if self.i >= self.n:
                if in_braces:
                    raise LexError(self.line(), "unterminated expression")
                return
            c = self.s[self.i]
            if c in "\"'":
                self.string(c)
            elif c == "`":
                self.template()
            elif c == "/" and self.regex_allowed():
                self.regex()
            elif c == "<" and self.jsx and self.jsx_allowed():
                self.element()
            elif c.isalpha() or c in "_$":
                start = self.i
                while self.i < self.n and (self.s[self.i].isalnum() or self.s[self.i] in "_$"):
                    self.i += 1
                self.word, self.last = self.s[start:self.i], "a"
            else:
                self.i += 1
                self.last, self.word = c, ""
                if c == "{":
                    depth += 1
                elif c == "}":
                    if depth == 0:
                        if in_braces:
                            return
                        raise LexError(self.line(), "unbalanced brace")
                    depth -= 1

    def element(self):
        begin = self.i
        self.i += 1
        if self.s[self.i:self.i + 1] == ">":
            self.i += 1
            self.children(begin)
            return
        match = re.compile(r"[\w.:-]+").match(self.s, self.i)
        if not match:
            raise LexError(self.line(begin), "unreadable JSX tag")
        self.i = match.end()
        while True:
            self.skip_space()
            if self.i >= self.n:
                raise LexError(self.line(begin), "unterminated JSX tag")
            if self.s.startswith("/>", self.i):
                self.i += 2
                self.last, self.word = ">", ""
                return
            if self.s[self.i] == ">":
                self.i += 1
                self.children(begin)
                return
            if self.s[self.i] == "{":
                self.i += 1
                self.code(True)
                continue
            self.attribute(begin)

    def attribute(self, begin):
        match = re.compile(r"[\w:.-]+").match(self.s, self.i)
        if not match:
            raise LexError(self.line(begin), "unreadable JSX attribute")
        name = match.group(0)
        self.i = match.end()
        self.skip_space()
        if self.s[self.i:self.i + 1] != "=":
            return
        self.i += 1
        self.skip_space()
        c = self.s[self.i:self.i + 1]
        if c in ("'", '"'):
            end = self.s.find(c, self.i + 1)
            if end < 0:
                raise LexError(self.line(begin), "unterminated JSX attribute")
            if name not in CODE_FIELDS:
                self.emit(self.i, self.s[self.i + 1:end])
            self.i = end + 1
        elif c == "{":
            self.i += 1
            self.last, self.word = "{", ""
            muted = name in CODE_FIELDS
            self.muted += muted
            self.code(True)
            self.muted -= muted
        else:
            raise LexError(self.line(begin), "unreadable JSX attribute value")

    def children(self, begin):
        start = self.i
        while self.i < self.n:
            c = self.s[self.i]
            if c == "<":
                self.emit(start, self.s[start:self.i])
                if self.s.startswith("</", self.i):
                    end = self.s.find(">", self.i)
                    if end < 0:
                        raise LexError(self.line(begin), "unterminated closing tag")
                    self.i = end + 1
                    self.last, self.word = ">", ""
                    return
                self.element()
                start = self.i
            elif c == "{":
                self.emit(start, self.s[start:self.i])
                self.i += 1
                self.last, self.word = "{", ""
                self.code(True)
                start = self.i
            else:
                self.i += 1
        raise LexError(self.line(begin), "unterminated JSX element")


def ts_strings(source, jsx):
    """(line, text) for every player string in TypeScript source. line is where
    the string starts; text may span lines."""
    lexer = _Lexer(source, jsx)
    lexer.code(False)
    return lexer.out


def html_strings(source):
    """(line, text) for the visible text of an HTML page."""
    blank = lambda match: "\n" * match.group(0).count("\n")
    source = re.sub(r"(?is)<(script|style)\b.*?</\1\s*>", blank, source)
    source = re.sub(r"(?s)<!--.*?-->", blank, source)
    source = re.sub(r"(?s)<[^>]*>", lambda m: " " + blank(m) + " ", source)
    return [(number, line) for number, line in enumerate(source.split("\n"), 1) if line.strip()]
