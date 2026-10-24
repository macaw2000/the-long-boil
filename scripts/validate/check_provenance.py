"""Check 2: provenance.

Validates content/provenance.json against its declared register schema
(provenance/2; provenance/1 is accepted with a warning during migration), then
fails when:

- validators.result is not one of pass, fail, waived, or null;
- result is "waived" without a waiver, or a waiver is present without "waived";
- a row's file does not exist, or its pointer does not resolve inside it;
- a content id has no row, or more than one row;
- two rows share a path and both have a null pointer.

Content ids are every "id" at any depth in every content file (everything
under content/ except the register), the same set the schema check uses: an
"id" inside a zone economy file's "anchors" or the first-session guide's
"steps" is not one (lib.ID_EXEMPT_KEYS).

Usage: python3 scripts/validate/check_provenance.py [--root DIR]
"""

import os
import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402

CHECK = "provenance"

# provenance/1 is accepted, with a warning, while the registrar migrates
# (work order 002, Constraints). Turned off by Jeremy's answer on work order 002.
ACCEPT_PROVENANCE_1 = False

RESULTS = ("pass", "fail", "waived", None)


def run(root):
    report = lib.Report(CHECK)
    reg_path = lib.REGISTER_PATH
    register, error = lib.load_json(root, reg_path)
    if error:
        report.fail("register-unreadable", reg_path, error)
        return report
    if not isinstance(register, dict):
        report.fail("register-shape", reg_path, "top level must be a JSON object")
        return report

    schemas = lib.load_schemas("register")
    declared = register.get("schema")
    if declared == "provenance/1" and ACCEPT_PROVENANCE_1:
        report.warn("register-version", reg_path,
                    "provenance/1 accepted during migration; move the register "
                    "to provenance/2 (missing fields are read as null)")
    elif declared != "provenance/2":
        report.fail("register-version", reg_path,
                    "schema %r is not accepted; expected provenance/2" % (declared,))
        return report

    for pointer, message in lib.validate(register, schemas[declared]):
        # validators.result gets its own, clearer rule below.
        if pointer.endswith("/validators/result"):
            continue
        report.fail("register-shape", reg_path, "%s: %s" % (pointer, message),
                    _row_id_at(register, pointer))

    rows = register.get("rows")
    if not isinstance(rows, list):
        return report

    # Content ids on disk.
    content_ids = {}
    parsed = {}
    for path in lib.content_files(root):
        data, error = lib.load_json(root, path)
        if error:
            report.fail("content-unreadable", path,
                        "cannot collect ids, %s" % error)
            continue
        parsed[path] = data
        for _pointer, value in lib.content_ids(data):
            if isinstance(value, str):
                content_ids.setdefault(value, set()).add(path)

    rows_by_id = {}
    whole_file_rows = {}
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        rid = row.get("id")
        where = "%s#/rows/%d" % (reg_path, index)
        if isinstance(rid, str):
            rows_by_id.setdefault(rid, []).append(index)

        validators = row.get("validators")
        validators = validators if isinstance(validators, dict) else {}
        result = validators.get("result")
        waiver = validators.get("waiver")
        if result not in RESULTS:
            report.fail("bad-result", where,
                        "validators.result is %r; must be pass, fail, waived or null"
                        % (result,), rid)
        if result == "waived" and waiver is None:
            report.fail("waived-without-waiver", where,
                        "validators.result is \"waived\" but validators.waiver is null "
                        "or missing", rid)
        if waiver is not None and result != "waived":
            report.fail("waiver-without-waived", where,
                        "validators.waiver is set but validators.result is %r" % (result,),
                        rid)

        path = row.get("path")
        pointer = row.get("pointer")
        if not isinstance(path, str):
            continue
        if not os.path.isfile(os.path.join(root, path)):
            report.fail("missing-file", where, "path %r does not exist" % path, rid)
        elif pointer is not None:
            if path in parsed:
                data, load_error = parsed[path], None
            else:
                data, load_error = lib.load_json(root, path)
            if load_error:
                report.fail("pointer-unresolvable", where,
                            "cannot resolve pointer %r: %s" % (pointer, load_error), rid)
            else:
                found = False
                if isinstance(pointer, str):
                    found, _ = lib.resolve_pointer(data, pointer)
                if not found:
                    report.fail("pointer-unresolvable", where,
                                "pointer %r does not resolve inside %s" % (pointer, path),
                                rid)
        _check_revision(report, root, parsed, where, row, path, pointer, rid)
        if pointer is None:
            whole_file_rows.setdefault(path, []).append((index, rid))

    for ident in sorted(content_ids):
        paths = ", ".join(sorted(content_ids[ident]))
        count = len(rows_by_id.get(ident, []))
        if count == 0:
            report.fail("no-row", paths, "content id has no row in the register", ident)
        elif count > 1:
            report.fail("many-rows", paths,
                        "content id has %d rows in the register (rows %s)"
                        % (count, ", ".join(str(i) for i in rows_by_id[ident])),
                        ident)

    for path in sorted(whole_file_rows):
        entries = whole_file_rows[path]
        if len(entries) > 1:
            listed = ", ".join("%s (row %d)" % (rid, i) for i, rid in entries)
            report.fail("shared-path-null-pointer", path,
                        "%d rows point at this whole file with a null pointer: %s"
                        % (len(entries), listed))
    return report


def _content_revision(root, parsed, path, pointer):
    """Revision of what a row points at: the pointed-to object's "revision",
    else the file root's. Returns (known, value); value None means absent."""
    if path in parsed:
        data = parsed[path]
    else:
        data, error = lib.load_json(root, path)
        if error:
            return False, None
    if not isinstance(data, dict):
        return True, None
    if pointer is not None:
        found, target = lib.resolve_pointer(data, pointer) if isinstance(pointer, str) else (False, None)
        if not found:
            return False, None  # pointer-unresolvable already reports this
        if isinstance(target, dict) and "revision" in target:
            return True, target["revision"]
    return True, data.get("revision")


def _check_revision(report, root, parsed, where, row, path, pointer, rid):
    """A row's revision must equal the revision of the content it points at.
    Both absent (null row revision, no revision in the content) is not a
    mismatch; anything else that differs is."""
    if not os.path.isfile(os.path.join(root, path)):
        return
    known, content_rev = _content_revision(root, parsed, path, pointer)
    if not known:
        return
    row_rev = row.get("revision")
    if row_rev != content_rev:
        report.fail("revision-mismatch", where,
                    "row revision is %s; the content at %s%s has revision %s"
                    % (json_text(row_rev), path,
                       "#" + pointer if pointer else "", json_text(content_rev)),
                    rid)


def json_text(value):
    return "null" if value is None else str(value)


def _row_id_at(register, pointer):
    parts = pointer.split("/")
    if len(parts) >= 3 and parts[1] == "rows" and parts[2].isdigit():
        rows = register.get("rows")
        index = int(parts[2])
        if isinstance(rows, list) and index < len(rows) and isinstance(rows[index], dict):
            rid = rows[index].get("id")
            return rid if isinstance(rid, str) else None
    return None


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
