"""Check: reveal guard (work order 015, scope 5).

Layer 1 belongs to Act I, Layer 2 to Act II and Layer 3 to Act III, so a
storylet's or letter's reveal_layer may not exceed its act (the Prologue is
act 0 and takes layer 0 only). Layers 4 and 5 are never allowed, in any act.

The layer mapping does not read the reveals canon and never needs to.

Reveal words (work order 018, "Settled after review"): some reveals have a
word that gives them away before their act. Each entry of REVEAL_WORDS names
the earliest act the word may appear in, the word forms it matches and the
canon hard limit it enforces. A storylet's or letter's prose (description,
option labels, outcome texts) may not contain a guarded form while its act is
below that act. Forms match case-insensitively as whole words (no letter may
touch either end). The canon hard limits are prose, not a quoted list, so the
words live here, each with the line it quotes.

Work order 021, part 1: the first-session guide (guide/*) is checked as act
0. It has no act or reveal_layer field, so only the reveal words apply: no
step's line or button may contain a guarded form whose earliest act is above
0.

Work order 022, part 1 ("No knock words below Act II"): a Work Order
(work_order/*) is checked at its "act". It has no reveal_layer, so only the
reveal words apply, to its request line. An order whose act is missing or not
a whole number fails as not-checkable.

Work order 024, section 4: a Ledger Page (ledger_page/*) has a reveal_layer
and no act. It is checked as belonging to its layer's act (LAYER_ACT), so the
reveal words apply to its title and text at that act: a layer 1 page may not
say "knocking". Layers 4 and 5 fail as for storylets; a reveal_layer that is
missing, not a whole number or not a known layer fails as not-checkable.
Which act a page actually reaches the player in (its item's drop or reward)
is not read here.

Decision 28 (docs/first-day-plan.md): the words a player reads in the client
are checked as act 0, like the guide, because the client shows them from the
first screen. client_text.py finds them: string literals, template text and
JSX text in the client's TypeScript, and the visible text of its public HTML
pages. Comments and code identifiers are not read. A file the lexer cannot
follow fails as not-checkable. These lines give the file and line, not the word
or the quoted limit, and the summary note gives counts, not the word forms:
this output reaches agents cleared for less than the guard knows.

Files are read leniently, not through their schema, so a layer the schema
also rejects (4 or 5) is still reported here as a breach. A story file whose
act or reveal_layer is missing or not a whole number fails as not-checkable:
the guard never passes a file it could not check.

Usage: python3 scripts/validate/check_reveal.py [--root DIR]
"""

import os
import re
import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import client_text  # noqa: E402
import lib  # noqa: E402
import story  # noqa: E402

CHECK = "reveal"

# Work order 015, scope 5: layer -> the earliest act it may appear in.
LAYER_ACT = {0: 0, 1: 1, 2: 2, 3: 3}
FORBIDDEN_LAYERS = (4, 5)

# Work order 018, "Settled after review": (earliest act, word forms, source,
# hard limit quoted).
REVEAL_WORDS = (
    (2, ("knock", "knocks", "knocked", "knocking", "knocker", "knockers"),
     "docs/canon/slices/act1.md, Hard limits for this slice",
     "No Steeped, nothing knocking, no capsules."),
)


# Decision 28: where the player-facing client words live. Every .ts and .tsx
# under CLIENT_DIR's top level and src/, so a new screen is covered without
# being listed, and every .html under public/.
CLIENT_DIR = "engine/packages/client"
CLIENT_REQUIRED = ("src/glossary.ts", "src/Guide.tsx")
CLIENT_ACT = story.GUIDE_ACT


def _word_pattern(forms):
    alternatives = "|".join(re.escape(f) for f in sorted(forms, key=len, reverse=True))
    return re.compile(r"(?<![A-Za-z])(?:%s)(?![A-Za-z])" % alternatives, re.I)


WORD_GUARDS = [(act, _word_pattern(forms), source, limit)
               for act, forms, source, limit in REVEAL_WORDS]


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _check_words(report, path, ident, fields, act, whose=None):
    """whose describes the act the file is checked at; by default "this file
    is act N"."""
    whose = whose or "this file is act %d" % act
    for earliest, pattern, source, limit in WORD_GUARDS:
        if act >= earliest:
            continue
        for pointer, text in fields:
            for hit in sorted({m.group(0) for m in pattern.finditer(text)}):
                report.fail("reveal-word", path,
                            "%s contains %r, which may not appear before act %d; %s "
                            "(%s: \"%s\")"
                            % (pointer, hit, earliest, whose, source, limit), ident)


