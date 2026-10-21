"""The one command: run every validator.

    python3 scripts/validate/run.py

Step 1 replays every check against its committed fixtures. The pass fixture
must produce no FAIL lines; the fail fixture must produce exactly the FAIL and
WARN lines in its expected.txt. A check whose fixtures misbehave is not
trusted, and the run fails.

Step 2 runs every check against the real content tree and prints each
problem on its own line.

Exit status: 0 when every fixture behaves and every check passes, 1 otherwise.

Options:
  --root DIR            check DIR instead of the repository root (step 2 only)
  --refresh-expected    rewrite each fail fixture's expected.txt from the
                        current output, then exit; read the diff before
                        committing it
"""

import os
import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402
import check_provenance
import check_schema
import check_xp_curve

CHECKS = (
    ("schema", check_schema),
    ("provenance", check_provenance),
    ("xp_curve", check_xp_curve),
)

FIXTURES = os.path.join(lib.HERE, "fixtures")


def _problem_lines(report):
    return sorted(report.fails) + sorted(report.warns)


def self_test(refresh=False):
    problems = []
    for name, module in CHECKS:
        pass_root = os.path.join(FIXTURES, name, "pass")
        fail_root = os.path.join(FIXTURES, name, "fail")
        expected_path = os.path.join(fail_root, "expected.txt")
        for needed in (pass_root, fail_root):
            if not os.path.isdir(needed):
                problems.append("fixture missing: %s" % lib.rel(lib.DEFAULT_ROOT, needed))
        if problems:
            continue

        passed = module.run(pass_root)
        for line in passed.fails:
            problems.append("%s pass fixture failed: %s" % (name, line))

        failed = module.run(fail_root)
        actual = _problem_lines(failed)
        if refresh:
            with open(expected_path, "w", encoding="utf-8") as fh:
                fh.write("\n".join(actual) + "\n")
            continue
        if not failed.fails:
            problems.append("%s fail fixture did not fail" % name)
        try:
            with open(expected_path, "r", encoding="utf-8") as fh:
                expected = [l for l in fh.read().splitlines() if l.strip()]
        except OSError:
            problems.append("%s fail fixture has no expected.txt" % name)
            continue
        for line in sorted(set(expected) - set(actual)):
            problems.append("%s fail fixture no longer reports: %s" % (name, line))
        for line in sorted(set(actual) - set(expected)):
            problems.append("%s fail fixture newly reports: %s" % (name, line))
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
    out.write("fixtures: %s (%d checks, a pass and a fail fixture each)\n"
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
