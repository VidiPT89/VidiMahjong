/* Test helper (Node, no build step): the game's client-side files are plain
   browser <script> tags (no ES modules, no CommonJS exports) — see how they
   are wired in index.html / traditional.html. To unit-test them with Node's
   built-in `node:test` without adding a bundler/module system, we load each
   file's source into a `vm` context that behaves like the global `window`
   the browser would give them (functions/consts declared at top level become
   properties of that shared context, exactly like they'd become properties
   of `window` in a real page), then hand the resulting sandbox back to the
   test file to pull the pieces it needs off of.

   This is intentionally the simplest option that requires zero new
   dependencies and zero changes to the existing source files. */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

/**
 * Loads a list of project-relative JS file paths (in order) into one shared
 * vm context and returns that context, so callers can do
 * `const { MahjongGame } = loadScripts(['js/layout.js', 'js/engine.js']);`
 */
// Matches the name in a top-level `function foo(...)`, `class Foo`,
// `const foo = ...` or `let foo = ...` declaration, so we can expose it onto
// the shared context afterwards (see loadScripts below for why this is
// needed instead of just relying on vm's context-as-globalThis behaviour).
const DECL_RE = /^(?:function\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*)|(?:const|let)\s+([A-Za-z_$][\w$]*))/gm;

function declaredNames(code) {
  const names = new Set();
  let m;
  while ((m = DECL_RE.exec(code)) !== null) {
    names.add(m[1] || m[2] || m[3]);
  }
  return [...names];
}

/**
 * Concatenates the given files (in order — later files can reference names
 * from earlier ones, exactly like sequential <script> tags do in the
 * browser) and evaluates them as ONE script in a single vm context.
 *
 * Why one script instead of one vm.runInContext call per file: `class` and
 * `const`/`let` top-level declarations are lexically scoped to the
 * compiled script that declared them, NOT attached to the vm context's
 * global object — unlike `var`/`function`, which vm always installs as
 * context globals. Running everything as one script keeps every file's
 * declarations in the same lexical scope, exactly mirroring how sequential
 * <script> tags in a real page share one global `window` scope. We then
 * explicitly copy every top-level name (functions, classes, const/let) onto
 * the sandbox object so test files can pull them off the returned context.
 */
function loadScripts(relativePaths) {
  const sandbox = {
    console,
    // Minimal no-op shims: some of these files reference `document`/`window`
    // only inside functions that unit tests never call (rendering/DOM glue).
    window: undefined,
    document: undefined,
  };
  vm.createContext(sandbox);

  const chunks = [];
  const allNames = new Set();
  relativePaths.forEach((rel) => {
    const fullPath = path.join(ROOT, rel);
    const code = fs.readFileSync(fullPath, 'utf8');
    declaredNames(code).forEach((n) => allNames.add(n));
    chunks.push(code);
  });

  const exposeLine = [...allNames].map((n) => `try { this.${n} = ${n}; } catch (e) {}`).join('\n');
  const combined = `${chunks.join('\n;\n')}\n;\n${exposeLine}`;

  vm.runInContext(combined, sandbox, { filename: relativePaths.join('+') });

  return sandbox;
}

module.exports = { loadScripts };
