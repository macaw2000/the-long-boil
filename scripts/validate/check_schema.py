"""Check 1: schema.

- Every file under content/ parses as JSON (the register included).
- Every content file (everything under content/ except the register)
  declares a "schema" string, a schema exists for it, and the file matches it.
- Every "id", at any depth, is unique across the whole content tree, except
  inside a zone economy file's "anchors" (lib.ID_EXEMPT_KEYS, work order 007).
- Item, action, monster and drop files live where work orders 003, 005 and
  007 put them: a file under content/items/ declares item/*, a file under
  content/actions/ declares action/*, a file under content/monsters/ declares
  monster/*, a file under content/drops/ declares drops/*, and none of these
  schemas is declared anywhere else.
- A zone economy file (tuning.economy/*) lives under content/tuning/ (work
  order 007). This rule runs one way only: content/tuning/ also holds the XP
  curve, so not every file there declares tuning.economy/*.

The register's own shape is the provenance check's job, not this one's.

Usage: python3 scripts/validate/check_schema.py [--root DIR]
"""

import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402

CHECK = "schema"

# Work orders 003, 005 and 007: schema family -> the only directory it may
# live in, and the only family that directory may hold.
SCHEMA_HOMES = (
    ("item/", "content/items/"),
    ("action/", "content/actions/"),
    ("monster/", "content/monsters/"),
    ("drops/", "content/drops/"),
)

# Work order 007: schema family -> the only directory it may live in. The
# directory may hold other families too.
SCHEMA_ONLY_IN = (
    ("tuning.economy/", "content/tuning/"),
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


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
