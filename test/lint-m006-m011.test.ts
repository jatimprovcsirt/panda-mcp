/**
 * M006–M011.
 *
 * Each rule gets a positive, a negative, and — where it could plausibly
 * over-fire — a near-miss. M009 and M011 are project-level: they must stay
 * silent in a repository that has never heard of PANDA, and that is asserted
 * directly rather than assumed.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { scan } from "../src/lint/scanner.js";

const tempRoots: string[] = [];

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "panda-mcp-m6-"));
  tempRoots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return root;
}

function fired(root: string): string[] {
  return scan(root, { includeEnv: false }).findings.map((f) => f.rule);
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

describe("M006 encrypted identity field without a blind index", () => {
  it("fires on an encrypted NIK with no blind index in the file", () => {
    const root = project({
      "app/Models/Citizen.php": `<?php
class Citizen extends Model {
    protected $casts = ['nik' => EncryptedCast::class . ':key-1'];
}`,
    });
    expect(fired(root)).toContain("M006");
  });

  it("does not fire when a blind index is declared", () => {
    const root = project({
      "app/Models/Citizen.php": `<?php
class Citizen extends Model {
    protected $casts = ['nik' => EncryptedCast::class . ':key-1'];
    protected $encryptedFields = ['nik' => ['kid' => 'key-1', 'blind_index' => 'nik_bidx']];
}`,
    });
    expect(fired(root)).not.toContain("M006");
  });

  it("does not fire on a non-identity encrypted field", () => {
    // A health note is encrypted and legitimately has no blind index.
    const root = project({
      "app/Models/Visit.php": `<?php
class Visit extends Model {
    protected $casts = ['catatan_klinis' => EncryptedCast::class . ':key-1'];
}`,
    });
    expect(fired(root)).not.toContain("M006");
  });

  it("does not fire in a file that has no PANDA reference", () => {
    const root = project({
      "app/Models/Citizen.php": "<?php\nclass Citizen extends Model { protected $fillable = ['nik']; }",
    });
    expect(fired(root)).not.toContain("M006");
  });
});

describe("M007 blind index over a low-cardinality field", () => {
  it("fires on a blind index over gender", () => {
    const root = project({
      "app/Models/Citizen.php": `<?php
class Citizen extends Model {
    protected $encryptedFields = ['jenis_kelamin' => ['kid' => 'k', 'blind_index' => true]];
}`,
    });
    expect(fired(root)).toContain("M007");
  });

  it("fires on a _bidx column for a demographic field", () => {
    const root = project({
      "migrations/001.sql": "ALTER TABLE citizens ADD COLUMN agama_bidx VARCHAR(64);",
    });
    expect(fired(root)).toContain("M007");
  });

  it("does not fire on a blind index over a unique identifier", () => {
    // The whole point of a blind index: this is the correct usage.
    const root = project({
      "app/Models/Citizen.php": `<?php
class Citizen extends Model {
    protected $encryptedFields = ['nik' => ['kid' => 'k', 'blind_index' => true]];
}`,
    });
    expect(fired(root)).not.toContain("M007");
  });

  it("does not fire on a geographic name with no person context", () => {
    // `kota` in a logistics schema is a destination, not a residence.
    const root = project({
      "app/Models/Shipment.php": `<?php
class Shipment extends Model {
    protected $encryptedFields = ['kota' => ['kid' => 'k', 'blind_index' => true]];
}`,
    });
    expect(fired(root)).not.toContain("M007");
  });

  it("fires on a geographic field when the file is about people", () => {
    const root = project({
      "app/Models/Penduduk.php": `<?php
class Penduduk extends Model {
    protected $encryptedFields = ['kota' => ['kid' => 'k', 'blind_index' => true]];
    protected $fillable = ['alamat', 'nama'];
}`,
    });
    expect(fired(root)).toContain("M007");
  });
});

describe("M008 local key provider outside development", () => {
  it("fires in a deployment configuration", () => {
    const root = project({
      "deploy/config.yaml": "PANDA_KEY_PROVIDER_DRIVER: local\n",
    });
    expect(fired(root)).toContain("M008");
  });

  it("fires on the JSON form", () => {
    const root = project({
      "config/panda.json": '{ "key_provider_driver": "local" }',
    });
    expect(fired(root)).toContain("M008");
  });

  it("does not fire in .env.example", () => {
    const root = project({ ".env.example": "PANDA_KEY_PROVIDER_DRIVER=local\n" });
    expect(fired(root)).not.toContain("M008");
  });

  it("does not fire on a development-named path", () => {
    const root = project({ "docker-compose.dev.yml": "PANDA_KEY_PROVIDER_DRIVER=local\n" });
    expect(fired(root)).not.toContain("M008");
  });

  it("does not fire on a commented-out line", () => {
    const root = project({
      "deploy/config.yaml": "# PANDA_KEY_PROVIDER_DRIVER: local  (disabled)\n",
    });
    expect(fired(root)).not.toContain("M008");
  });

  it("does not fire when a real provider is configured", () => {
    const root = project({ "deploy/config.yaml": "PANDA_KEY_PROVIDER_DRIVER: vault\n" });
    expect(fired(root)).not.toContain("M008");
  });
});

describe("M009 no audit logging — project level", () => {
  it("fires when PANDA is used and nothing mentions auditing", () => {
    const root = project({
      "src/panda.ts": `import { FieldCipher } from '@jatimprovcsirt/panda-node';
export const cipher = new FieldCipher(provider);`,
    });
    expect(fired(root)).toContain("M009");
  });

  it("does not fire when auditing appears anywhere in the project", () => {
    const root = project({
      "src/panda.ts": `import { FieldCipher } from '@jatimprovcsirt/panda-node';
export const cipher = new FieldCipher(provider, new AuditLogger());`,
    });
    expect(fired(root)).not.toContain("M009");
  });

  it("stays silent in a project that has never heard of PANDA", () => {
    const root = project({ "src/index.ts": "export const add = (a: number, b: number) => a + b;" });
    expect(fired(root)).not.toContain("M009");
  });
});

describe("M010 column sized for plaintext", () => {
  it("fires on a small VARCHAR for an identity field", () => {
    const root = project({ "migrations/001.sql": "ALTER TABLE citizens ADD COLUMN nik VARCHAR(16);" });
    expect(fired(root)).toContain("M010");
  });

  it("fires on a Laravel string column with a length", () => {
    const root = project({
      "database/migrations/x.php": "$table->string('nik', 16)->nullable();",
    });
    expect(fired(root)).toContain("M010");
  });

  it("does not fire on TEXT", () => {
    const root = project({ "migrations/001.sql": "ALTER TABLE citizens ADD COLUMN nik TEXT;" });
    expect(fired(root)).not.toContain("M010");
  });

  it("does not fire on an unrelated small column", () => {
    const root = project({ "migrations/001.sql": "ALTER TABLE products ADD COLUMN sku VARCHAR(16);" });
    expect(fired(root)).not.toContain("M010");
  });
});

describe("M011 bundled documentation version drift", () => {
  it("fires when the project's SDK version differs", () => {
    // The bundle covers panda-node 0.5.0.
    const root = project({
      "package.json": '{ "dependencies": { "@jatimprovcsirt/panda-node": "^0.2.0" } }',
    });
    expect(fired(root)).toContain("M011");
  });

  it("does not fire when major.minor match, whatever the range operator", () => {
    const root = project({
      "package.json": '{ "dependencies": { "@jatimprovcsirt/panda-node": "^0.5.0" } }',
    });
    expect(fired(root)).not.toContain("M011");
  });

  it("does not fire in a project with no PANDA dependency", () => {
    const root = project({ "package.json": '{ "dependencies": { "express": "^4.0.0" } }' });
    expect(fired(root)).not.toContain("M011");
  });
});
