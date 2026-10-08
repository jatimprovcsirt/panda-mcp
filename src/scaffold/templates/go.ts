/**
 * Go scaffold.
 *
 * Written against the real API surface in `panda-go`:
 *   - `crypto.NewFieldCipher(keys, auditLogger, telemetryClient)` — the latter
 *     two are nilable and defaulted internally
 *   - `crypto.NewLocalKeyProvider()` / `NewVaultKeyProvider(url, token, mount)`
 *     / `NewInfisicalKeyProvider(...)`
 *   - `cipher.Encrypt(plaintext, kid)` / `Decrypt` / `DecryptRaw`
 *   - `blindindex.Generate(plaintext, key, normalization)`
 *
 * Module: `github.com/jatimprovcsirt/panda-go`
 *
 * Go has no framework integration layer by design — applications call the
 * package directly — so this template emits the wiring as a small package
 * rather than a framework adapter.
 */

import { REVIEW_NOTE, envProposal, migrationNotes } from "./common.js";
import { blindIndexColumnFor } from "../types.js";
import type { ProposedFile, ScaffoldNote, ScaffoldRequest, ScaffoldResult } from "../types.js";

function providerConstructor(request: ScaffoldRequest): { code: string; imports: string } {
  switch (request.keyProvider) {
    case "vault":
      return {
        imports: "",
        code: `	// AppRole credentials come from the environment; see the Vault guide for
	// the mount path and namespace options.
	provider := crypto.NewVaultKeyProvider(
		os.Getenv("PANDA_VAULT_URL"),
		os.Getenv("PANDA_VAULT_TOKEN"),
		envOr("PANDA_VAULT_MOUNT_PATH", "secret"),
	)`,
      };
    case "infisical":
      return {
        imports: "",
        code: `	provider := crypto.NewInfisicalKeyProvider(
		os.Getenv("PANDA_INFISICAL_SITE_URL"),
		os.Getenv("PANDA_INFISICAL_CLIENT_ID"),
		os.Getenv("PANDA_INFISICAL_CLIENT_SECRET"),
		os.Getenv("PANDA_INFISICAL_PROJECT_ID"),
		envOr("PANDA_INFISICAL_ENVIRONMENT", "dev"),
		300,
	)`,
      };
    default:
      return {
        imports: "",
        code: `	// Reads PANDA_KEY_<KID> from the environment. Development only — see the
	// key-provider comparison before shipping this.
	provider := crypto.NewLocalKeyProvider()`,
      };
  }
}

function setupFile(request: ScaffoldRequest, kid: string): ProposedFile {
  const { code } = providerConstructor(request);

  return {
    path: "internal/panda/panda.go",
    action: "create",
    purpose: "Construct the PANDA cipher once and share it across the application",
    content: `// Package panda wires up the PANDA field cipher for this application.
//
// Construct the cipher once at startup and pass it to whatever needs it. Each
// NewFieldCipher call builds its own key cache, so constructing one per request
// means fetching keys from the provider on every request.
package panda

import (
	"os"

	"github.com/jatimprovcsirt/panda-go/crypto"
)

// DefaultKID is the key identifier used when a call site does not name one.
const DefaultKID = "${kid}"

// New builds the field cipher from the environment.
func New() (*crypto.FieldCipher, error) {
${code}

	return crypto.NewFieldCipher(provider, nil, nil), nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
`,
  };
}

