"""Check: references (work order 003, scope 3; extended by work order 007,
scope 3).

Every item an action names, in its inputs or its outputs, must be the id of
an item defined in an item file under content/items/ (an entry of a file's
"items" list). An id that exists anywhere else in the tree, an action's id for
instance, does not count.

Work order 007: every monster a drop table names (drops/*) must be the id of a
monster defined in a monster file under content/monsters/ (an entry of a
file's "monsters" list), and every item it names, in a table's entries or
first_kill or in the file's zone_pity, must be an item as above. Every item
an economy file (tuning.economy/*) lists under "items" must be an item as
above.

Work order 010 (Jeremy's answer to its hand-back): every item a gear file
(gear/*) names in an entry's "item" must be an item as above.

Work order 013: every item the starting inventory (start/*) names in an
"inventory" stack must be an item as above.

Work order 021, part 1 ("add the file to the provenance and references
checks as any content file"): the first-session guide (guide/*) names no
item, monster or other content id; its step ids are its own. It is counted
here, and has no references to check.

Work order 022, part 1: every item a Work Order (work_order/*) asks for, in
an "asks" entry's "item", must be an item as above.

Work order 024, section 4: the item a Ledger Page (ledger_page/*) names in
"item" must be an item as above, and no two pages may name the same item
(duplicate-page: each Ledger Page item has at most one text).

Ids are collected leniently: an item or monster file with shape errors still
contributes the ids it has, and an action, drop or economy file with shape
errors still has its references checked. The schema check reports the shape
errors themselves.

Usage: python3 scripts/validate/check_references.py [--root DIR]
"""

import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402

CHECK = "references"

ITEMS_DIR = "content/items/"
ITEM_SCHEMA_PREFIX = "item/"
ACTION_SCHEMA_PREFIX = "action/"
MONSTERS_DIR = "content/monsters/"
MONSTER_SCHEMA_PREFIX = "monster/"
DROPS_SCHEMA_PREFIX = "drops/"
ECONOMY_SCHEMA_PREFIX = "tuning.economy/"
GEAR_SCHEMA_PREFIX = "gear/"
START_SCHEMA_PREFIX = "start/"
GUIDE_SCHEMA_PREFIX = "guide/"
WORK_ORDER_SCHEMA_PREFIX = "work_order/"
LEDGER_SCHEMA_PREFIX = "ledger_page/"


def _declared(data):
    declared = data.get("schema") if isinstance(data, dict) else None
    return declared if isinstance(declared, str) else ""


def _entries(data, key):
    """The dicts in data[key], with their index, if data[key] is a list."""
    value = data.get(key) if isinstance(data, dict) else None
    if not isinstance(value, list):
        return []
    return [(i, e) for i, e in enumerate(value) if isinstance(e, dict)]


def _defined_ids(root, directory, prefix, key):
    out = {}
    for path in lib.content_files(root):
        if not path.startswith(directory):
            continue
        data, error = lib.load_json(root, path)
        if error or not _declared(data).startswith(prefix):
            continue
        for _index, entry in _entries(data, key):
            ident = entry.get("id")
            if isinstance(ident, str):
                out.setdefault(ident, path)
    return out


def item_ids(root):
    """{item id: path} for every item in an item file under content/items/."""
    return _defined_ids(root, ITEMS_DIR, ITEM_SCHEMA_PREFIX, "items")


def monster_ids(root):
    """{monster id: path} for every monster in a monster file under
    content/monsters/."""
    return _defined_ids(root, MONSTERS_DIR, MONSTER_SCHEMA_PREFIX, "monsters")


def _unknown_item(report, path, pointer, named, ident):
    report.fail("unknown-item", path,
                "%s names %r, which no item file under %s defines"
                % (pointer, named, ITEMS_DIR), ident)


def check_drops(report, path, data, items, monsters):
    """Returns the number of references checked in one drops/* file."""
    references = 0
    for index, table in _entries(data, "tables"):
        named = table.get("monster")
        ident = named if isinstance(named, str) else None
        if isinstance(named, str):
            references += 1
            if named not in monsters:
                report.fail("unknown-monster", path,
                            "/tables/%d/monster names %r, which no monster file "
                            "under %s defines" % (index, named, MONSTERS_DIR), ident)
        for slot, entry in _entries(table, "entries"):
            item = entry.get("item")
            if not isinstance(item, str):
                continue  # the schema check reports this
            references += 1
            if item not in items:
                _unknown_item(report, path, "/tables/%d/entries/%d/item" % (index, slot),
                              item, ident)
        first = table.get("first_kill")
        for slot, item in enumerate(first if isinstance(first, list) else []):
            if not isinstance(item, str):
                continue
            references += 1
            if item not in items:
                _unknown_item(report, path, "/tables/%d/first_kill/%d" % (index, slot),
                              item, ident)
    file_id = data.get("id") if isinstance(data.get("id"), str) else None
    for slot, entry in _entries(data, "zone_pity"):
        item = entry.get("item")
        if not isinstance(item, str):
            continue
        references += 1
        if item not in items:
            _unknown_item(report, path, "/zone_pity/%d/item" % slot, item, file_id)
    return references


