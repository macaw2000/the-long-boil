"""Cut the Layer 1 reading copies of the reveal schedule and the GDD.

    python3 scripts/canon/cut_clearance.py [--root DIR] [--explain]

Decision 28 in docs/first-day-plan.md: twice in work order 037 an agent told to
stop at Layer 1 printed higher layers, so "stop reading here" does not hold. An
agent cleared for Layer 1 reads these two generated files instead:

    docs/canon/slices/reveals-layer1.md   from docs/canon/reveals.md
    docs/canon/slices/gdd-cleared.md      from docs/gdd.md

The rules. Each one works from the file's own structure, never from what a
sentence means. The script cannot tell a secret from a harmless line, so a
line with no marker survives; only a person can check for that.

reveals.md:
  R1  Everything after the Layer 1 row of the layer table is removed: the
      higher rows and every section below the table.
  R2  Above that row, a line carrying a marker (see MARKERS) is removed.

gdd.md:
  G1  Section 4 keeps only its opening, "The truth, and when players learn
      it", the Prologue and Act I. Every other subsection is removed, heading
      included. This is a keep-list: a subsection added later is cut until
      someone adds it here.
  G2  In the layer table of "The truth", every row labelled above 1 is removed.
  G3  In "Characters", the column headed "What they are hiding" is removed from
      every row, and everything in that subsection that is not the table.
  G4  In Appendix A, a sample subsection with a marker anywhere in it is removed
      whole, because it is a sample from a later act.
  G5  Anywhere else, a heading with a marker removes its whole subsection.
  G6  Anywhere else, a line with a marker other than a hard-limit word is
      removed: a paragraph, a list item or a table row, whole.
  G7  Anywhere else, a line whose only markers are hard-limit words (see
      HARD_LIMIT_WORDS): a table row, a glossary entry included, is removed
      whole; in a paragraph, list item or quote, each sentence carrying one is
      removed, and the line goes if no sentence is left.

Markers are of two kinds. The layer and act markers, the hiding column and
"for the team only" say outright that a line is above the clearance. The
hard-limit words are the things docs/canon/slices/act1.md's "Hard limits for
this slice" forbid in Act I (inspector, work order 040, 10 November 2026: the
cut let them through because it guarded only the knock words). Both kinds
count everywhere a marker counts: R2, G4, G5 and the final scan.

Fail closed: if a required heading, table or row is missing, or the output
still carries a marker, the script writes nothing and exits 1. Output is built
in memory for both files first. Errors and --explain give line numbers and rule
names only, never source text, so running this cannot itself leak.

Python 3.9, standard library only. No network calls, no model calls.
"""

import os
import re
import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "validate"))

import check_reveal  # noqa: E402

REVEALS_SOURCE = "docs/canon/reveals.md"
GDD_SOURCE = "docs/gdd.md"
REVEALS_SLICE = "docs/canon/slices/reveals-layer1.md"
GDD_SLICE = "docs/canon/slices/gdd-cleared.md"
SLICES = (REVEALS_SLICE, GDD_SLICE)

CLEARED_LAYER = 1
CLEARED_ACT = 1
HIDES_COLUMN = "What they are hiding"
GENERATED_LINE = "GENERATED FILE. Do not edit by hand."

_JOIN = r"\s*(?:to|and|through|or|,|-|–|—)\s*"

# Each marker names a layer or act above the clearance, in any form the sources
# have used. A range such as "1 to 3" counts, because it names the top of it.
MARKERS = (
    ("layer-number", re.compile(r"\bLayers?\s+[2-9]\b")),
    ("layer-range", re.compile(r"\bLayers?\s+[01]" + _JOIN + r"[2-9]\b")),
    ("layer-word", re.compile(r"\bLayers?\s+(?:two|three|four|five)\b", re.I)),
    ("act-numeral", re.compile(r"\bActs?\s+(?:II|III|IV|V)\b")),
    ("act-number", re.compile(r"\bActs?\s+(?:[2-9]|two|three|four|five)\b", re.I)),
    ("act-range", re.compile(r"\bActs?\s+I" + _JOIN + r"(?:II|III|IV|V)\b")),
    ("hides-column", re.compile(re.escape(HIDES_COLUMN))),
    # The GDD flags its spoilers for the team; agents are not the team.
    ("team-only", re.compile(r"\bfor the team only\b", re.I)),
)

