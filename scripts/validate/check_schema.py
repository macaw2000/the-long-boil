"""Check 1: schema.

- Every file under content/ parses as JSON (the register included).
- Every content file (everything under content/ except the register)
  declares a "schema" string, a schema exists for it, and the file matches it.
- Every "id", at any depth, is unique across the whole content tree, except
  inside a zone economy file's "anchors" (lib.ID_EXEMPT_KEYS, work order 007)
  or the first-session guide's "steps" (work order 021).
- Item, action, monster, drop and gear files live where work orders 003, 005,
  007 and 010 put them: a file under content/items/ declares item/*, a file
  under content/actions/ declares action/*, a file under content/monsters/
  declares monster/* (monster/1 and monster/2 are both accepted, work order
  010), a file under content/drops/ declares drops/*, a file under
  content/gear/ declares gear/*, and none of these schemas is declared
  anywhere else.
- A zone economy file (tuning.economy/*) lives under content/tuning/ (work
  order 007). This rule runs one way only: content/tuning/ also holds the XP
  curve, so not every file there declares tuning.economy/*.
- The starting inventory (start/*) is the one file content/start.json, and
  content/start.json declares start/* (work order 013, scope 2).
- The first-session guide (guide/*) is the one file
  content/guide/first_session.json, that file declares guide/*, and
  content/guide/ holds nothing else (work order 021, part 1).
- Storylets and letters (work order 015): a file under content/storylets/
  declares storylet/*, a file under content/letters/ declares letter/*, and
  neither schema is declared anywhere else. A storylet/1 or letter/1 file
  whose id matches its schema's pattern must also agree with itself: the
  id's first part is "prologue" when act is 0 and "act<N>" when act is N,
  and its second part equals "location" (id-form).
- Work Orders (work order 022, part 1): a file under content/work_orders/
  declares work_order/*, and work_order/* is declared nowhere else. A Work
  Order tuning file (tuning.work_orders/*) lives under content/tuning/. The
  Work Order id-form rule is the work_orders check's.

The register's own shape is the provenance check's job, not this one's.

Usage: python3 scripts/validate/check_schema.py [--root DIR]
"""

import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402

CHECK = "schema"

# Work orders 003, 005, 007, 010, 015, 021 and 022: schema family -> the only directory it may
# live in, and the only family that directory may hold.
SCHEMA_HOMES = (
    ("item/", "content/items/"),
    ("action/", "content/actions/"),
    ("monster/", "content/monsters/"),
    ("drops/", "content/drops/"),
    ("gear/", "content/gear/"),
    ("storylet/", "content/storylets/"),
    ("letter/", "content/letters/"),
    ("guide/", "content/guide/"),
    ("work_order/", "content/work_orders/"),
)

# Work orders 007 and 022: schema family -> the only directory it may live in. The
# directory may hold other families too.
SCHEMA_ONLY_IN = (
    ("tuning.economy/", "content/tuning/"),
    ("tuning.work_orders/", "content/tuning/"),
)

# Work orders 013 and 021: schema family -> the one file it may be, and that file must
# declare it.
SCHEMA_AT_PATH = (
    ("start/", "content/start.json"),
    ("guide/", "content/guide/first_session.json"),
)


def run(root):
    report = lib.Report(CHECK)
    schemas = lib.load_schemas("content")

    # Parse every file, the register included.
    for path in lib.walk_files(root, lib.CONTENT_DIR):
        if path == lib.REGISTER_PATH:
            _, error = lib.load_json(root, path)
            if error:
                report.fail("parse", path, error)

    seen = {}  # id -> list of (path, pointer)
    for path in lib.content_files(root):
        data, error = lib.load_json(root, path)
        if error:
            report.fail("parse", path, error)
            continue
        if not isinstance(data, dict):
            report.fail("not-an-object", path, "top level must be a JSON object")
            continue

        top_id = data.get("id") if isinstance(data.get("id"), str) else None

        declared = data.get("schema")
        if not isinstance(declared, str) or not declared:
            report.fail("no-schema", path, "does not declare a \"schema\" string", top_id)
        elif declared not in schemas:
            report.fail(
                "unknown-schema", path,
                "schema %r is not accepted; known: %s"
                % (declared, ", ".join(sorted(schemas))),
                top_id)
        else:
            for pointer, message in lib.validate(data, schemas[declared]):
                report.fail("shape", path, "%s: %s" % (pointer, message), top_id)
        _check_home(report, path, declared, top_id)
        if declared in ID_FORM_SCHEMAS and declared in schemas:
            _check_id_form(report, path, data, top_id, schemas[declared])

        for pointer, value in lib.content_ids(data):
            if not isinstance(value, str) or not value:
                report.fail("bad-id", path, "%s: id must be a non-empty string" % pointer)
                continue
            seen.setdefault(value, []).append((path, pointer))

    for ident in sorted(seen):
        places = seen[ident]
        if len(places) > 1:
            where = ", ".join("%s#%s" % place for place in places)
            for path in sorted(set(place[0] for place in places)):
                report.fail("duplicate-id", path,
                            "id appears %d times: %s" % (len(places), where), ident)
    return report


# Work order 015, scope 1: "id in act.location.name form".
ID_FORM_SCHEMAS = ("storylet/1", "letter/1")


def act_part(act):
    """The id prefix an act number must have: prologue for 0, else act<N>."""
    return "prologue" if act == 0 else "act%d" % act


def _check_id_form(report, path, data, ident, schema):
    pattern = schema["properties"]["id"]["pattern"]
    if ident is None or not lib.ecma_search(pattern, ident):
        return  # the shape check reports a malformed id
    first, second, _name = ident.split(".")
    act = data.get("act")
    if isinstance(act, int) and not isinstance(act, bool) and first != act_part(act):
        report.fail("id-form", path,
                    "id begins %r but act is %d; it must begin %r"
                    % (first, act, act_part(act)), ident)
    location = data.get("location")
    if isinstance(location, str) and second != location:
        report.fail("id-form", path,
                    "id's location part is %r but location is %r" % (second, location), ident)


def _check_home(report, path, declared, ident):
    declared = declared if isinstance(declared, str) else ""
    for prefix, home in SCHEMA_HOMES:
        in_home = path.startswith(home)
        declares = declared.startswith(prefix)
        if in_home and not declares:
            report.fail("wrong-directory", path,
                        "files under %s must declare %s*; this one declares %r"
                        % (home, prefix, declared or None), ident)
        elif declares and not in_home:
            report.fail("wrong-directory", path,
                        "schema %r belongs under %s" % (declared, home), ident)
    for prefix, home in SCHEMA_ONLY_IN:
        if declared.startswith(prefix) and not path.startswith(home):
            report.fail("wrong-directory", path,
                        "schema %r belongs under %s" % (declared, home), ident)
    for prefix, only in SCHEMA_AT_PATH:
        at_path = path == only
        declares = declared.startswith(prefix)
        if at_path and not declares:
            report.fail("wrong-file", path,
                        "%s must declare %s*; this one declares %r"
                        % (only, prefix, declared or None), ident)
        elif declares and not at_path:
            report.fail("wrong-file", path,
                        "schema %r belongs only in %s" % (declared, only), ident)


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