def run(root):
    report = lib.Report(CHECK)
    files = story.story_files(root)
    for path, data in files:
        ident = story.file_id(data)
        act, layer = data.get("act"), data.get("reveal_layer")
        if not _whole(act):
            report.fail("not-checkable", path,
                        "act is %s and reveal_layer is %s; both must be whole numbers "
                        "for the guard to check this file"
                        % (lib.json.dumps(act), lib.json.dumps(layer)), ident)
            continue
        _check_words(report, path, ident, story.prose_fields(data), act)
        if not _whole(layer):
            report.fail("not-checkable", path,
                        "act is %s and reveal_layer is %s; both must be whole numbers "
                        "for the guard to check this file"
                        % (lib.json.dumps(act), lib.json.dumps(layer)), ident)
            continue
        if layer in FORBIDDEN_LAYERS:
            report.fail("forbidden-layer", path,
                        "reveal_layer %d is never allowed" % layer, ident)
            continue
        if layer not in LAYER_ACT:
            report.fail("not-checkable", path,
                        "reveal_layer %d is not a known layer (0 to 3)" % layer, ident)
            continue
        if layer > act:
            report.fail("too-early", path,
                        "reveal_layer %d belongs to act %d or later; this file is act %d"
                        % (layer, LAYER_ACT[layer], act), ident)
    guides = story.guide_files(root)
    for path, data in guides:
        fields = [(pointer, text) for pointer, text, _f in story.guide_prose_fields(data)]
        _check_words(report, path, story.file_id(data), fields, story.GUIDE_ACT)
    orders = story.work_order_files(root)
    for path, data in orders:
        ident = story.file_id(data)
        act = data.get("act")
        if not _whole(act):
            report.fail("not-checkable", path,
                        "act is %s; it must be a whole number for the guard to check this "
                        "Work Order" % lib.json.dumps(act), ident)
            continue
        _check_words(report, path, ident, story.work_order_prose_fields(data), act)
    pages = story.ledger_files(root)
    for path, data in pages:
        _check_ledger_page(report, path, data)
    # Work order 038: a road section's words are read at its own act, though no stop ahead is ever sent.
    for path, data in story.road_files(root):
        for index, section in story.road_sections(data):
            act = section.get("act")
            if not _whole(act):
                report.fail("not-checkable", path,
                            "/sections/%d act is %s; it must be a whole number for the guard to "
                            "check this section" % (index, lib.json.dumps(act)), story.file_id(data))
                continue
            _check_words(report, path, story.file_id(data),
                         [(pointer, text) for pointer, text, _f in story.road_prose_fields(section, index)], act)
    for path, data in story.email_files(root):
        _check_words(report, path, story.file_id(data),
                     [(pointer, text) for pointer, text, _f in story.email_prose_fields(data)], story.EMAIL_ACT)
    client = _check_client(report, root)
    storylets, letters = story.count_kinds(files)
    report.note("%d storylet file(s), %d letter file(s), %d guide file(s) as act %d, "
                "%d Work Order file(s), %d Ledger Page file(s) at their layer's act, "
                "%s client file(s) as act %d; reveal words: %s%s"
                % (storylets, letters, len(guides), story.GUIDE_ACT, len(orders), len(pages),
                   "no" if client is None else client, CLIENT_ACT,
                   "; ".join("%d form(s) before act %d" % (len(forms), act)
                             for act, forms, _s, _l in REVEAL_WORDS),
                   "; nothing to check"
                   if not files and not guides and not orders and not pages else ""))
    return report


def _client_files(root):
    """Relative paths of the client files that hold player text. None when the
    root has no engine, as a fixture or a content-only root does not."""
    if not os.path.isdir(os.path.join(root, "engine")):
        return None
    base = os.path.join(root, CLIENT_DIR)
    found = []
    for folder, extensions in (("", (".ts", ".tsx")), ("src", (".ts", ".tsx")),
                               ("public", (".html",))):
        walk = [(os.path.join(base, folder), [], None)]
        if folder:
            walk = os.walk(os.path.join(base, folder))
        for here, dirs, names in walk:
            dirs[:] = sorted(d for d in dirs if d != "node_modules")
            if names is None:
                names = os.listdir(here) if os.path.isdir(here) else []
            for name in sorted(names):
                full = os.path.join(here, name)
                if (os.path.isfile(full) and name.endswith(extensions)
                        and not name.endswith(".d.ts") and ".test." not in name):
                    found.append(lib.rel(root, full))
    return found


def _check_client(report, root):
    """Returns how many client files were read, or None if the root has none."""
    paths = _client_files(root)
    if paths is None:
        return None
    for needed in CLIENT_REQUIRED:
        relpath = "%s/%s" % (CLIENT_DIR, needed)
        if relpath not in paths:
            report.fail("not-checkable", relpath, "this client file is missing, so the "
                        "guard no longer knows where the player's words are")
    for relpath in paths:
        with open(os.path.join(root, relpath), "r", encoding="utf-8") as fh:
            source = fh.read()
        try:
            if relpath.endswith(".html"):
                strings = client_text.html_strings(source)
            else:
                strings = client_text.ts_strings(source, relpath.endswith(".tsx"))
        except client_text.LexError as error:
            report.fail("not-checkable", relpath, "line %d: %s, so its strings could not be "
                        "read" % (error.line, error.message))
            continue
        for line, text in strings:
            for number, (earliest, pattern, _source, _limit) in enumerate(WORD_GUARDS, 1):
                if CLIENT_ACT >= earliest:
                    continue
                for match in pattern.finditer(text):
                    report.fail("reveal-word-client", relpath,
                                "line %d: a player-facing string holds a form of guarded word "
                                "%d, which may not appear before act %d; client text is "
                                "checked as act %d"
                                % (line + text.count("\n", 0, match.start()), number,
                                   earliest, CLIENT_ACT))
    return len(paths)


def _check_ledger_page(report, path, data):
    ident = story.file_id(data)
    layer = data.get("reveal_layer")
    if not _whole(layer):
        report.fail("not-checkable", path,
                    "reveal_layer is %s; it must be a whole number for the guard to check "
                    "this Ledger Page" % lib.json.dumps(layer), ident)
        return
    if layer in FORBIDDEN_LAYERS:
        report.fail("forbidden-layer", path, "reveal_layer %d is never allowed" % layer, ident)
        return
    if layer not in LAYER_ACT:
        report.fail("not-checkable", path,
                    "reveal_layer %d is not a known layer (0 to 3)" % layer, ident)
        return
    fields = [(pointer, text) for pointer, text, _f in story.ledger_prose_fields(data)]
    _check_words(report, path, ident, fields, LAYER_ACT[layer],
                 "this page is reveal_layer %d, so it is checked as act %d" % (layer, LAYER_ACT[layer]))


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
