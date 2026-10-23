"""Check: qualities (work order 015, scope 3).

Every quality a storylet or letter reads or changes must be a name listed in
docs/canon/qualities.json, or the id of an item defined in an item file under
content/items/ (check_references.item_ids). Any other name fails. "Reads"
covers the file's requires, each option's requires and each challenge's
quality; "changes" covers every key of every outcome's changes.

Fails as well when an outcome changes a quality whose type
docs/canon/qualities.json says no storylet sets (NOT_SET_BY_STORY below):
set-by-engine-only. A letter is a short storylet and is held to the same rule.

Files are read leniently: a story file that does not match its schema still
has every name it does hold checked (the schema check reports the shape).

Fails as well when the registry cannot be read. No story file is not a
failure: the real tree has none until work order 016.

Usage: python3 scripts/validate/check_qualities.py [--root DIR]
"""

import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402
import story  # noqa: E402
from check_references import ITEMS_DIR, item_ids  # noqa: E402

CHECK = "qualities"

# Quality types no storylet or letter outcome may change, read from each
# type's "set_by" text in docs/canon/qualities.json. The registry has no
# machine-readable field for this; each entry below is a reading of its text.
# "skill" ("the idle loop, never by a storylet") is not listed yet: whether to
# enforce it is an open question for Jeremy.
NOT_SET_BY_STORY = {
    "record": "the engine, never by a storylet",
}


def run(root):
    report = lib.Report(CHECK)
    names, _types, error = story.load_registry(root)
    if error:
        report.fail("registry-unreadable", story.REGISTRY_PATH, error)
        return report
    items = item_ids(root)
    files = story.story_files(root)
    checked = 0
    for path, data in files:
        ident = story.file_id(data)
        for pointer, name, role in story.references(data):
            checked += 1
            if not isinstance(name, str):
                continue  # the schema check reports a non-string challenge quality
            kind = names.get(name)
            if role == "changes" and kind in NOT_SET_BY_STORY:
                report.fail("set-by-engine-only", path,
                            "%s changes %r, a %s quality; %s says it is set by \"%s\""
                            % (pointer, name, kind, story.REGISTRY_PATH,
                               NOT_SET_BY_STORY[kind]), ident)
                continue
            if name in names or name in items:
                continue
            report.fail("unknown-quality", path,
                        "%s %s %r, which is not in %s and is not an item under %s"
                        % (pointer, "reads" if role != "changes" else "changes",
                           name, story.REGISTRY_PATH, ITEMS_DIR), ident)
    storylets, letters = story.count_kinds(files)
    report.note("%d storylet file(s), %d letter file(s), %d quality reference(s)%s"
                % (storylets, letters, checked, "; nothing to check" if not files else ""))
    return report


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