function usageFile(request: ScaffoldRequest, entity: string): ProposedFile {
  const searchable = request.fields.filter((f) => f.searchable);

  const example = request.fields[0]?.name ?? "field";
  const exampleExport = toExported(example);

  const blindIndexNote =
    searchable.length > 0
      ? `
// Look up by blind index, never by the envelope column: an equality filter on
// ciphertext never matches.
//
//   idx := blindindex.Generate(value, indexKey, "nik")
//   row := db.QueryRow("SELECT id FROM ${entity} WHERE ${blindIndexColumnFor(searchable[0]!)} = $1", idx)
`
      : "";

  return {
    path: "internal/panda/fields.go",
    action: "manual",
    placement: `Add these to your ${entity} model or repository type.`,
    purpose: `Encrypt and look up ${request.fields.length} field(s) on \`${entity}\``,
    content: `package panda

import (
	"github.com/jatimprovcsirt/panda-go/blindindex"
	"github.com/jatimprovcsirt/panda-go/crypto"
)

// Fields carried encrypted on ${entity}.
//
// Decrypt returns a masked value suitable for an API response or a log.
// DecryptRaw is a separate, audited call — reach for it only when the full
// value is genuinely required.
const (
${request.fields.map((f) => `	Field${toExported(f.name)} = "${f.name}"`).join("\n")}
)

// Set${exampleExport} encrypts and stores a value.
func Set${exampleExport}(cipher *crypto.FieldCipher, plaintext string) (string, error) {
	env, err := cipher.Encrypt([]byte(plaintext), DefaultKID, Field${exampleExport})
	if err != nil {
		return "", err
	}
	return env.ToJSON()
}
${blindIndexNote}`,
  };
}

function toExported(name: string): string {
  return name
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function migrationFile(request: ScaffoldRequest, entity: string): ProposedFile {
  const statements = request.fields
    .flatMap((f) => {
      const lines = [
        `-- Envelope is TEXT, not VARCHAR: roughly 1.4x the plaintext once base64`,
        `-- and the JSON wrapper are counted, and a short VARCHAR truncates silently.`,
        `ALTER TABLE ${entity} ALTER COLUMN ${f.name} TYPE TEXT;`,
      ];
      if (f.searchable) {
        lines.push(
          `CREATE INDEX IF NOT EXISTS idx_${entity}_${f.name} ON ${entity} (${blindIndexColumnFor(f)});`,
        );
      }
      return lines;
    })
    .join("\n\n");

  const addColumns = request.fields
    .filter((f) => f.searchable)
    .map(
      (f) =>
        `ALTER TABLE ${entity} ADD COLUMN IF NOT EXISTS ${blindIndexColumnFor(f)} VARCHAR(64);`,
    )
    .join("\n");

  return {
    path: `migrations/${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_panda_${entity}.sql`,
    action: "create",
    purpose: `Add blind-index columns and widen encrypted columns on \`${entity}\``,
    content: `-- PANDA encrypted columns for ${entity}.
--
-- This is PostgreSQL syntax. MySQL differs on ALTER COLUMN and partial indexes;
-- adjust before running.

${addColumns}

${statements}
`,
  };
}

export function goScaffold(request: ScaffoldRequest): ScaffoldResult {
  const kid = request.kid ?? "default-key";
  const entity = request.entity ?? "your_table";
  const searchable = request.fields.filter((f) => f.searchable);

  const notes: ScaffoldNote[] = [
    REVIEW_NOTE,
    ...migrationNotes(entity, searchable.length > 0),
    {
      text:
        "Construct the cipher once at startup and pass it down. `NewFieldCipher` " +
        "builds a key cache per instance, so calling it per request turns every " +
        "request into a key-provider round trip.",
    },
  ];

  if (searchable.length > 0) {
    notes.push({
      text:
        `The blind index needs its own key, separate from the encryption key. ` +
        `Derive it from your key provider and keep it stable — reindexing every ` +
        `row is the only way to change it.`,
    });
  }

  return {
    files: [
      setupFile(request, kid),
      migrationFile(request, entity),
      usageFile(request, entity),
      envProposal(request.keyProvider, kid),
    ],
    apisUsed: [
      "github.com/jatimprovcsirt/panda-go — crypto.NewFieldCipher",
      "github.com/jatimprovcsirt/panda-go — crypto.NewLocalKeyProvider / NewVaultKeyProvider / NewInfisicalKeyProvider",
      "github.com/jatimprovcsirt/panda-go — blindindex.Generate",
    ],
    notes,
  };
}
