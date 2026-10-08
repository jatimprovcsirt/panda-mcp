/**
 * Django scaffold.
 *
 * Written against the real API surface in `panda-py`:
 *   - `panda.integrations.django.EncryptedField`, constructed as
 *     `EncryptedField(kid=…)`
 *   - `panda.integrations.django.EncryptedFieldMixin`, providing
 *     `get_decrypted_for_field(field_name)`
 *   - `panda.integrations.django.PandaMiddleware`
 *
 * Package: `panda-crypto-py`
 *
 * Note Django generates its own migrations, so this template does not emit a
 * migration file — it emits the model, and the developer runs `makemigrations`.
 * Emitting a hand-written migration alongside Django's generator would produce
 * two competing sources of schema truth.
 */

import { REVIEW_NOTE, envProposal, migrationNotes } from "./common.js";
import { blindIndexColumnFor } from "../types.js";
import type { ProposedFile, ScaffoldNote, ScaffoldRequest, ScaffoldResult } from "../types.js";

const BIDX_LENGTH = 64;

function modelSnippet(request: ScaffoldRequest, kid: string): ProposedFile {
  const fields = request.fields
    .map((f) => {
      const lines = [`    ${f.name} = EncryptedField(kid="${kid}"${f.nullable ? ", null=True" : ""})`];
      if (f.searchable) {
        lines.push(
          `    # Blind index for exact-match lookup. Deterministic — never treat it`,
          `    # as the primary storage column.`,
          `    ${blindIndexColumnFor(f)} = models.CharField(max_length=${BIDX_LENGTH}, null=True, db_index=True)`,
        );
      }
      return lines.join("\n");
    })
    .join("\n\n");

  return {
    path: "models.py",
    action: "manual",
    placement:
      "In the app's models.py — add EncryptedFieldMixin to the model's bases and " +
      "the fields below to its body.",
    purpose: `Encrypt ${request.fields.length} field(s) on this model`,
    content: `from django.db import models
from panda.integrations.django import EncryptedField, EncryptedFieldMixin


class YourModel(EncryptedFieldMixin, models.Model):
    # EncryptedFieldMixin adds get_decrypted_for_field(name), which returns the
    # masked value. Reading the full plaintext is a separate, audited call.

${fields}
`,
  };
}

function settingsSnippet(request: ScaffoldRequest): ProposedFile {
  const provider = request.keyProvider;

  const config =
    provider === "local"
      ? `# Reads PANDA_KEY_<KID> from the environment. Development only — see the
# key-provider comparison before using this in production.
PANDA_CONFIG = {"key_provider_driver": "local", "default_kid": "<KID>"}`
      : `PANDA_CONFIG = {
    "key_provider_driver": "${provider}",
    "default_kid": "<KID>",
    # Fill in for ${provider}; see the PANDA key-provider guide for the full set.
}`;

  return {
    path: "settings.py",
    action: "append",
    purpose: "Register PANDA in Django settings",
    content: `
# ---------------------------------------------------------------------------
# PANDA
# ---------------------------------------------------------------------------
INSTALLED_APPS = [
    # …existing apps…
    "panda.integrations.django",
]

MIDDLEWARE = [
    # …existing middleware…
    "panda.integrations.django.PandaMiddleware",
]

${config}
`,
  };
}

export function djangoScaffold(request: ScaffoldRequest): ScaffoldResult {
  const kid = request.kid ?? "default-key";
  const searchable = request.fields.filter((f) => f.searchable);
  const entity = request.entity ?? "your_table";

  const notes: ScaffoldNote[] = [
    REVIEW_NOTE,
    ...migrationNotes(entity, searchable.length > 0),
    {
      text:
        "Django generates the schema migration, so this scaffold does not write " +
        "one. Run `python manage.py makemigrations` after editing the model, and " +
        "read the generated migration before applying it — Django will ask whether " +
        "the encrypted column should be altered to TextField.",
    },
  ];

  if (searchable.length > 0) {
    notes.push({
      text:
        `Query these fields through the blind index, not the encrypted column: ` +
        `${searchable.map((f) => `${f.name} (${blindIndexColumnFor(f)})`).join(", ")}. ` +
        `An equality filter on the envelope column never matches.`,
    });
  }

  return {
    files: [modelSnippet(request, kid), settingsSnippet(request), envProposal(request.keyProvider, kid)],
    apisUsed: [
      "panda-crypto-py — panda.integrations.django.EncryptedField",
      "panda-crypto-py — panda.integrations.django.EncryptedFieldMixin",
      "panda-crypto-py — panda.integrations.django.PandaMiddleware",
    ],
    notes,
  };
}