# The hard limits of docs/canon/slices/act1.md, as word forms. The limits are
# prose, so the forms live here, each with the limit it enforces. Forms match
# case-insensitively as whole words; a space in a form matches any run of
# whitespace. "Steeped" also matches tea being steeped: the cut fails safe.
# check_reveal's word guards (the knock words) are added in line_markers.
HARD_LIMIT_WORDS = (
    ("hard-limit-steeped", ("steeped",), "No Steeped"),
    ("hard-limit-capsule", ("capsule", "capsules"), "no capsules"),
    ("hard-limit-hearth", ("hearth", "hearths"), "No Hearth"),
    ("hard-limit-haze", ("haze",),
     "Haze does not exist yet: it enters in Act II with the Whistle. Do not reference it."),
    ("hard-limit-notation", ("notation", "notations", "whistle note", "whistle notes"),
     "No Whistle notation"),
    ("hard-limit-off-hour", ("off-hour", "off hour", "off the hour", "not on the hour"),
     "no off-hour note"),
)


def _word_pattern(forms):
    alternatives = "|".join(re.escape(f).replace("\\ ", r"\s+")
                            for f in sorted(forms, key=len, reverse=True))
    return re.compile(r"(?<![A-Za-z])(?:%s)(?![A-Za-z])" % alternatives, re.I)


HARD_LIMITS = tuple((name, _word_pattern(forms)) for name, forms, _limit in HARD_LIMIT_WORDS)
HARD_LIMIT_NAMES = frozenset(name for name, _p in HARD_LIMITS)


class CutError(Exception):
    """The source does not have the shape the cut relies on."""

    def __init__(self, path, line, message):
        Exception.__init__(self, "%s:%s : %s" % (path, line or "-", message))
        self.path, self.line, self.message = path, line, message


HARD_LIMIT_FORMS = frozenset(form for _n, forms, _l in HARD_LIMIT_WORDS for form in forms)


def _guards():
    """The check_reveal word guards for acts above the clearance. A guard whose
    forms are all hard-limit words is left to G7, so a sentence naming Haze or
    a capsule costs that sentence, not its whole line."""
    return [(act, pattern) for (act, pattern, _s, _l), (_a, forms, _so, _li)
            in zip(check_reveal.WORD_GUARDS, check_reveal.REVEAL_WORDS)
            if act > CLEARED_ACT and not set(forms) <= HARD_LIMIT_FORMS]


def line_markers(line):
    """The names of the markers on one line. Names only, never the text."""
    found = [name for name, pattern in MARKERS if pattern.search(line)]
    for act, pattern in _guards():
        if pattern.search(line):
            found.append("guarded-word-act-%d" % act)
    found.extend(name for name, pattern in HARD_LIMITS if pattern.search(line))
    return found


# A list item's or quote's lead-in, kept when its sentences are redacted.
_LEAD = re.compile(r"^(\s*(?:[-*+]|\d+\.)\s+|\s*>\s*)")
# Words ending in a full stop that do not end a sentence.
_NOT_AN_END = re.compile(r"(?:^|\s)(?:Mr|Mrs|Ms|Dr|St|No|e\.g|i\.e|etc)\.$")


def sentences(text):
    """text split after each . ! or ? (and any closing quote, bracket or
    emphasis) that is followed by whitespace, except after a short title."""
    parts, start = [], 0
    for match in re.finditer(r"[.!?][\"'”’)*_]*(?=\s)", text):
        if _NOT_AN_END.search(text[start:match.end()].rstrip("\"'”’)*_")):
            continue
        parts.append(text[start:match.end()].strip())
        start = match.end()
    tail = text[start:].strip()
    if tail:
        parts.append(tail)
    return [p for p in parts if p]


