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

Files are read leniently, not through their schema, so a layer the schema
also rejects (4 or 5) is still reported here as a breach. A story file whose
act or reveal_layer is missing or not a whole number fails as not-checkable:
the guard never passes a file it could not check.

Usage: python3 scripts/validate/check_reveal.py [--root DIR]
"""

import re
import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

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


def _word_pattern(forms):
    alternatives = "|".join(re.escape(f) for f in sorted(forms, key=len, reverse=True))
    return re.compile(r"(?<![A-Za-z])(?:%s)(?![A-Za-z])" % alternatives, re.I)


WORD_GUARDS = [(act, _word_pattern(forms), source, limit)
               for act, forms, source, limit in REVEAL_WORDS]


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _check_words(report, path, ident, fields, act):
    for earliest, pattern, source, limit in WORD_GUARDS:
        if act >= earliest:
            continue
        for pointer, text in fields:
            for hit in sorted({m.group(0) for m in pattern.finditer(text)}):
                report.fail("reveal-word", path,
                            "%s contains %r, which may not appear before act %d; this file "
                            "is act %d (%s: \"%s\")"
                            % (pointer, hit, earliest, act, source, limit), ident)


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
    storylets, letters = story.count_kinds(files)
    report.note("%d storylet file(s), %d letter file(s), %d guide file(s) as act %d, "
                "%d Work Order file(s); reveal words: %s%s"
                % (storylets, letters, len(guides), story.GUIDE_ACT, len(orders),
                   "; ".join("%s before act %d" % ("/".join(forms), act)
                             for act, forms, _s, _l in REVEAL_WORDS),
                   "; nothing to check" if not files and not guides and not orders else ""))
    return report


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
