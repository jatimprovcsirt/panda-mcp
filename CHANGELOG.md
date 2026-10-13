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

| Version | Date | What it was |
|---|---|---|
| `0.1.0` | 2026-10-09 | First release. Documentation and validation server for AI coding assistants: documentation search, integration scaffolding, and eleven lint rules. Performs no cryptographic operation and holds no key. |

## Unresolved: this release has no tag

`@jatimprovcsirt/panda-mcp@0.1.0` is published to npm. **This repository has no
tags at all**, so nothing in the git history records that the release happened,
or which commit it was built from.

The practical effect: `npm view @jatimprovcsirt/panda-mcp` and `git log` cannot
be reconciled. Anyone asking "what code is in 0.1.0?" has to guess from the
publish date.

The next release should tag before or alongside publishing. Tagging is not
optional here — npm has no other link back to a commit, and unlike PyPI it does
allow a version to be unpublished, so the temptation to correct a mistake by
re-publishing exists and should be resisted: the fix for a wrong number is a
new number.
