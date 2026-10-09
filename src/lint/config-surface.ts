/**
 * What counts as a configuration surface, and what counts as development.
 *
 * Shared by M003 (demo token) and M008 (local key provider) because both ask
 * the same question — "is this a deployment configuration, and is it
 * production?" — and answering it two different ways would produce two
 * different answers to the same question in the same codebase.
 */

/** Extensions that are configuration rather than code. */
const CONFIG_EXTENSION = /\.(ya?ml|json|toml|ini|conf|properties|xml|tf|env)$/i;

/** Directories that hold deployment or configuration material. */
const CONFIG_DIRECTORY =
  /(^|\/)(config|configs|conf|deploy|deployment|deployments|k8s|kubernetes|helm|infra|terraform|ansible)\//i;

/**
 * Paths where a development-only value is expected and correct.
 *
 * `staging` is deliberately absent. Staging is not development, and a
 * development value there means the same gap as production.
 *
 * `tests?` rather than `test`: with the earlier spelling, `tests/Unit/Foo.php`
 * matched nothing, because the pattern wanted a separator right after "test"
 * and got an "s".
 */
const DEVELOPMENT_PATH =
  /(^|\/)(\.env\.example|\.env\.sample|docs?|examples?|samples?|fixtures?|tests?|spec|__tests__)(\/|$)|(^|[./_-])(dev|local|mock)([./_-]|$)|\.md$/i;

/** Paths that look like a production deployment. */
const PRODUCTION_PATH = /(^|\/)(prod|production|live)([./_-]|$)/i;

/**
 * Configuration files whose name carries the word "config".
 *
 * The delimiter matters. An earlier version was `/[^/]*config[^/]*$/`, which
 * also matched `ConfigCommand.php` and `config.go` — source files named *after*
 * configuration, which are code, not configuration. Running the rules against
 * the SDK repositories flagged those immediately.
 *
 * So: `panda.config.js`, `app-config.yaml`, `config.php` and `config.json`
 * count. `ConfigCommand.php` does not, because "config" there is the start of a
 * longer identifier rather than a delimited part of the filename.
 */
const CONFIG_FILENAME =
  /^(?:config|configuration)\.[^./]+$|(?:[._-]config|config[._-])[^/]*\.[^./]+$/i;

/**
 * Directories that hold code.
 *
 * Inside one of these, a filename is a module name, not a file type. The
 * second false positive this guard fixes: `src/cli/commands/config.ts` is the
 * `panda config` CLI command, and it was being treated as a configuration file
 * because it happens to be called `config.ts`. The same applied to
 * `cmd/config.go`.
 *
 * Directory-based and extension-based detection still apply inside these —
 * only the filename heuristic is suppressed, since only it can be fooled by a
 * module that describes configuration rather than is it.
 */
const SOURCE_DIRECTORY =
  /(^|\/)(src|app|lib|cmd|internal|pkg|commands|cli|handlers|controllers|services|modules|utils|helpers)\//i;

export function isConfigurationSurface(relPath: string): boolean {
  if (CONFIG_EXTENSION.test(relPath)) return true;
  if (CONFIG_DIRECTORY.test(relPath)) return true;

  if (SOURCE_DIRECTORY.test(relPath)) return false;

  const basename = relPath.slice(relPath.lastIndexOf("/") + 1);
  return CONFIG_FILENAME.test(basename);
}

export function isDevelopmentPath(relPath: string): boolean {
  return DEVELOPMENT_PATH.test(relPath);
}

export function isProductionPath(relPath: string): boolean {
  return PRODUCTION_PATH.test(relPath);
}
