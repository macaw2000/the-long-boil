"""Check: references (work order 003, scope 3).

Every item an action names, in its inputs or its outputs, must be the id of
an item defined in an item file under content/items/ (an entry of a file's
"items" list). An id that exists anywhere else in the tree, an action's id for
instance, does not count.

Ids are collected leniently: an item file with shape errors still contributes
the ids it has, and an action file with shape errors still has its references
checked. The schema check reports the shape errors themselves.

Usage: python3 scripts/validate/check_references.py [--root DIR]
"""

import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402

CHECK = "references"

ITEMS_DIR = "content/items/"
ITEM_SCHEMA_PREFIX = "item/"
ACTION_SCHEMA_PREFIX = "action/"


def _declared(data):
    declared = data.get("schema") if isinstance(data, dict) else None
    return declared if isinstance(declared, str) else ""


def _entries(data, key):
    """The dicts in data[key], with their index, if data[key] is a list."""
    value = data.get(key) if isinstance(data, dict) else None
    if not isinstance(value, list):
        return []
    return [(i, e) for i, e in enumerate(value) if isinstance(e, dict)]


def item_ids(root):
    """{item id: path} for every item in an item file under content/items/."""
    out = {}
    for path in lib.content_files(root):
        if not path.startswith(ITEMS_DIR):
            continue
        data, error = lib.load_json(root, path)
        if error or not _declared(data).startswith(ITEM_SCHEMA_PREFIX):
            continue
        for _index, item in _entries(data, "items"):
            ident = item.get("id")
            if isinstance(ident, str):
                out.setdefault(ident, path)
    return out


def run(root):
    report = lib.Report(CHECK)
    items = item_ids(root)
    action_files = 0
    references = 0
    for path in lib.content_files(root):
        data, error = lib.load_json(root, path)
        if error or not _declared(data).startswith(ACTION_SCHEMA_PREFIX):
            continue
        action_files += 1
        for index, action in _entries(data, "actions"):
            ident = action.get("id") if isinstance(action.get("id"), str) else None
            for side in ("inputs", "outputs"):
                for slot, stack in _entries(action, side):
                    named = stack.get("item")
                    if not isinstance(named, str):
                        continue  # the schema check reports this
                    references += 1
                    if named not in items:
                        report.fail(
                            "unknown-item", path,
                            "/actions/%d/%s/%d names %r, which no item file under %s "
                            "defines" % (index, side, slot, named, ITEMS_DIR),
                            ident)
    report.note("%d action file(s), %d item reference(s), %d item(s) defined"
                % (action_files, references, len(items)))
    return report


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
