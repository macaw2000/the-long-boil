"""Check: house style for storylets and letters (work order 015, scope 6).

For every storylet and letter:

- the description is at most 120 words, each option label at most 25, and
  each outcome's text at most 150 (docs/canon/style.md, Limits; a word is a
  whitespace-separated run, the same count as the schema keyword maxWords);
- no description, label or outcome text contains a banned word or phrase.
  The banned list is every double-quoted string in the "## Banned" section
  of docs/canon/style.md, read at run time so the list cannot drift from
  canon, plus "the player" (style.md, Voice: "You", never "the player").

A banned phrase matches case-insensitively, as whole words (letters may not
touch either end), with any run of whitespace between its words. It matches
the phrase as written, not its inflections: "delve" does not catch "delved".

Work order 021, part 1: the same rules cover the first-session guide
(guide/*, content/guide/first_session.json). Each step's line is at most 40
words and its button at most 4, and neither contains a banned word or phrase.
The speaker is not checked.

Files are read leniently: a field that is missing or not a string is the
schema check's to report. Fails when style.md cannot be read or its Banned
section lists nothing. "Any sentence that explains its own joke" is not a
string and is left to the inspector.

Usage: python3 scripts/validate/check_style.py [--root DIR]
"""

import os
import re
import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402
import story  # noqa: E402

CHECK = "style"

# docs/canon/style.md, Limits.
DESCRIPTION_MAX_WORDS = 120
LABEL_MAX_WORDS = 25
OUTCOME_MAX_WORDS = 150

# Work order 021, part 1: "a word limit of 40 for a line and 4 for a button".
GUIDE_LINE_MAX_WORDS = 40
GUIDE_BUTTON_MAX_WORDS = 4
GUIDE_LIMITS = {"line": GUIDE_LINE_MAX_WORDS, "button": GUIDE_BUTTON_MAX_WORDS}

# docs/canon/style.md, Voice; work order 015, scope 6.
ALWAYS_BANNED = ("the player",)


def banned_phrases(root):
    """Returns (phrases, error)."""
    try:
        with open(os.path.join(root, story.STYLE_PATH), "r", encoding="utf-8") as fh:
            text = fh.read()
    except OSError as exc:
        return None, "cannot be read: %s" % (exc.strerror or exc.__class__.__name__)
    except UnicodeDecodeError as exc:
        return None, "is not UTF-8: %s" % exc
    match = re.search(r"^## Banned[ \t]*$(.*?)(?=^## |\Z)", text, re.M | re.S)
    if not match:
        return None, "has no \"## Banned\" section"
    found = [p.strip() for p in re.findall(r'"([^"\n]+)"', match.group(1)) if p.strip()]
    if not found:
        return None, "its \"## Banned\" section lists no quoted word or phrase"
    out = []
    for phrase in found + list(ALWAYS_BANNED):
        if phrase.lower() not in [p.lower() for p in out]:
            out.append(phrase)
    return out, None


def _pattern(phrase):
    words = [re.escape(w) for w in phrase.split()]
    return re.compile(r"(?<![A-Za-z])" + r"\s+".join(words) + r"(?![A-Za-z])", re.I)


def _fields(data):
    """(pointer, text, word limit) for each prose field, leniently."""
    out = []
    if isinstance(data.get("description"), str):
        out.append(("/description", data["description"], DESCRIPTION_MAX_WORDS))
    for index, option in story.options(data):
        if isinstance(option.get("label"), str):
            out.append(("/options/%d/label" % index, option["label"], LABEL_MAX_WORDS))
        for key, outcome in story.outcomes(option):
            if isinstance(outcome.get("text"), str):
                out.append(("/options/%d/%s/text" % (index, key), outcome["text"],
                            OUTCOME_MAX_WORDS))
    return out


def _check_text(report, path, ident, pointer, text, limit, patterns):
    words = len(text.split())
    if words > limit:
        report.fail("too-long", path, "%s has %d words; at most %d allowed"
                    % (pointer, words, limit), ident)
    for phrase, pattern in patterns:
        hit = pattern.search(text)
        if hit:
            report.fail("banned", path, "%s contains %r (banned: %r)"
                        % (pointer, hit.group(0), phrase), ident)


def run(root):
    report = lib.Report(CHECK)
    phrases, error = banned_phrases(root)
    if error:
        report.fail("style-unreadable", story.STYLE_PATH, error)
        return report
    patterns = [(p, _pattern(p)) for p in phrases]
    files = story.story_files(root)
    fields = 0
    for path, data in files:
        ident = story.file_id(data)
        for pointer, text, limit in _fields(data):
            fields += 1
            _check_text(report, path, ident, pointer, text, limit, patterns)
    guides = story.guide_files(root)
    for path, data in guides:
        ident = story.file_id(data)
        for pointer, text, field in story.guide_prose_fields(data):
            fields += 1
            _check_text(report, path, ident, pointer, text, GUIDE_LIMITS[field], patterns)
    storylets, letters = story.count_kinds(files)
    report.note("%d storylet file(s), %d letter file(s), %d guide file(s), %d prose field(s); "
                "banned: %s%s"
                % (storylets, letters, len(guides), fields, ", ".join(repr(p) for p in phrases),
                   "; nothing to check" if not files and not guides else ""))
    return report


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