def redact_sentences(line):
    """The line with every sentence carrying a marker removed, or None when
    nothing is left of it."""
    match = _LEAD.match(line)
    lead = match.group(1) if match else ""
    kept = [s for s in sentences(line[len(lead):]) if not line_markers(s)]
    return lead + " ".join(kept) if kept else None


def _cells(line):
    return line.split("|")[1:-1]


def _is_layer_header(line):
    return line.startswith("|") and _cells(line)[0].strip() == "Layer"


def _row_label(line):
    """The whole number in a table row's first cell, or None."""
    cells = _cells(line)
    label = cells[0].strip() if cells else ""
    return int(label) if label.isdigit() else None


def scan(text):
    """(line number, marker name) for everything in a generated file that is
    above the clearance, including a layer table row labelled above it."""
    hits = []
    in_table = False
    for number, line in enumerate(text.split("\n"), 1):
        for name in line_markers(line):
            hits.append((number, name))
        if _is_layer_header(line):
            in_table = True
        elif not line.startswith("|"):
            in_table = False
        elif in_table:
            label = _row_label(line)
            if label is not None and label > CLEARED_LAYER:
                hits.append((number, "layer-row"))
    return hits


class _Cut:
    """One source's lines, what is removed from them and under which rule."""

    def __init__(self, path, text):
        self.path = path
        self.lines = text.split("\n")
        self.dropped = {}  # index -> rule
        self.shortened = {}  # index -> rule, for a line kept in part

    def shorten(self, index, text, rule):
        self.lines[index] = text
        self.shortened.setdefault(index, rule)

    def drop(self, index, rule):
        self.dropped.setdefault(index, rule)

    def drop_span(self, start, end, rule):
        for index in range(start, end):
            self.drop(index, rule)

    def fail(self, index, message):
        raise CutError(self.path, None if index is None else index + 1, message)

    def find(self, pattern, label):
        """The one line matching pattern; anything else fails closed."""
        found = [i for i, line in enumerate(self.lines) if re.search(pattern, line)]
        if len(found) != 1:
            self.fail(None, "required marker %s found %d times, expected once"
                      % (label, len(found)))
        return found[0]

    def table(self, start, end, first_cell):
        """The first table in [start, end) whose first header cell is
        first_cell, as (header index, index after its last row)."""
        for index in range(start, end):
            line = self.lines[index]
            if line.startswith("|") and _cells(line)[0].strip() == first_cell:
                stop = index
                while stop < end and self.lines[stop].startswith("|"):
                    stop += 1
                return index, stop
        self.fail(start, "required table headed %r is missing" % first_cell)

    def headings(self):
        """(index, level) of every heading."""
        found = []
        for index, line in enumerate(self.lines):
            match = re.match(r"(#{1,6}) ", line)
            if match:
                found.append((index, len(match.group(1))))
        return found

    def span_end(self, start, level):
        for index, other in self.headings():
            if index > start and other <= level:
                return index
        return len(self.lines)

    def kept(self):
        lines = [l for i, l in enumerate(self.lines) if i not in self.dropped]
        out = []
        for line in lines:
            if line.strip() or (out and out[-1].strip()):
                out.append(line)
        while out and not out[-1].strip():
            out.pop()
        return out

    def by_rule(self, shortened=False):
        rules = {}
        source = self.shortened if shortened else self.dropped
        for index, rule in sorted(source.items()):
            if shortened and index in self.dropped:
                continue
            rules.setdefault(rule, []).append(index + 1)
        return rules


def _counts(rules):
    return ", ".join("%s %d" % (rule, len(lines)) for rule, lines in sorted(rules.items()))


