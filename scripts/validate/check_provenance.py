"""Check 2: provenance.

Validates content/provenance.json against its declared register schema
(provenance/3; provenance/2 is accepted with a warning while the registrar
migrates, ACCEPT_PROVENANCE_2), then fails when:

- validators.result is not one of pass, fail, waived, or null;
- result is "waived" without a waiver, or a waiver is present without "waived";
- a row's file does not exist, or its pointer does not resolve inside it;
- a content id has no row, or more than one row;
- two rows share a path and both have a null pointer;
- status is "retired" without a retirement record, or a retirement record is
  present on a row that is not "retired";
- a retired row's last history entry is not its retirement (status "retired",
  same "at" and "by" as the retirement record);
- a retired row's id is reused: any other row carries the same id;
- content on disk carries a retired id.

A retired row keeps its row instead of being erased ("A retired item gets a
status, not an erasure"). Its file and pointer may be gone, so a retired row is
exempt from missing-file, pointer-unresolvable and revision-mismatch, and is
not counted for shared-path-null-pointer (its replacement may take the same
whole file). Every other rule still applies to it.

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

# provenance/2 is accepted, with a warning, while the registrar migrates the
# register to provenance/3 (add "retirement": null to every row, then set
# "schema"). Turn off once content/provenance.json declares provenance/3.
ACCEPT_PROVENANCE_2 = True

CURRENT = "provenance/3"
RETIRED = "retired"

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
                    "to %s (missing fields are read as null)" % CURRENT)
    elif declared == "provenance/2" and ACCEPT_PROVENANCE_2:
        report.warn("register-version", reg_path,
                    "provenance/2 accepted during migration; move the register "
                    "to %s (add \"retirement\": null to every row)" % CURRENT)
    elif declared != CURRENT:
        report.fail("register-version", reg_path,
                    "schema %r is not accepted; expected %s" % (declared, CURRENT))
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
    retired_rows_by_id = {}
    whole_file_rows = {}
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        rid = row.get("id")
        where = "%s#/rows/%d" % (reg_path, index)
        retired = row.get("status") == RETIRED
        if isinstance(rid, str):
            rows_by_id.setdefault(rid, []).append(index)
            if retired:
                retired_rows_by_id.setdefault(rid, []).append(index)
        _check_retirement(report, where, row, retired, rid)

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
        if not isinstance(path, str) or retired:
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

    for ident in sorted(retired_rows_by_id):
        indexes = rows_by_id[ident]
        if len(indexes) > 1:
            report.fail("retired-id-reused", reg_path,
                        "id is retired (row %s) and carried by %d rows (rows %s); "
                        "a retired id is never reused"
                        % (", ".join(str(i) for i in retired_rows_by_id[ident]),
                           len(indexes), ", ".join(str(i) for i in indexes)),
                        ident)

    for ident in sorted(content_ids):
        paths = ", ".join(sorted(content_ids[ident]))
        if ident in retired_rows_by_id:
            report.fail("retired-id-on-disk", paths,
                        "content carries a retired id (row %s); give the item a new id"
                        % ", ".join(str(i) for i in retired_rows_by_id[ident]),
                        ident)
            continue  # retired-id-reused covers any other row with this id
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


def _check_retirement(report, where, row, retired, rid):
    """status "retired" and a retirement record go together, and the record
    matches the row's last history entry."""
    retirement = row.get("retirement")
    if not retired:
        if retirement is not None:
            report.fail("retirement-without-retired", where,
                        "retirement is set but status is %r" % (row.get("status"),), rid)
        return
    if not isinstance(retirement, dict):
        report.fail("retired-without-retirement", where,
                    "status is \"retired\" but retirement is null or missing; "
                    "record at, by and reason", rid)
        return
    history = row.get("history")
    last = history[-1] if isinstance(history, list) and history else None
    if not (isinstance(last, dict) and last.get("status") == RETIRED
            and last.get("at") == retirement.get("at")
            and last.get("by") == retirement.get("by")):
        report.fail("retirement-not-in-history", where,
                    "the last history entry must be the retirement: status \"retired\", "
                    "at %s, by %s" % (json_text(retirement.get("at")),
                                      json_text(retirement.get("by"))), rid)


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
