/**
 * `explain_envelope` — Tier 2.
 *
 * Structural analysis of a PANDA envelope, with no decryption.
 *
 * The server has no key, so decryption is not merely disabled — it is
 * impossible. That is worth stating in the tool description, because a
 * developer reaching for this tool may otherwise expect it to reveal a value.
 *
 * What it actually does is the thing people need most of the time: tell you
 * *why* an envelope is malformed. Wrong nonce length, truncated ciphertext,
 * bad base64, an unexpected `v` — those are the real questions, and none of
 * them require a plaintext.
 *
 * The ciphertext and nonce are never echoed back, only their decoded lengths.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { describe, text } from "./shared.js";

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const SUPPORTED_VERSION = 1;
const SUPPORTED_ALG = "aes-256-gcm";

interface Problem {
  readonly field: string;
  readonly issue: string;
}

/** Decode base64 and report the byte length, or why it failed. */
function decodeLength(value: unknown): { bytes: number } | { error: string } {
  if (typeof value !== "string") return { error: "not a string" };
  if (value.length === 0) return { error: "empty" };

  // Standard base64 only. Reject URL-safe and unpadded variants explicitly
  // rather than silently accepting something another implementation would not.
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    return { error: "not standard base64 (URL-safe or padded incorrectly?)" };
  }
  if (value.length % 4 !== 0) {
    return { error: "base64 length is not a multiple of 4" };
  }

  const bytes = Buffer.from(value, "base64");
  if (bytes.length === 0) return { error: "decodes to zero bytes" };
  return { bytes: bytes.length };
}

export function registerExplainEnvelopeTool(server: McpServer): void {
  server.registerTool(
    "explain_envelope",
    {
      title: "Explain a PANDA envelope",
      description: describe(
        "Inspect a PANDA envelope's structure — format version, algorithm, key " +
          "id, and the decoded byte lengths of the nonce and ciphertext. Reports " +
          "precisely why a malformed envelope is malformed. " +
          "This tool does NOT decrypt. It has no key and cannot obtain one; it " +
          "reports metadata only.",
      ),
      inputSchema: {
        envelope: z
          .string()
          .min(1)
          .describe("The envelope JSON, as stored in the database column."),
      },
    },
    async ({ envelope }) => {
      const problems: Problem[] = [];

      let parsed: unknown;
      try {
        parsed = JSON.parse(envelope);
      } catch (error) {
        return text(
          [
            `# Envelope is not valid JSON`,
            ``,
            `\`${error instanceof Error ? error.message : "parse failed"}\``,
            ``,
            `An envelope is a JSON object with the keys \`v\`, \`alg\`, \`kid\`, ` +
              `\`nonce\`, and \`ciphertext\`. If this value came from a database ` +
              `column, check whether the column type truncated it.`,
          ].join("\n"),
        );
      }

      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return text(`# Not an envelope\n\nExpected a JSON object; got ${Array.isArray(parsed) ? "an array" : typeof parsed}.`);
      }

      const obj = parsed as Record<string, unknown>;

      // -- version
      let version: number | undefined;
      if (obj["v"] === undefined) {
        problems.push({ field: "v", issue: "missing" });
      } else if (typeof obj["v"] !== "number" || !Number.isInteger(obj["v"])) {
        problems.push({ field: "v", issue: "not an integer" });
      } else {
        version = obj["v"];
        if (version !== SUPPORTED_VERSION) {
          problems.push({
            field: "v",
            issue: `format version ${version} is not supported by this server (expected ${SUPPORTED_VERSION})`,
          });
        }
      }

      // -- algorithm
      if (obj["alg"] === undefined) {
        problems.push({ field: "alg", issue: "missing" });
      } else if (obj["alg"] !== SUPPORTED_ALG) {
        problems.push({
          field: "alg",
          issue: `"${String(obj["alg"])}" — this server knows ${SUPPORTED_ALG}`,
        });
      }

      // -- key id
      const kid = obj["kid"];
      if (kid === undefined) {
        problems.push({ field: "kid", issue: "missing" });
      } else if (typeof kid !== "string" || kid.length === 0) {
        problems.push({ field: "kid", issue: "not a non-empty string" });
      }

      // -- nonce
      const nonce = decodeLength(obj["nonce"]);
      if ("error" in nonce) {
        problems.push({ field: "nonce", issue: nonce.error });
      } else if (nonce.bytes !== NONCE_BYTES) {
        problems.push({
          field: "nonce",
          issue: `${nonce.bytes} bytes — must be exactly ${NONCE_BYTES}`,
        });
      }

      // -- ciphertext
      const ciphertext = decodeLength(obj["ciphertext"]);
      let plaintextBytes: number | undefined;
      if ("error" in ciphertext) {
        problems.push({ field: "ciphertext", issue: ciphertext.error });
      } else if (ciphertext.bytes < TAG_BYTES) {
        problems.push({
          field: "ciphertext",
          issue: `${ciphertext.bytes} bytes — too short to contain the ${TAG_BYTES}-byte authentication tag`,
        });
      } else {
        plaintextBytes = ciphertext.bytes - TAG_BYTES;
      }

      const wellFormed = problems.length === 0;

      const lines = [
        `# Envelope ${wellFormed ? "is well-formed" : "has problems"}`,
        ``,
        `| Field | Value |`,
        `|---|---|`,
        `| Well-formed | ${wellFormed ? "yes" : "no"} |`,
        `| Version (\`v\`) | ${version ?? "—"} |`,
        `| Algorithm (\`alg\`) | ${typeof obj["alg"] === "string" ? obj["alg"] : "—"} |`,
        `| Key id (\`kid\`) | ${typeof kid === "string" && kid.length > 0 ? kid : "—"} |`,
        `| Nonce | ${"error" in nonce ? "—" : `${nonce.bytes} bytes`} |`,
        `| Ciphertext | ${"error" in ciphertext ? "—" : `${ciphertext.bytes} bytes`} |`,
        plaintextBytes !== undefined
          ? `| Plaintext length if valid | ${plaintextBytes} bytes |`
          : ``,
      ].filter((l) => l !== "");

      if (!wellFormed) {
        lines.push(
          ``,
          `## Problems`,
          ``,
          ...problems.map((p) => `- **\`${p.field}\`** — ${p.issue}`),
        );
      }

      // Report extra keys rather than silently ignoring them: an unexpected
      // key usually means two formats were mixed up.
      const known = new Set(["v", "alg", "kid", "nonce", "ciphertext"]);
      const extra = Object.keys(obj).filter((k) => !known.has(k));
      if (extra.length > 0) {
        lines.push(
          ``,
          `## Unexpected keys`,
          ``,
          ...extra.map((k) => `- \`${k}\``),
          ``,
          `The v1 format defines exactly \`v\`, \`alg\`, \`kid\`, \`nonce\`, and ` +
            `\`ciphertext\`. Extra keys may mean a different format was stored in ` +
            `this column.`,
        );
      }

      lines.push(
        ``,
        `---`,
        ``,
        `Metadata only — this tool has no key and does not decrypt. To read the ` +
          `value, use the SDK the data was encrypted with. Note that ` +
          `\`plaintext length if valid\` is arithmetic (ciphertext minus the ` +
          `${TAG_BYTES}-byte tag), not a decryption.`,
      );

      return text(lines.join("\n"));
    },
  );
}
