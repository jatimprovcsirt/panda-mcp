/**
 * Node.js scaffold — NestJS and Express.
 *
 * Written against the real API surface in `panda-node`, which exports
 * everything from the package root:
 *   - `PandaModule.forRoot({ keyProvider, vault, infisical })`
 *   - `PandaService`
 *   - `decryptBodyFields(cipher, fields)`
 *
 * Package: `@jatimprovcsirt/panda-node`
 */

import { REVIEW_NOTE, envProposal, migrationNotes } from "./common.js";
import { blindIndexColumnFor } from "../types.js";
import type { ProposedFile, ScaffoldNote, ScaffoldRequest, ScaffoldResult } from "../types.js";

function moduleOptions(request: ScaffoldRequest, kid: string): string {
  switch (request.keyProvider) {
    case "vault":
      return `    keyProvider: 'vault',
    vault: {
      url: process.env.PANDA_VAULT_URL!,
      token: process.env.PANDA_VAULT_TOKEN!,
      mountPath: process.env.PANDA_VAULT_MOUNT_PATH ?? 'secret',
    },`;
    case "infisical":
      return `    keyProvider: 'infisical',
    infisical: {
      siteUrl: process.env.PANDA_INFISICAL_SITE_URL!,
      clientId: process.env.PANDA_INFISICAL_CLIENT_ID!,
      clientSecret: process.env.PANDA_INFISICAL_CLIENT_SECRET!,
      projectId: process.env.PANDA_INFISICAL_PROJECT_ID!,
      environment: process.env.PANDA_INFISICAL_ENVIRONMENT ?? 'dev',
    },`;
    default:
      return `    // LocalKeyProvider reads PANDA_KEY_<KID> from the environment.
    // Development only — see the key-provider comparison before shipping this.
    keyProvider: 'local',`;
  }
}

function nestModule(request: ScaffoldRequest, kid: string): ProposedFile {
  return {
    path: "src/panda/panda.module.ts",
    action: "create",
    purpose: "Wire the PANDA cipher into NestJS dependency injection",
    content: `import { Global, Module } from '@nestjs/common';
import { PandaModule, PandaService } from '@jatimprovcsirt/panda-node';

/**
 * Import this once, in AppModule. \`@Global\` means feature modules do not each
 * need to import it — the cipher is constructed once, with one key cache.
 *
 * Inject PandaService where it is needed:
 *
 *   constructor(private readonly panda: PandaService) {}
 */
@Global()
@Module({
  imports: [
    PandaModule.forRoot({
${moduleOptions(request, kid)}
    }),
  ],
  exports: [PandaModule],
})
export class AppPandaModule {}
`,
  };
}

function expressSetup(request: ScaffoldRequest): ProposedFile {
  const bodyFields = request.fields.map((f) => `'${f.name}'`).join(", ");

  return {
    path: "src/panda/cipher.ts",
    action: "create",
    purpose: "Construct the PANDA cipher once, for use in middleware and services",
    content: `import { FieldCipher } from '@jatimprovcsirt/panda-node';

/**
 * Construct the cipher once at module load and share it.
 *
 * Building one per request means a fresh key cache per request, which turns
 * every request into a key-provider round trip.
 */
export const cipher = new FieldCipher(/* key provider from PANDA_KEY_PROVIDER_DRIVER */);

/** Fields decrypted on the way in, as a request-body middleware. */
export const encryptedBodyFields = [${bodyFields}];
`,
  };
}

function expressMiddleware(request: ScaffoldRequest): ProposedFile {
  return {
    path: "src/panda/middleware.ts",
    action: "manual",
    placement: "Register in your Express app, before the routes that read these fields.",
    purpose: "Decrypt the declared fields on incoming requests",
    content: `import { decryptBodyFields } from '@jatimprovcsirt/panda-node';
import { cipher, encryptedBodyFields } from './cipher';

// Values arriving in the body are decrypted before your handler sees them.
// decryptBodyFields uses the masked decrypt, so the handler receives masked
// values unless the full plaintext is explicitly required.
app.use(decryptBodyFields(cipher, encryptedBodyFields));
`,
  };
}

function migrationSql(request: ScaffoldRequest, entity: string): ProposedFile {
  return {
    path: `migrations/${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_panda_${entity}.sql`,
    action: "create",
    purpose: `Add blind-index columns and widen encrypted columns on \`${entity}\``,
    content: `-- PANDA encrypted columns for ${entity}.
--
-- PostgreSQL syntax; adjust for MySQL.

${request.fields
  .filter((f) => f.searchable)
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

${request.fields
  .filter((f) => f.searchable)
  .map(
    (f) =>
      `CREATE INDEX IF NOT EXISTS idx_${entity}_${f.name} ON ${entity} (${blindIndexColumnFor(f)});`,
  )
  .join("\n")}
`,
  };
}

export function nodeScaffold(request: ScaffoldRequest): ScaffoldResult {
  const kid = request.kid ?? "default-key";
  const entity = request.entity ?? "your_table";
  const searchable = request.fields.filter((f) => f.searchable);
  const isNest = request.stack === "nestjs";

  const files: ProposedFile[] = isNest
    ? [nestModule(request, kid)]
    : [expressSetup(request), expressMiddleware(request)];

  files.push(migrationSql(request, entity), envProposal(request.keyProvider, kid));

  const notes: ScaffoldNote[] = [
    REVIEW_NOTE,
    ...migrationNotes(entity, searchable.length > 0),
  ];

  if (isNest) {
    notes.push({
      text:
        "`PandaModule.forRoot` is called once, in a `@Global` module, so the key " +
        "cache is shared. Calling it in a feature module constructs a second " +
        "cipher with its own cache.",
    });
  } else {
    notes.push({
      text:
        "The cipher construction in `cipher.ts` is a placeholder for the provider " +
        "you chose — the SDK's `createKeyProvider` factory takes the driver and " +
        "the provider's options. See `get_setup_guide` for the exact call.",
    });
  }

  if (searchable.length > 0) {
    notes.push({
      text:
        `Look these up by blind index, not by the encrypted column: ` +
        `${searchable.map((f) => `${f.name} → ${blindIndexColumnFor(f)}`).join(", ")}. ` +
        `An equality filter on an envelope never matches.`,
    });
  }

  return {
    files,
    apisUsed: [
      "@jatimprovcsirt/panda-node — PandaModule.forRoot",
      "@jatimprovcsirt/panda-node — PandaService",
      "@jatimprovcsirt/panda-node — decryptBodyFields",
    ],
    notes,
  };
}