def check_economy(report, path, data, items):
    """Returns the number of references checked in one tuning.economy/* file."""
    listed = data.get("items") if isinstance(data, dict) else None
    if not isinstance(listed, dict):
        return 0
    for item in listed:
        if item not in items:
            _unknown_item(report, path, "/items/%s" % lib.escape_pointer_token(item),
                          item, item)
    return len(listed)


def check_gear(report, path, data, items):
    """Returns the number of references checked in one gear/* file."""
    references = 0
    for index, entry in _entries(data, "gear"):
        item = entry.get("item")
        if not isinstance(item, str):
            continue  # the schema check reports this
        references += 1
        if item not in items:
            _unknown_item(report, path, "/gear/%d/item" % index, item, item)
    return references


def check_start(report, path, data, items):
    """Returns the number of references checked in one start/* file."""
    references = 0
    for index, stack in _entries(data, "inventory"):
        item = stack.get("item")
        if not isinstance(item, str):
            continue  # the schema check reports this
        references += 1
        if item not in items:
            _unknown_item(report, path, "/inventory/%d/item" % index, item, item)
    return references


def check_work_order(report, path, data, items):
    """Returns the number of references checked in one work_order/* file."""
    references = 0
    ident = data.get("id") if isinstance(data.get("id"), str) else None
    for index, stack in _entries(data, "asks"):
        item = stack.get("item")
        if not isinstance(item, str):
            continue  # the schema check reports this
        references += 1
        if item not in items:
            _unknown_item(report, path, "/asks/%d/item" % index, item, ident)
    return references


def check_ledger_page(report, path, data, items, pages):
    """Returns the number of references checked in one ledger_page/* file.
    pages collects {item id: [(path, page id)]} for the duplicate rule."""
    ident = data.get("id") if isinstance(data.get("id"), str) else None
    item = data.get("item")
    if not isinstance(item, str):
        return 0  # the schema check reports this
    pages.setdefault(item, []).append((path, ident))
    if item not in items:
        _unknown_item(report, path, "/item", item, ident)
    return 1


def check_duplicate_pages(report, pages):
    for item in sorted(pages):
        named = pages[item]
        if len(named) < 2:
            continue
        listed = ", ".join("%s (%s)" % (ident, path) for path, ident in named)
        for path, ident in named:
            report.fail("duplicate-page", path,
                        "/item names %r, which %d Ledger Pages name: %s; an item has at most "
                        "one page" % (item, len(named), listed), ident)


def run(root):
    report = lib.Report(CHECK)
    items = item_ids(root)
    monsters = monster_ids(root)
    action_files = 0
    references = 0
    drop_files = drop_refs = economy_files = economy_refs = 0
    gear_files = gear_refs = 0
    start_files = start_refs = 0
    guide_files = 0
    order_files = order_refs = 0
    page_files = page_refs = 0
    pages = {}
    for path in lib.content_files(root):
        data, error = lib.load_json(root, path)
        if error:
            continue
        declared = _declared(data)
        if declared.startswith(DROPS_SCHEMA_PREFIX):
            drop_files += 1
            drop_refs += check_drops(report, path, data, items, monsters)
            continue
        if declared.startswith(ECONOMY_SCHEMA_PREFIX):
            economy_files += 1
            economy_refs += check_economy(report, path, data, items)
            continue
        if declared.startswith(GEAR_SCHEMA_PREFIX):
            gear_files += 1
            gear_refs += check_gear(report, path, data, items)
            continue
        if declared.startswith(START_SCHEMA_PREFIX):
            start_files += 1
            start_refs += check_start(report, path, data, items)
            continue
        if declared.startswith(GUIDE_SCHEMA_PREFIX):
            guide_files += 1
            continue
        if declared.startswith(WORK_ORDER_SCHEMA_PREFIX):
            order_files += 1
            order_refs += check_work_order(report, path, data, items)
            continue
        if declared.startswith(LEDGER_SCHEMA_PREFIX):
            page_files += 1
            page_refs += check_ledger_page(report, path, data, items, pages)
            continue
        if not declared.startswith(ACTION_SCHEMA_PREFIX):
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
    report.note("%d drop file(s), %d monster and item reference(s), %d monster(s) "
                "defined; %d economy file(s), %d item reference(s)"
                % (drop_files, drop_refs, len(monsters), economy_files, economy_refs))
    report.note("%d gear file(s), %d item reference(s)" % (gear_files, gear_refs))
    report.note("%d start file(s), %d item reference(s)" % (start_files, start_refs))
    report.note("%d guide file(s), no references to check" % guide_files)
    report.note("%d Work Order file(s), %d item reference(s)" % (order_files, order_refs))
    check_duplicate_pages(report, pages)
    report.note("%d Ledger Page file(s), %d item reference(s)" % (page_files, page_refs))
    return report


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
