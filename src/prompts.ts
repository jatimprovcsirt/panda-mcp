/**
 * MCP prompts — the "Vibe Coding?" setup prompts.
 *
 * PORTAL PARITY: this text is the same text the PANDA portal ships in its
 * "Vibe Coding?" section (PRD 006 Section 8.3). The two channels deliver the
 * same prompt; divergence between them is a bug, not a variation. If you edit
 * the copy here, edit it there in the same change.
 *
 * Why the text is shaped the way it is — two lines carry real weight:
 *
 * - "Panggil decrypt() ... Jangan pakai decryptRaw() kecuali saya minta secara
 *   eksplisit." Left unguided, an assistant reaches for the full-plaintext
 *   method because it "seems more useful". That single default is the
 *   difference between masked output and full NIKs in an API response.
 *
 * - "Field yang dilindungi: <...>" is deliberately a placeholder. A prompt
 *   that fills in the field list itself would invite a blind find-and-replace
 *   across a live database. The developer stays responsible for naming what
 *   gets encrypted.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * The live documentation URL.
 *
 * `csirt.jatimprov.go.id/panda` — the portal is mounted under a path on the
 * existing CSIRT domain, not on its own hostname (portal PRD Section 16/18).
 * An earlier draft of the Docker PRD used `panda.jatimprov.go.id`, which never
 * existed; corrected in both places.
 */
const DOCS_URL = "https://csirt.jatimprov.go.id/panda/docs";

interface Target {
  readonly id: string;
  readonly title: string;
  /** The line naming the package or command for this stack. */
  readonly tool: string;
}

const TARGETS: readonly Target[] = [
  {
    id: "php",
    title: "Setup PANDA — PHP / Laravel",
    tool: "Gunakan paket resmi `jatimprovcsirt/panda-php` (Composer).",
  },
  {
    id: "nodejs",
    title: "Setup PANDA — Node.js",
    tool: "Gunakan paket resmi `@jatimprovcsirt/panda-node` (npm).",
  },
  {
    id: "go",
    title: "Setup PANDA — Go",
    tool: "Gunakan modul resmi `github.com/jatimprovcsirt/panda-go`.",
  },
  {
    id: "python",
    title: "Setup PANDA — Python",
    tool: "Gunakan paket resmi `panda-py` (PyPI).",
  },
  {
    id: "docker",
    title: "Setup PANDA — Docker / REST API",
    tool:
      "Jalankan service `harbor.jatimprov.go.id/panda/panda-docker` lalu panggil " +
      "endpoint REST-nya (`/v1/encrypt` dan `/v1/decrypt`).",
  },
];

function buildPrompt(target: Target, fields: string): string {
  return `Baca dokumentasi PANDA di ${DOCS_URL}
lalu integrasikan enkripsi field-level untuk data pribadi di
proyek saya.

Ketentuan:
- ${target.tool}
- Field yang dilindungi: ${fields}.
- Tambahkan kolom blind index (HMAC) untuk field yang perlu
  dicari dengan exact match.
- Gunakan LocalKeyProvider dari environment variable untuk
  development. Jangan pernah hardcode kunci di source code.
- Panggil decrypt() untuk output ke API/log supaya nilai
  otomatis ter-mask. Jangan pakai decryptRaw() kecuali saya
  minta secara eksplisit.
- Tambahkan migrasi database untuk kolom baru.
- Tuliskan juga test-nya.

Setelah selesai, jelaskan file apa saja yang berubah dan
kenapa.`;
}

export const PROMPT_IDS = TARGETS.map((t) => `setup_${t.id}`);

export function registerPrompts(server: McpServer): void {
  for (const target of TARGETS) {
    server.registerPrompt(
      `setup_${target.id}`,
      {
        title: target.title,
        description:
          `Prompt siap pakai untuk mengintegrasikan PANDA pada proyek ${target.id}. ` +
          `Salin ke AI coding assistant Anda, atau panggil langsung dari sini.`,
        argsSchema: {
          fields: z
            .string()
            .optional()
            .describe(
              "Daftar field yang dilindungi, mis. 'NIK, nomor KK, tanggal lahir'. " +
                "Sengaja tidak diisi otomatis — penamaan field adalah keputusan Anda.",
            ),
        },
      },
      ({ fields }) => ({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: buildPrompt(
                target,
                fields ?? "<sebutkan, mis. NIK, nomor KK, tanggal lahir>",
              ),
            },
          },
        ],
      }),
    );
  }
}
