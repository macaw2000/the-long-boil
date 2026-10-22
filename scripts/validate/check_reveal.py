"""Check: reveal guard (work order 015, scope 5).

Layer 1 belongs to Act I, Layer 2 to Act II and Layer 3 to Act III, so a
storylet's or letter's reveal_layer may not exceed its act (the Prologue is
act 0 and takes layer 0 only). Layers 4 and 5 are never allowed, in any act.

This mapping is the whole of what the guard knows; it does not read the
reveals canon and never needs to.

Files are read leniently, not through their schema, so a layer the schema
also rejects (4 or 5) is still reported here as a breach. A story file whose
act or reveal_layer is missing or not a whole number fails as not-checkable:
the guard never passes a file it could not check.

Usage: python3 scripts/validate/check_reveal.py [--root DIR]
"""

import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402
import story  # noqa: E402

CHECK = "reveal"

# Work order 015, scope 5: layer -> the earliest act it may appear in.
LAYER_ACT = {0: 0, 1: 1, 2: 2, 3: 3}
FORBIDDEN_LAYERS = (4, 5)


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def run(root):
    report = lib.Report(CHECK)
    files = story.story_files(root)
    for path, data in files:
        ident = story.file_id(data)
        act, layer = data.get("act"), data.get("reveal_layer")
        if not _whole(act) or not _whole(layer):
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
    storylets, letters = story.count_kinds(files)
    report.note("%d storylet file(s), %d letter file(s)%s"
                % (storylets, letters, "; nothing to check" if not files else ""))
    return report


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
