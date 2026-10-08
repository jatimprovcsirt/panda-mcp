/**
 * Laravel scaffold.
 *
 * Written against the real API surface in `panda-php`:
 *   - `Panda\Integrations\Laravel\HasEncryptedFields` trait
 *   - `Panda\Integrations\Laravel\EncryptedCast`, constructed as
 *     `EncryptedCast::class . ':kid'`
 *   - `protected $encryptedFields = ['field' => ['kid' => …, 'blind_index' => true]]`
 *   - blind-index column defaults to `{$field}_bidx`
 *
 * Package: `jatimprovcsirt/panda-php`
 */

import { REVIEW_NOTE, envProposal, migrationNotes } from "./common.js";
import { blindIndexColumnFor, planColumns } from "../types.js";
import type { ProposedFile, ScaffoldNote, ScaffoldRequest, ScaffoldResult } from "../types.js";

function migrationFile(request: ScaffoldRequest, entity: string): ProposedFile {
  const columns = planColumns(request.fields);

  const up = columns
    .map((col) => {
      const lines = [
        `            // TEXT, not VARCHAR: an envelope is ~1.4x the plaintext once`,
        `            // base64 and the JSON wrapper are counted.`,
        `            $table->text('${col.encryptedColumn}')${col.nullable ? "->nullable()" : ""}->change();`,
      ];
      if (col.blindIndexColumn) {
        lines.push(
          `            // Blind index for exact-match lookup. Deterministic, so it must`,
          `            // never be used as the primary storage column.`,
          `            $table->string('${col.blindIndexColumn}', 64)->nullable()->index();`,
        );
      }
      return lines.join("\n");
    })
    .join("\n\n");

  const down = columns
    .filter((col) => col.blindIndexColumn)
    .map((col) => `            $table->dropColumn('${col.blindIndexColumn}');`)
    .join("\n");

  return {
    path: `database/migrations/${timestamp()}_add_panda_encrypted_columns_to_${entity}_table.php`,
    action: "create",
    purpose: `Add the blind-index columns and widen the encrypted columns on \`${entity}\``,
    content: `<?php

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('${entity}', function (Blueprint $table) {
${up}
        });
    }

    public function down(): void
    {
        Schema::table('${entity}', function (Blueprint $table) {
${down}
        });
    }
};
`,
  };
}

function modelSnippet(request: ScaffoldRequest, entity: string, kid: string): ProposedFile {
  const model = entity
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

  const casts = request.fields
    .map((f) => `        '${f.name}' => EncryptedCast::class . ':${kid}',`)
    .join("\n");

  const encryptedFields = request.fields
    .map((f) => {
      const config = [`'kid' => '${kid}'`];
      if (f.searchable) config.push(`'blind_index' => '${blindIndexColumnFor(f)}'`);
      return `        '${f.name}' => [${config.join(", ")}],`;
    })
    .join("\n");

  return {
    path: `app/Models/${model}.php`,
    action: "manual",
    placement: "Add the trait to your model, and both properties to its body.",
    purpose: `Wire \`${model}\` to encrypt ${request.fields.length} field(s)`,
    content: `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;
use Panda\\Integrations\\Laravel\\EncryptedCast;
use Panda\\Integrations\\Laravel\\HasEncryptedFields;

class ${model} extends Model
{
    use HasEncryptedFields;

    /**
     * Decrypted reads go through the cast, which returns a masked value.
     * Reading the full plaintext is a separate, explicitly audited call.
     */
    protected $casts = [
${casts}
    ];

    /**
     * Fields encrypted on save, and which of them also maintain a blind index.
     * The blind-index column name defaults to {field}_bidx when omitted; it is
     * spelled out here so a rename cannot silently break lookups.
     */
    protected $encryptedFields = [
${encryptedFields}
    ];
}
`,
  };
}

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getUTCFullYear()}_${pad(now.getUTCMonth() + 1)}_${pad(now.getUTCDate())}` +
    `_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
  );
}

export function laravelScaffold(request: ScaffoldRequest): ScaffoldResult {
  const entity = request.entity ?? "your_table";
  const kid = request.kid ?? "default-key";
  const searchable = request.fields.filter((f) => f.searchable);

  const notes: ScaffoldNote[] = [
    REVIEW_NOTE,
    ...migrationNotes(entity, searchable.length > 0),
  ];

  if (searchable.length > 0) {
    notes.push({
      text:
        `Look up these fields with the model's whereEncrypted scope rather than a ` +
        `plain where clause — the column holds an envelope, so comparing it to a ` +
        `plaintext value never matches. Searchable: ` +
        `${searchable.map((f) => f.name).join(", ")}.`,
    });
  }

  notes.push({
    text:
      `If \`${entity}\` already holds plaintext in these columns, do not run this ` +
      `migration and stop there. The PANDA migration CLI encrypts existing rows in ` +
      `batches and supports dual-read, so the application keeps working during the ` +
      `backfill. Plaintext left in place will be read as ciphertext and fail.`,
  });

  return {
    files: [
      migrationFile(request, entity),
      modelSnippet(request, entity, kid),
      envProposal(request.keyProvider, kid),
    ],
    apisUsed: [
      "jatimprovcsirt/panda-php — Panda\\Integrations\\Laravel\\HasEncryptedFields",
      "jatimprovcsirt/panda-php — Panda\\Integrations\\Laravel\\EncryptedCast",
      "Blind-index column convention: {field}_bidx",
    ],
    notes,
  };
}