def _header(source, cut):
    lines = ["<!--",
             GENERATED_LINE,
             "Source: %s, cut by scripts/canon/cut_clearance.py." % source,
             "Regenerate with: python3 scripts/canon/cut_clearance.py",
             "Cleared for Layer %d. Source lines removed, by rule: %s."
             % (CLEARED_LAYER, _counts(cut.by_rule()))]
    shortened = cut.by_rule(shortened=True)
    if shortened:
        lines.append("Source lines kept in part, by rule: %s." % _counts(shortened))
    return lines + ["The rules are in the docstring of that script.", "-->", ""]


def _finish(cut, slice_path, body):
    text = "\n".join(_header(cut.path, cut) + body) + "\n"
    hits = scan(text)
    if hits:
        cut.fail(None, "the cut still carries a marker, so nothing was written: "
                 + ", ".join("output line %d %s" % hit for hit in hits))
    return text


def cut_reveals(text):
    cut = _Cut(REVEALS_SOURCE, text)
    header = next((i for i, l in enumerate(cut.lines) if _is_layer_header(l)), None)
    if header is None:
        cut.fail(None, "required layer table is missing")
    rows = {}
    index = header + 2
    while index < len(cut.lines) and cut.lines[index].startswith("|"):
        label = _row_label(cut.lines[index])
        if label is None:
            cut.fail(index, "a layer table row has no whole-number label")
        rows[label] = index
        index += 1
    for needed in (CLEARED_LAYER, CLEARED_LAYER + 1):
        if needed not in rows:
            cut.fail(None, "required layer table row %d is missing" % needed)
    if list(rows) != sorted(rows):
        cut.fail(header, "the layer table rows are out of order")
    cut.drop_span(rows[CLEARED_LAYER] + 1, len(cut.lines), "R1")
    for index in range(rows[CLEARED_LAYER] + 1):
        if line_markers(cut.lines[index]):
            cut.drop(index, "R2")
    title = "# The reveal schedule, cut at Layer %d" % CLEARED_LAYER
    return cut, _finish(cut, REVEALS_SLICE, [title, ""] + cut.kept())


