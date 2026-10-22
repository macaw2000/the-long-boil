"""The one command: run every validator.

    python3 scripts/validate/run.py

Step 1 replays every check against its committed fixtures. The pass fixture
must produce no FAIL lines; each fail fixture must produce exactly the FAIL and
WARN lines in its expected.txt. A check has one fail fixture, "fail", and may
have more, "fail-<name>", for failures that cannot share one content tree
(work order 003). A pass fixture may also hold an expected-notes.txt; when it
does, the pass fixture's NOTE lines must be exactly the lines in it, so a
check that only reports figures (work order 007's Crown faucet) still has its
arithmetic pinned. A check whose fixtures misbehave is not trusted, and the run
fails.

Step 2 runs every check against the real content tree and prints each
problem on its own line.

Exit status: 0 when every fixture behaves and every check passes, 1 otherwise.

Options:
  --root DIR            check DIR instead of the repository root (step 2 only)
  --refresh-expected    rewrite each fail fixture's expected.txt, and each
                        existing pass fixture expected-notes.txt, from the
                        current output, then exit; read the diff before
                        committing it
"""

import os
import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402
import check_combat
import check_drops
import check_pacing
import check_provenance
import check_references
import check_schema
import check_xp_curve

CHECKS = (
    ("schema", check_schema),
    ("provenance", check_provenance),
    ("xp_curve", check_xp_curve),
    ("references", check_references),
    ("pacing", check_pacing),
    ("drops", check_drops),
    ("combat", check_combat),
)

FIXTURES = os.path.join(lib.HERE, "fixtures")


def _problem_lines(report):
    return sorted(report.fails) + sorted(report.warns)


def _fail_roots(name):
    """fixtures/<name>/fail, then any fixtures/<name>/fail-<suffix>, sorted."""
    base = os.path.join(FIXTURES, name)
    extra = []
    if os.path.isdir(base):
        extra = sorted(d for d in os.listdir(base)
                       if d.startswith("fail-") and os.path.isdir(os.path.join(base, d)))
    return [os.path.join(base, d) for d in ["fail"] + extra]


def self_test(refresh=False):
    problems = []
    for name, module in CHECKS:
        pass_root = os.path.join(FIXTURES, name, "pass")
        fail_roots = _fail_roots(name)
        missing = [r for r in [pass_root] + fail_roots if not os.path.isdir(r)]
        for needed in missing:
            problems.append("fixture missing: %s" % lib.rel(lib.DEFAULT_ROOT, needed))
        if missing:
            continue

        passed = module.run(pass_root)
        for line in passed.fails:
            problems.append("%s pass fixture failed: %s" % (name, line))
        notes_path = os.path.join(pass_root, "expected-notes.txt")
        if os.path.isfile(notes_path):
            if refresh:
                with open(notes_path, "w", encoding="utf-8") as fh:
                    fh.write("\n".join(passed.notes) + "\n")
            else:
                with open(notes_path, "r", encoding="utf-8") as fh:
                    expected = [l for l in fh.read().splitlines() if l.strip()]
                for line in sorted(set(expected) - set(passed.notes)):
                    problems.append("%s pass fixture no longer notes: %s" % (name, line))
                for line in sorted(set(passed.notes) - set(expected)):
                    problems.append("%s pass fixture newly notes: %s" % (name, line))

        for fail_root in fail_roots:
            label = "%s %s" % (name, os.path.basename(fail_root).replace("-", " ", 1))
            expected_path = os.path.join(fail_root, "expected.txt")
            failed = module.run(fail_root)
            actual = _problem_lines(failed)
            if refresh:
                with open(expected_path, "w", encoding="utf-8") as fh:
                    fh.write("\n".join(actual) + "\n")
                continue
            if not failed.fails:
                problems.append("%s fixture did not fail" % label)
            try:
                with open(expected_path, "r", encoding="utf-8") as fh:
                    expected = [l for l in fh.read().splitlines() if l.strip()]
            except OSError:
                problems.append("%s fixture has no expected.txt" % label)
                continue
            for line in sorted(set(expected) - set(actual)):
                problems.append("%s fixture no longer reports: %s" % (label, line))
            for line in sorted(set(actual) - set(expected)):
                problems.append("%s fixture newly reports: %s" % (label, line))
    return problems


def main(argv):
    if "--refresh-expected" in argv:
        self_test(refresh=True)
        print("expected.txt rewritten for every fail fixture; review the diff")
        return 0

    out = sys.stdout
    out.write("== fixtures\n")
    problems = self_test()
    for line in problems:
        out.write("FAIL fixtures %s\n" % line)
    out.write("fixtures: %s (%d checks, a pass and at least one fail fixture each)\n"
              % ("FAILED" if problems else "behaved as expected", len(CHECKS)))

    root = lib.parse_root(argv)
    status = 1 if problems else 0
    for name, module in CHECKS:
        out.write("== %s\n" % name)
        status |= module.run(root).emit(out)

    out.write("== %s\n" % ("FAILED" if status else "all checks passed"))
    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
