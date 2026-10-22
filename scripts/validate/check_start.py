"""Check: the starting inventory (work order 013, scope 2).

The starting inventory is the one file content/start.json, declaring
start/1, with the file-level id start.global.inventory: a list of
{item, qty, bound} stacks under "inventory" and a "crowns" integer. Its
shape and its place are the schema check's job, and whether each item exists
is the references check's job. This check reads every content file that
declares start/* and:

- fails it as not-checkable when it is not start/1, or does not match it;
- fails every stack whose item is a Ledger Page (any item id containing
  "ledger_page", the drops check's test): work order 013, "Ledger Pages may
  not appear".

No start file is not a failure: the draftsman writes content/start.json
after work order 013.

Usage: python3 scripts/validate/check_start.py [--root DIR]
"""

import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402
from check_drops import is_ledger_page  # noqa: E402

CHECK = "start"

START_PREFIX = "start/"
START_SCHEMA = "start/1"


def run(root):
    report = lib.Report(CHECK)
    schemas = lib.load_schemas("content")
    files = stacks = 0
    for path in lib.content_files(root):
        data, error = lib.load_json(root, path)
        if error or not isinstance(data, dict):
            continue  # the schema check reports these
        declared = data.get("schema")
        if not isinstance(declared, str) or not declared.startswith(START_PREFIX):
            continue
        files += 1
        ident = data.get("id") if isinstance(data.get("id"), str) else None
        if declared != START_SCHEMA:
            report.fail("not-checkable", path,
                        "schema is %r; only %s can be checked" % (declared, START_SCHEMA),
                        ident)
            continue
        errors = lib.validate(data, schemas[START_SCHEMA])
        if errors:
            report.fail("not-checkable", path,
                        "file does not match %s (%d errors; see the schema check); "
                        "its stacks are not checked" % (START_SCHEMA, len(errors)), ident)
            continue
        for index, stack in enumerate(data["inventory"]):
            stacks += 1
            if is_ledger_page(stack["item"]):
                report.fail("ledger-page", path,
                            "/inventory/%d: %s is a Ledger Page; Ledger Pages may not "
                            "be in the starting inventory" % (index, stack["item"]),
                            stack["item"])
        report.note("%s: %d stack(s), %s starting Crowns"
                    % (path, len(data["inventory"]), data["crowns"]))
    report.note("%d start file(s), %d stack(s)%s"
                % (files, stacks, "; nothing to check" if not files else ""))
    return report


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