def cut_gdd(text):
    cut = _Cut(GDD_SOURCE, text)
    section3 = cut.find(r"^## 3\. ", "section 3")
    section4 = cut.find(r"^## 4\. ", "section 4")
    section5 = cut.find(r"^## 5\. ", "section 5")
    truth = cut.find(r"^### The truth, ", "the truth subsection")
    prologue = cut.find(r"^### Prologue\b", "the Prologue subsection")
    act1 = cut.find(r"^### Act I\b", "the Act I subsection")
    cut.find(r"^### Act II\b", "the Act II subsection")
    cut.find(r"^### Act III\b", "the Act III subsection")
    characters = cut.find(r"^### Characters$", "the Characters subsection")
    appendix_a = cut.find(r"^### A\. ", "Appendix A")
    if not section3 < characters < section4 < truth < section5:
        cut.fail(None, "sections 3 to 5 are not in the expected order")
    if not section4 < prologue < act1 < section5:
        cut.fail(None, "the Prologue and Act I are not inside section 4")

    # G1: the keep-list.
    for index, level in cut.headings():
        if section4 < index < section5 and level == 3 and index not in (truth, prologue, act1):
            cut.drop_span(index, cut.span_end(index, 3), "G1")

    # G2: rows above the clearance.
    start, stop = cut.table(truth, cut.span_end(truth, 3), "Layer")
    labels = {}
    for index in range(start + 2, stop):
        label = _row_label(cut.lines[index])
        if label is None:
            cut.fail(index, "a layer table row has no whole-number label")
        labels[label] = index
        if label > CLEARED_LAYER:
            cut.drop(index, "G2")
    for needed in (CLEARED_LAYER, CLEARED_LAYER + 1):
        if needed not in labels:
            cut.fail(start, "required layer table row %d is missing" % needed)

    # G3: the hiding column, and whatever else sits around the table.
    end = cut.span_end(characters, 3)
    start, stop = cut.table(characters, end, "Character")
    header = [c.strip() for c in _cells(cut.lines[start])]
    if HIDES_COLUMN not in header:
        cut.fail(start, "required column %r is missing" % HIDES_COLUMN)
    column = header.index(HIDES_COLUMN)
    for index in range(start, stop):
        cells = _cells(cut.lines[index])
        if len(cells) != len(header):
            cut.fail(index, "a Characters row has %d cells, the header has %d"
                     % (len(cells), len(header)))
        cut.lines[index] = "|" + "|".join(c for i, c in enumerate(cells) if i != column) + "|"
    for index in list(range(characters + 1, start)) + list(range(stop, end)):
        if cut.lines[index].strip():
            cut.drop(index, "G3")

    # G4: later-act samples in Appendix A.
    appendix_end = cut.span_end(appendix_a, 3)
    for index, level in cut.headings():
        if appendix_a < index < appendix_end and level == 4:
            end = cut.span_end(index, 4)
            if any(line_markers(cut.lines[i]) for i in range(index, end)):
                cut.drop_span(index, end, "G4")

    # G5, then G6: anything left that still carries a marker.
    for index, level in cut.headings():
        if index not in cut.dropped and line_markers(cut.lines[index]):
            cut.drop_span(index, cut.span_end(index, level), "G5")
    # G6: a line that says outright it is above the clearance goes whole.
    # G7: a line that only names a hard-limit word loses that row or sentence.
    for index, line in enumerate(cut.lines):
        if index in cut.dropped:
            continue
        found = line_markers(line)
        if not found:
            continue
        if not set(found) <= HARD_LIMIT_NAMES:
            cut.drop(index, "G6")
        elif line.startswith("|"):
            cut.drop(index, "G7")
        else:
            kept = redact_sentences(line)
            if kept is None or line_markers(kept):
                cut.drop(index, "G7")
            else:
                cut.shorten(index, kept, "G7")
    return cut, _finish(cut, GDD_SLICE, cut.kept())


def _read(root, relpath):
    try:
        with open(os.path.join(root, relpath), "r", encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        raise CutError(relpath, None, "required source file is missing")


def build(root):
    """{slice path: text} and {source path: {rule: source line numbers}}.
    Raises CutError before anything is written."""
    reveals, reveals_text = cut_reveals(_read(root, REVEALS_SOURCE))
    gdd, gdd_text = cut_gdd(_read(root, GDD_SOURCE))
    return ({REVEALS_SLICE: reveals_text, GDD_SLICE: gdd_text},
            {REVEALS_SOURCE: reveals.by_rule(), GDD_SOURCE: gdd.by_rule(),
             GDD_SOURCE + " (kept in part)": gdd.by_rule(shortened=True)})


def write(root, outputs):
    """Every file reaches a temporary path first, so a failed write leaves the
    existing slices as they were."""
    staged = []
    try:
        for relpath, text in outputs.items():
            path = os.path.join(root, relpath)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path + ".tmp", "w", encoding="utf-8") as fh:
                fh.write(text)
            staged.append(path)
    except OSError:
        for path in staged:
            os.remove(path + ".tmp")
        raise
    for path in staged:
        os.replace(path + ".tmp", path)


def main(argv):
    root = os.path.dirname(os.path.dirname(HERE))
    if "--root" in argv:
        root = argv[argv.index("--root") + 1]
    try:
        outputs, removed = build(root)
    except CutError as error:
        sys.stderr.write("FAIL cut %s\nNothing was written.\n" % error)
        return 1
    write(root, outputs)
    for relpath in outputs:
        print("wrote %s" % relpath)
    if "--explain" in argv:
        for source, rules in removed.items():
            for rule, lines in sorted(rules.items()):
                print("%s %s %d lines: %s" % (source, rule, len(lines),
                                              " ".join(str(n) for n in lines)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
