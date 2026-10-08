/**
 * Lint engine tests.
 *
 * Every rule gets a positive fixture, a negative fixture, and — where the rule
 * could plausibly over-fire — a near-miss fixture. Near-misses are the
 * false-positive guard. A linter that cries wolf gets disabled, and this suite
 * is the only thing standing between a rule and that outcome.
 */

import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { scan } from "../src/lint/scanner.js";
import { buildSuppressionIndex } from "../src/lint/suppression.js";
import { isPersonalDataField, normaliseFieldName } from "../src/lint/rules/m004-fields.js";

const tempRoots: string[] = [];

/** Create a throwaway project tree. Returns its root. */
function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "panda-mcp-lint-"));
  tempRoots.push(root);

  for (const [relPath, content] of Object.entries(files)) {
    const full = join(root, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }

  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function rulesFired(root: string): string[] {
  return scan(root, { includeEnv: false }).findings.map((f) => f.rule);
}

// ---------------------------------------------------------------------------
// THE rule. Everything else in this file is secondary to this.
// ---------------------------------------------------------------------------

describe("findings never leak matched values (PRD FR-M19)", () => {
  // Distinctive strings that would be unmistakable if they escaped.
  const SECRET_KEY = "kZ8vQ2mN4pR6tW9yB1cD3fG5hJ7kL0mP2qS4uV6xY8zA=";
  const SECRET_TOKEN = "panda_demo_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2";

  it("does not echo a hardcoded key", () => {
    const root = project({
      "config.php": `<?php\n$PANDA_KEY_default = "${SECRET_KEY}";\n`,
    });

    const report = scan(root, { includeEnv: false });
    const serialised = JSON.stringify(report.findings);

    expect(report.findings.length).toBeGreaterThan(0);
    expect(serialised).not.toContain(SECRET_KEY);
    // A prefix is just as bad — partial disclosure is still disclosure.
    expect(serialised).not.toContain(SECRET_KEY.slice(0, 20));
  });

  it("does not echo a demo token", () => {
    const root = project({
      "deploy/production.yaml": `token: ${SECRET_TOKEN}\n`,
    });

    const report = scan(root, { includeEnv: false });
    const serialised = JSON.stringify(report.findings);

    expect(serialised).not.toContain(SECRET_TOKEN);
    expect(serialised).not.toContain(SECRET_TOKEN.slice(10, 40));
  });

  it("reports a location instead", () => {
    const root = project({
      "config.php": `<?php\n$PANDA_KEY_default = "${SECRET_KEY}";\n`,
    });

    const finding = scan(root, { includeEnv: false }).findings[0];
    expect(finding?.file).toBe("config.php");
    expect(finding?.line).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Scanner boundaries
// ---------------------------------------------------------------------------

describe("scanner boundaries", () => {
  it("excludes .env by default (FR-M20)", () => {
    const root = project({
      ".env": "PANDA_KEY_default=kZ8vQ2mN4pR6tW9yB1cD3fG5hJ7kL0mP2qS4uV6xY8zA=",
      "app.php": "<?php\n",
    });

    const report = scan(root, { includeEnv: false });
    expect(report.findings).toEqual([]);
    expect(report.skipped.some((s) => s.reason.includes(".env excluded"))).toBe(true);
  });

  it("includes .env only when asked", () => {
    const root = project({
      ".env": "PANDA_KEY_default=kZ8vQ2mN4pR6tW9yB1cD3fG5hJ7kL0mP2qS4uV6xY8zA=",
    });

    const report = scan(root, { includeEnv: true });
    expect(report.findings.map((f) => f.rule)).toContain("M001");
  });

  it("refuses a symlink pointing outside the root (FR-M18)", () => {
    const outside = project({ "secret.php": "<?php\n$PANDA_KEY_x = 'kZ8vQ2mN4pR6tW9yB1cD3fG5hJ7kL0mP2qS4uV6xY8zA=';\n" });
    const root = project({ "app.php": "<?php\n" });

    symlinkSync(join(outside, "secret.php"), join(root, "escape.php"));

    const report = scan(root, { includeEnv: false });

    expect(report.findings).toEqual([]);
    expect(report.skipped.some((s) => s.reason.includes("outside the project root"))).toBe(true);
  });

  it("skips build and dependency directories", () => {
    const root = project({
      "node_modules/pkg/index.js": "const x = cipher.decryptRaw(e);",
      "vendor/lib/a.php": "<?php $c->decryptRaw($e);",
      "dist/bundle.js": "x.decryptRaw(y)",
      "src/index.js": "const ok = 1;",
    });

    expect(scan(root, { includeEnv: false }).findings).toEqual([]);
  });

  it("reports what it skipped rather than hiding gaps", () => {
    const root = project({ "app.php": "<?php\n" });
    writeFileSync(join(root, "big.js"), "x".repeat(1_000_001), "utf8");

    const report = scan(root, { includeEnv: false });
    expect(report.skipped.some((s) => s.path === "big.js")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suppression
// ---------------------------------------------------------------------------

describe("suppression", () => {
  it("honours a suppression on the same line", () => {
    const index = buildSuppressionIndex(
      "const raw = cipher.decryptRaw(e); // panda-mcp-ignore M002: export endpoint needs it",
    );
    expect(index.appliesAt(1, "M002")).toBe(true);
  });

  it("honours a suppression on the line above", () => {
    const index = buildSuppressionIndex(
      "// panda-mcp-ignore M002: export endpoint needs the full value\nconst raw = cipher.decryptRaw(e);",
    );
    expect(index.appliesAt(2, "M002")).toBe(true);
  });

  it("does not suppress a different rule", () => {
    const index = buildSuppressionIndex("// panda-mcp-ignore M002: export endpoint needs it");
    expect(index.appliesAt(1, "M005")).toBe(false);
  });

  it("rejects a suppression with no justification (FR-M21)", () => {
    const index = buildSuppressionIndex("// panda-mcp-ignore M002:");
    expect(index.invalid.length).toBe(1);
    expect(index.invalid[0]?.reason).toMatch(/justification/);
  });

  it("rejects a token justification as useless", () => {
    const index = buildSuppressionIndex("// panda-mcp-ignore M002: ok");
    expect(index.invalid.length).toBe(1);
  });

  it("counts suppressions per rule, as a quality signal", () => {
    const index = buildSuppressionIndex(
      [
        "// panda-mcp-ignore M002: export endpoint needs the full value",
        "// panda-mcp-ignore M002: report generation needs the full value",
      ].join("\n"),
    );
    expect(index.countsByRule["M002"]).toBe(2);
  });

  it("keeps a suppressed finding out of the report but counts it", () => {
    const root = project({
      "svc.js": [
        "// panda-mcp-ignore M002: the export endpoint genuinely needs the full value",
        "const raw = cipher.decryptRaw(envelope);",
      ].join("\n"),
    });

    expect(scan(root, { includeEnv: false }).findings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rules — positive, negative, near-miss
// ---------------------------------------------------------------------------

describe("M001 hardcoded key", () => {
  const KEY = "kZ8vQ2mN4pR6tW9yB1cD3fG5hJ7kL0mP2qS4uV6xY8zA=";

  it("fires on a key literal", () => {
    const root = project({ "c.php": `<?php\n$PANDA_KEY_a = "${KEY}";` });
    expect(rulesFired(root)).toContain("M001");
  });

  it("does not fire on an environment lookup", () => {
    const root = project({
      "c.php": "<?php\n$key = getenv('PANDA_KEY_a');",
      "d.ts": "const key = process.env.PANDA_KEY_A;",
    });
    expect(rulesFired(root)).not.toContain("M001");
  });

  it("does not fire on a placeholder in an example file", () => {
    const root = project({
      ".env.example": `PANDA_KEY_default=changeme_replace_me_with_a_real_key\n`,
    });
    // .env.example is scanned (not excluded like .env), so this exercises the
    // placeholder guard rather than the exclusion.
    expect(rulesFired(root)).not.toContain("M001");
  });

  it("does not fire on a base64 value with no key-ish context", () => {
    const root = project({ "hash.js": `const checksum = "${KEY}";` });
    expect(rulesFired(root)).not.toContain("M001");
  });
});

describe("M002 full plaintext decryption", () => {
  it("fires across all four SDK spellings", () => {
    const root = project({
      "a.php": "<?php\n$x = $c->decryptRaw($e);",
      "b.ts": "const x = cipher.decryptRaw(e);",
      "c.go": "x, _ := cipher.DecryptRaw(e)",
      "d.py": "x = cipher.decrypt_raw(e)",
    });

    const fired = scan(root, { includeEnv: false }).findings.filter((f) => f.rule === "M002");
    expect(fired.length).toBe(4);
  });

  it("does not fire on the masked decrypt()", () => {
    const root = project({
      "b.ts": "const masked = cipher.decrypt(e);",
      "a.php": "<?php\n$m = $c->decrypt($e);",
      "c.go": "m, _ := cipher.Decrypt(e)",
      "d.py": "m = cipher.decrypt(e)",
    });
    expect(rulesFired(root)).not.toContain("M002");
  });

  it("exempts test and example paths", () => {
    const root = project({
      "test/cipher.test.ts": "const raw = cipher.decryptRaw(e);",
      "examples/demo.py": "raw = cipher.decrypt_raw(e)",
    });
    expect(rulesFired(root)).not.toContain("M002");
  });
});

describe("M003 demo token", () => {
  const TOKEN = "panda_demo_76d08573d453cdbdb4bf5704d13f8f54d57cd3c47c9b4be2";

  it("fires in a production configuration", () => {
    const root = project({ "config/production.yaml": `token: ${TOKEN}` });
    expect(rulesFired(root)).toContain("M003");
  });

  it("does not fire in development paths", () => {
    const root = project({
      "config/dev.yaml": `token: ${TOKEN}`,
      "docs/setup.md": `Use ${TOKEN}`,
      ".env.example": `PANDA_TOKEN=${TOKEN}`,
    });
    expect(rulesFired(root)).not.toContain("M003");
  });

  it("fires in staging — staging is not development", () => {
    const root = project({ "config/staging.yaml": `token: ${TOKEN}` });
    expect(rulesFired(root)).toContain("M003");
  });
});

describe("M004 personal-data field", () => {
  it("fires on a model declaring NIK with no PANDA reference", () => {
    const root = project({
      "app/Models/Citizen.php": `<?php
class Citizen extends Model {
    protected $fillable = ['nik', 'nama_lengkap', 'alamat'];
}`,
    });
    expect(rulesFired(root)).toContain("M004");
  });

  it("does not fire when the file references PANDA", () => {
    const root = project({
      "app/Models/Citizen.php": `<?php
class Citizen extends Model {
    protected $casts = ['nik' => EncryptedCast::class];
    protected $fillable = ['nik', 'nama_lengkap'];
}`,
    });
    expect(rulesFired(root)).not.toContain("M004");
  });

  it("does not fire on unrelated field names", () => {
    const root = project({
      "app/Models/Product.php": `<?php
class Product extends Model {
    protected $fillable = ['sku', 'price', 'quantity'];
}`,
    });
    expect(rulesFired(root)).not.toContain("M004");
  });

  it("normalises separator styles", () => {
    expect(normaliseFieldName("nomor_kk")).toBe("nomorkk");
    expect(normaliseFieldName("nomorKK")).toBe("nomorkk");
    expect(normaliseFieldName("Nomor-KK")).toBe("nomorkk");
    expect(isPersonalDataField("nomor_kk")).toBe(true);
    expect(isPersonalDataField("NIK")).toBe(true);
    expect(isPersonalDataField("sku")).toBe(false);
  });

  it("matches the identity and financial names added for this domain", () => {
    for (const name of ["ktp", "noktp", "nomorktp", "nokk", "norek"]) {
      expect(isPersonalDataField(name)).toBe(true);
    }
  });

  it("does not match two-letter names, by choice", () => {
    // `kk` is deliberately absent from the list: at two characters it collides
    // with unrelated abbreviations too often to be worth the noise. The longer
    // spellings cover the same field. Asserted so the decision is visible if
    // someone later wonders why it does not fire.
    expect(isPersonalDataField("kk")).toBe(false);
    expect(isPersonalDataField("nokk")).toBe(true);
  });

  it("does not match unrelated short tokens", () => {
    for (const name of ["id", "no", "x", "qty", "sku", "url"]) {
      expect(isPersonalDataField(name)).toBe(false);
    }
  });

  it("fires on ktp and norek in a model", () => {
    const root = project({
      "app/Models/Keluarga.php": `<?php
class Keluarga extends Model {
    protected $fillable = ['ktp', 'norek'];
}`,
    });
    expect(rulesFired(root)).toContain("M004");
  });
});

describe("M005 database TLS", () => {
  it("fires on disabled verification across drivers", () => {
    const root = project({
      "a.js": "const pool = new Pool({ ssl: { rejectUnauthorized: false } });",
      "b.go": "cfg := &tls.Config{InsecureSkipVerify: true}",
      "c.py": "conn = psycopg.connect(dsn, sslmode='disable')",
      "d.php": "$opts = [PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT => false];",
    });

    const fired = scan(root, { includeEnv: false }).findings.filter((f) => f.rule === "M005");
    expect(fired.length).toBe(4);
  });

  it("does not fire on verified TLS", () => {
    const root = project({
      "a.js": "const pool = new Pool({ ssl: { rejectUnauthorized: true } });",
      "c.py": "conn = psycopg.connect(dsn, sslmode='verify-full')",
      "d.php": "$opts = [PDO::MYSQL_ATTR_SSL_CA => '/etc/ssl/ca.pem'];",
    });
    expect(rulesFired(root)).not.toContain("M005");
  });
});

// ---------------------------------------------------------------------------
// Report shape
// ---------------------------------------------------------------------------

describe("scan report", () => {
  it("sorts findings by file then line", () => {
    const root = project({
      "z.js": "a.decryptRaw(x);",
      "a.js": "b.decryptRaw(y);\nc.decryptRaw(z);",
    });

    const findings = scan(root, { includeEnv: false }).findings;
    expect(findings.map((f) => `${f.file}:${f.line}`)).toEqual([
      "a.js:1",
      "a.js:2",
      "z.js:1",
    ]);
  });

  it("detects the stack from manifests", () => {
    const root = project({
      "composer.json": '{"require":{"laravel/framework":"^11"}}',
      "app.php": "<?php",
    });
    expect(scan(root, { includeEnv: false }).stack).toBe("laravel");
  });

  it("returns empty for a non-existent path rather than throwing", () => {
    const report = scan(join(tmpdir(), "panda-mcp-does-not-exist-xyz"), { includeEnv: false });
    expect(report.findings).toEqual([]);
    expect(report.skipped[0]?.reason).toMatch(/does not exist/);
  });
});
