/**
 * Shared pieces every template needs.
 *
 * The env block in particular is written once and reused, because getting it
 * wrong in one stack and right in another is the kind of inconsistency that
 * makes a project's configuration unreadable a year later.
 */

import type { KeyProvider } from "../../content/types.js";
import type { ProposedFile, ScaffoldNote } from "../types.js";

export const KEY_PROVIDER_ENV: Readonly<Record<KeyProvider, string>> = {
  local: [
    "PANDA_KEY_PROVIDER_DRIVER=local",
    "PANDA_DEFAULT_KID=<<KID>>",
    "# 32 random bytes, base64-encoded. Generate with: openssl rand -base64 32",
    "# PANDA_KEY_<<KID>>=<base64-encoded-32-byte-key>",
  ].join("\n"),

  vault: [
    "PANDA_KEY_PROVIDER_DRIVER=vault",
    "PANDA_DEFAULT_KID=<<KID>>",
    "PANDA_VAULT_URL=https://vault.internal:8200",
    "PANDA_VAULT_AUTH_METHOD=approle",
    "PANDA_VAULT_ROLE_ID=",
    "PANDA_VAULT_SECRET_ID=",
    "PANDA_VAULT_MOUNT_PATH=secret",
    "# Set to true only for self-signed certificates in development.",
    "PANDA_VAULT_INSECURE=false",
  ].join("\n"),

  infisical: [
    "PANDA_KEY_PROVIDER_DRIVER=infisical",
    "PANDA_DEFAULT_KID=<<KID>>",
    "PANDA_INFISICAL_SITE_URL=https://app.infisical.com",
    "PANDA_INFISICAL_CLIENT_ID=",
    "PANDA_INFISICAL_CLIENT_SECRET=",
    "PANDA_INFISICAL_PROJECT_ID=",
    "PANDA_INFISICAL_ENVIRONMENT=dev",
  ].join("\n"),
};

/** The env proposal, with the key id substituted. */
export function envProposal(provider: KeyProvider, kid: string): ProposedFile {
  return {
    path: ".env.example",
    action: "append",
    purpose: `PANDA configuration for the ${provider} key provider`,
    content: [
      "",
      "# ---------------------------------------------------------------------------",
      "# PANDA — field-level encryption",
      "# Copy these into your .env and fill in the blank values. Never commit a",
      "# real key: .env is gitignored, .env.example is not.",
      "# ---------------------------------------------------------------------------",
      KEY_PROVIDER_ENV[provider].replaceAll("<<KID>>", kid),
      "",
    ].join("\n"),
  };
}

/**
 * The note every scaffold carries.
 *
 * Not boilerplate — the whole reason this tool returns a proposal rather than
 * writing files is that generated integration code is a starting point, and
 * saying so plainly is more useful than a confident-looking file.
 */
export const REVIEW_NOTE: ScaffoldNote = {
  text:
    "Review every file before writing it. These templates are written against the " +
    "PANDA API surface listed in this response, but they cannot know your project's " +
    "conventions, your existing migrations, or whether the model you are editing " +
    "already encrypts other fields.",
};

export const NO_KEY_NOTE: ScaffoldNote = {
  text:
    "No key material is generated or included. Generate a key with the PANDA CLI " +
    "(`panda init`) or your key provider's own tooling, and store it outside source " +
    "control. A generator that emitted a key would put it in a diff, in a review, " +
    "and in your shell history.",
};

/** SQL column type for an envelope: TEXT, not VARCHAR. */
export function migrationNotes(entity: string, hasBlindIndex: boolean): ScaffoldNote[] {
  const notes: ScaffoldNote[] = [
    {
      text:
        `The encrypted column is TEXT, not VARCHAR. An envelope is roughly 1.4× the ` +
        `plaintext length once base64 and the JSON wrapper are counted, and a VARCHAR ` +
        `that is too short truncates silently at insert time.`,
    },
  ];

  if (hasBlindIndex) {
    notes.push({
      text:
        `The blind index is immutable: it is derived from the value and the key. ` +
        `Choose the key id for ${entity} now — changing it later means re-indexing ` +
        `every row, and rows indexed under a different key will not match.`,
    });
  }

  return notes;
}
