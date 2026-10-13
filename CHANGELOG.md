# Changelog

## Read this before creating a tag

**The version in `package.json` and the git tag must be the same number.**

Before tagging:

1. **Read this file.** It records what has been released and what the next
   number is.
2. Set that number in `package.json`.
3. Commit the version bump on its own, so the tag points at a release-only
   commit.
4. Tag the same number with a `v` prefix — `0.2.0` in `package.json` means
   `v0.2.0` as the tag, never anything else.
5. Push the branch, then the tag.
6. Confirm the release exists: `npm view @jatimprovcsirt/panda-mcp version`
7. Add it to the table below.

## Released

| Version | Date | Commit | What it was |
|---|---|---|---|
| `v0.1.0` | 2026-10-12 | `8507e46` | First release. Documentation and validation server for AI coding assistants: documentation search, integration scaffolding, and eleven lint rules (M001–M011). Performs no cryptographic operation and holds no key. |

## The 0.1.0 tag was added afterwards

`0.1.0` was published to npm on 2026-10-12 without a tag, so for a day nothing
in this repository recorded which commit it came from — `npm view` and `git log`
could not be reconciled.

The tag was added retroactively, on `8507e46`. That is not a guess from the
publish date: **npm records the commit itself**, in the `gitHead` field of the
published version, and it named `8507e4656c2632f1cdfacec6e5887cb9ee590c72`.

```
npm view @jatimprovcsirt/panda-mcp@0.1.0 gitHead
```

Worth knowing for the next release, and for any release in this repository:
`gitHead` is only populated when npm publishes from a clean git checkout. It is
the reason 0.1.0 could be reclaimed at all — and it is not a reason to skip
tagging, because it only tells you where the code came from *after* you have
already published.

## Releasing

1. **Read this file.** It records what has been released and what the next
   number is.
2. Tag **before** publishing, not after. `npm publish` from a clean checkout
   records `gitHead`, but that is a recovery path, not a process.
3. Confirm: `npm view @jatimprovcsirt/panda-mcp version` and `git log` should
   name the same commit.

Unlike PyPI, npm allows a version to be unpublished and republished. Resist it:
the fix for a wrong number is a new number, because anything already installed
from the old one does not change.

## Unreleased — M003 missed the longer demo token

The M003 rule finds the static demo token in a non-development configuration.
It matched `panda_demo_[a-f0-9]{48}` — 48 only — so a 64-character demo token
was exactly the string the rule exists to find and the one it could not see.
The format allows both lengths; see `panda-spec/token-format.md`.

This is the sixth place in the project where a rule held two definitions, and
the only one where the two copies were a lint rule and the thing it lints.
