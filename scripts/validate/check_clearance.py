"""Check: the Layer 1 reading copies are current and clean (Decision 28,
docs/first-day-plan.md).

scripts/canon/cut_clearance.py generates docs/canon/slices/reveals-layer1.md and
docs/canon/slices/gdd-cleared.md. For each one this check fails when:

- missing: the file is not there;
- no-header: it does not open with the generated-file header;
- stale: it differs from what the cut produces now, so its source or the cut
  rules changed and nobody regenerated it, or someone edited it by hand;
- above-layer-1: it carries a marker for anything above Layer 1. This runs on
  the file as committed, whatever the cut can do, so a hand edit cannot hide;
- cut-failed: the cut itself cannot run, because a marker it relies on has gone
  from the source.

Lines here give line numbers and marker names, never the text: this check's
output reaches agents cleared for less than the source files hold.

Usage: python3 scripts/validate/check_clearance.py [--root DIR]
"""

import os
import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402

sys.path.insert(0, os.path.join(os.path.dirname(lib.HERE), "canon"))

import cut_clearance  # noqa: E402

CHECK = "clearance"
REGENERATE = "run python3 scripts/canon/cut_clearance.py"


def _first_difference(left, right):
    left, right = left.split("\n"), right.split("\n")
    for number, (a, b) in enumerate(zip(left, right), 1):
        if a != b:
            return number
    return min(len(left), len(right)) + 1


def run(root):
    report = lib.Report(CHECK)
    try:
        fresh, _removed = cut_clearance.build(root)
    except cut_clearance.CutError as error:
        fresh = None
        report.fail("cut-failed", error.path,
                    "line %s: %s" % (error.line or "-", error.message))
    for relpath in cut_clearance.SLICES:
        try:
            with open(os.path.join(root, relpath), "r", encoding="utf-8") as fh:
                text = fh.read()
        except OSError:
            report.fail("missing", relpath, "the generated file is missing; " + REGENERATE)
            continue
        if cut_clearance.GENERATED_LINE not in text.split("\n")[:3]:
            report.fail("no-header", relpath, "the generated-file header is missing; " + REGENERATE)
        for number, marker in cut_clearance.scan(text):
            report.fail("above-layer-1", relpath, "line %d carries marker %s" % (number, marker))
        if fresh is not None and text != fresh[relpath]:
            report.fail("stale", relpath, "differs from a fresh cut from line %d; %s"
                        % (_first_difference(text, fresh[relpath]), REGENERATE))
    report.note("%d generated file(s) checked against a fresh cut" % len(cut_clearance.SLICES))
    return report


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
