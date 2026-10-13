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


## Licence: MIT to Apache-2.0

Every repository now carries a verbatim Apache License 2.0 and a NOTICE file
naming the copyright holder. Four of the six had no licence file at all, and
`panda-node` had no `license` field in its manifest either — it declared
nothing while listing a `LICENSE` in `files` that did not exist, so what npm
actually published was unlicensed.

Apache-2.0 over MIT for one reason: an express patent grant. MIT is silent on
patents, and this is cryptographic software that other agencies and vendors are
expected to embed in their own systems — the grant, and the retaliation clause
that comes with it, is the part that matters when a third party deploys it.
Apache-2.0 is no less permissive, so nothing about adoption gets harder.

GPL was considered and rejected: copyleft would block exactly the cross-agency
adoption this project exists for, and sit badly with public procurement.

**What is already published does not change.** A licence cannot be altered
retroactively on an artifact that has been released, so panda-py 0.2.1-0.2.3 on
PyPI and panda-php 0.2.1-0.2.2 on Packagist stay MIT, panda-node 0.5.0 on npm
stays unlicensed, and the Go tags through v0.5.1 carry no licence text
either. This applies from the next release of each.

The `LICENSE` file is the canonical text byte-for-byte — verified against its
published SHA-256, `cfc7749b...523d30` — so it stays comparable to every other
copy of it.

## Released

| Version | Date | Commit | What it was |
|---|---|---|---|
| `v0.1.2` | 2026-10-14 | — | Adds the `repository` field. Provenance validation rejects a package whose `repository.url` does not match the repository its workflow ran in. |
| `v0.1.1` | 2026-10-14 | — | M003 could not see a 64-character demo token; the bundled documentation had gone stale; relicensed to Apache-2.0 and set up for OIDC publishing. **Tagged but never published** — `E422`, no `repository` field. |
| `v0.1.0` | 2026-10-12 | `8507e46` | First release. Documentation and validation server for AI coding assistants: documentation search, integration scaffolding, and eleven lint rules (M001–M011). Performs no cryptographic operation and holds no key. |

## 0.1.1 was rejected for having no repository field

The tag is there; nothing was published. The workflow signed its provenance
statement, published it to the transparency log, and then the registry refused
the upload:

    npm error code E422
    npm error 422 Unprocessable Entity
    npm error Error verifying sigstore provenance bundle:
    npm error   Failed to validate repository information:
    npm error   package.json: "repository.url" is "", expected to match
    npm error   "https://github.com/jatimprovcsirt/panda-mcp" from provenance

Provenance is a claim that *this source, in this repository, built this
artifact*, and npm checks that the package agrees about which repository it
comes from. `panda-mcp` never had a `repository` field, so it claimed nothing
and the claim could not be verified.

This only became reachable now: nothing else in the pipeline reads that field,
and without provenance nothing would have compared it. `panda-node` has had one
all along, which is the entire difference between the two releases.

`E422` is also worth recognising. The trusted publisher configuration was
correct throughout — the OIDC exchange succeeded and the provenance statement
was signed and logged before the registry saw the package at all. A failure
this late is about the artifact, not the credential.

## The documentation bundle had gone stale

`npm run check:content` failed on the way to 0.1.1: every one of the six
sources it tracks had moved since the bundle was last built.

    ✗ envelope-format: source revision changed dd13dce → 6d2c079
    ✗ go:              source revision changed 8adad6d → 5835120
    ✗ node:            source revision changed 29075f0 → 01ce148
    ✗ php:             source revision changed e2573c8 → 5bbc044
    ✗ python:          source revision changed 45640c4 → bd9f2d0

That check exists precisely because this package's output is *text about the
SDKs*, and text does not fail to compile when the thing it describes changes.
A stale bundle is a server that answers confidently and wrongly, which is worse
than one that errors.

**Nothing was enforcing it.** `ci.yml` documents why it cannot run there: five
of the six sources are public and could be checked out, but the sixth — the
cross-cutting guides in `docs/` — has no git remote, so the job would be
permanently red, and a permanently red check is one people learn to ignore.
That reasoning is sound. The consequence is that `check:content` is a step a
human is *expected* to run before a release, stated in a comment inside a
workflow file, and the release workflow does not run it either. So it went
stale across the relicence and four SDK commits and nothing said so.

Regenerating is part of this release. Whether the release workflow should run
the check is a real question and not an obvious one: it would have caught this
a release earlier, but it would also let a documentation commit in any of four
other repositories block publishing this one, and only on a machine where all
six are checked out — which is not the runner. Left as it is, but now written
down where the next person will look.

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

## What 0.1.1 fixes

### M003 missed the longer demo token

The M003 rule finds the static demo token in a non-development configuration.
It matched `panda_demo_[a-f0-9]{48}` — 48 only — so a 64-character demo token
was exactly the string the rule exists to find and the one it could not see.
The format allows both lengths; see `panda-spec/token-format.md`.

This is the sixth place in the project where a rule held two definitions, and
the only one where the two copies were a lint rule and the thing it lints.
