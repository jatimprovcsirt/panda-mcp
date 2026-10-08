/**
 * Scaffold engine.
 *
 * Dispatches to a per-stack template. Returns a proposal; never writes. See
 * ./types.ts for why.
 */

import { djangoScaffold } from "./templates/django.js";
import { goScaffold } from "./templates/go.js";
import { laravelScaffold } from "./templates/laravel.js";
import { nodeScaffold } from "./templates/node.js";
import { blindIndexColumnFor } from "./types.js";
import type { KeyProvider, Stack } from "../content/types.js";
import { REVIEW_NOTE, envProposal, migrationNotes } from "./templates/common.js";
import type { ProposedFile, ScaffoldRequest, ScaffoldResult } from "./types.js";

/** Stacks with a full template. Everything else gets the generic shape. */
export const TEMPLATED_STACKS: readonly Stack[] = [
  "laravel",
  "django",
  "nestjs",
  "express",
  "node",
  "go",
];

/**
 * Where to read the integration guide for stacks without a template.
 *
 * Rather than invent an API for a framework this generator has not been
 * written against, it says so and points at the documentation. A plausible
 * looking snippet for CodeIgniter that does not match the real class would be
 * worse than no snippet — it is the exact failure this server exists to
 * prevent, and it would be self-inflicted.
 */
const GUIDE_HINT: Partial<Record<Stack, string>> = {
  php: "panda-php README — direct FieldCipher usage",
  codeigniter: "panda-php README — CodeIgniter section (`PandaService::fieldCipher()`)",
  python: "panda-py README — direct usage",
  flask: "panda-py README — Flask section (`PandaFlask` extension)",
  fastapi: "panda-py README — FastAPI section (dependency injection)",
  docker: "panda-docker — call the REST service instead of embedding a library",
};

function genericScaffold(request: ScaffoldRequest): ScaffoldResult {
  const entity = request.entity ?? "your_table";
  const kid = request.kid ?? "default-key";
  const searchable = request.fields.filter((f) => f.searchable);

  const migration: ProposedFile = {
    path: `migrations/${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_panda_${entity}.sql`,
    action: "create",
    purpose: `Add blind-index columns and widen encrypted columns on \`${entity}\``,
    content: `-- PANDA encrypted columns for ${entity}. PostgreSQL syntax; adjust for MySQL.

${searchable
  .map(
    (f) => `ALTER TABLE ${entity} ADD COLUMN IF NOT EXISTS ${blindIndexColumnFor(f)} VARCHAR(64);`,
  )
  .join("\n")}

${request.fields
  .map(
    (f) =>
      `-- TEXT, not VARCHAR: an envelope is ~1.4x the plaintext once base64 and the\n` +
      `-- JSON wrapper are counted.\n` +
      `ALTER TABLE ${entity} ALTER COLUMN ${f.name} TYPE TEXT;`,
  )
  .join("\n\n")}

${searchable
  .map(
    (f) =>
      `CREATE INDEX IF NOT EXISTS idx_${entity}_${f.name} ON ${entity} (${blindIndexColumnFor(f)});`,
  )
  .join("\n")}
`,
  };

  return {
    files: [migration, envProposal(request.keyProvider, kid)],
    apisUsed: [],
    notes: [
      REVIEW_NOTE,
      ...migrationNotes(entity, searchable.length > 0),
    ],
    unsupported:
      `No integration template for \`${request.stack}\` yet. The migration and ` +
      `environment configuration above are correct for any stack; the framework ` +
      `wiring is not generated, because inventing an API this generator has not ` +
      `been written against would be worse than generating nothing. ` +
      `Read: ${GUIDE_HINT[request.stack] ?? "the SDK documentation"}.`,
  };
}

export function scaffold(request: ScaffoldRequest): ScaffoldResult {
  if (request.fields.length === 0) {
    return {
      files: [],
      apisUsed: [],
      notes: [
        {
          text:
            "No fields were given, so there is nothing to encrypt. Pass at least " +
            "one field name — and note that naming the protected fields is a " +
            "decision this tool deliberately does not make for you.",
        },
      ],
    };
  }

  switch (request.stack) {
    case "laravel":
      return laravelScaffold(request);
    case "django":
      return djangoScaffold(request);
    case "nestjs":
    case "express":
    case "node":
      return nodeScaffold(request);
    case "go":
      return goScaffold(request);
    default:
      return genericScaffold(request);
  }
}

export type { ScaffoldRequest, ScaffoldResult } from "./types.js";
export { TEMPLATED_STACKS as TEMPLATED };
