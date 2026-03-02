/**
 * Postinstall compatibility patch for @noble/hashes v2.x.
 *
 * Two classes of fixes are needed:
 *
 * 1. EXTENSION ALIASES: v2.x exports use explicit `.js` suffixes
 *    (e.g. `./sha2.js`), but older callers import without extension
 *    (e.g. `@noble/hashes/sha2`).  We add extension-less aliases.
 *
 * 2. RENAMED SHIMS: v2.x renamed modules (e.g. `sha256` → `sha2`).
 *    Callers that still import `@noble/hashes/sha256` need a shim.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hashesDir = path.resolve(__dirname, '../node_modules/@noble/hashes');
const pkgPath = path.join(hashesDir, 'package.json');

if (!fs.existsSync(pkgPath)) {
    console.log('patch-noble-hashes: @noble/hashes not found, skipping.');
    process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const exports_ = pkg.exports ?? {};

// ── Step 1: add no-extension aliases for every .js export ───────────────────
for (const [key, value] of Object.entries(exports_)) {
    if (!key.endsWith('.js')) continue; // already has no-ext form or not relevant
    const noExt = key.slice(0, -3); // strip trailing ".js"
    if (exports_[noExt]) continue; // already present
    exports_[noExt] = value;
}

// ── Step 2: add renamed shims (v1 name → v2 file) ────────────────────────────
// [v1SubpathNoExt, v2TargetFile]
const RENAMED = [
    ['sha256', 'sha2.js'],
    ['sha512', 'sha2.js'],
    ['sha1', 'sha2.js'],
    ['ripemd160', 'legacy.js'],
    ['blake2b', 'blake2.js'],
    ['blake2s', 'blake2.js'],
];

for (const [shimName, target] of RENAMED) {
    const key = `./${shimName}`;
    const keyJs = `${key}.js`;
    if (exports_[key] || exports_[keyJs]) continue; // already handled

    const targetPath = path.join(hashesDir, target);
    if (!fs.existsSync(targetPath)) {
        console.log(`patch-noble-hashes: target ${target} missing, skipping ${shimName}.`);
        continue;
    }

    // Guard: never overwrite an existing file.
    const shimFile = path.join(hashesDir, `${shimName}.js`);
    if (!fs.existsSync(shimFile)) {
        fs.writeFileSync(
            shimFile,
            `// compat shim: @noble/hashes/${shimName} -> @noble/hashes/${target}\nexport * from './${target}';\n`,
        );
        fs.writeFileSync(
            path.join(hashesDir, `${shimName}.cjs`),
            `// compat shim\nmodule.exports = require('./${target}');\n`,
        );
    }

    const entry = {
        import: `./${shimName}.js`,
        require: `./${shimName}.cjs`,
        default: `./${shimName}.js`,
    };
    exports_[key] = entry;
    exports_[keyJs] = entry;
    console.log(`patch-noble-hashes: shim ${shimName} -> ${target}`);
}

pkg.exports = exports_;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4));

// ── Step 3: add bytesToUtf8 to utils.js (removed in v2.x, needed by @noble/curves@1.x) ─
const utilsPath = path.join(hashesDir, 'utils.js');
if (fs.existsSync(utilsPath)) {
    const utilsSrc = fs.readFileSync(utilsPath, 'utf8');
    if (!utilsSrc.includes('bytesToUtf8')) {
        fs.appendFileSync(
            utilsPath,
            '\n// compat shim: bytesToUtf8 was removed in v2.x but @noble/curves@1.x uses it\nexport const bytesToUtf8 = (bytes) => new TextDecoder().decode(bytes);\n',
        );
        console.log('patch-noble-hashes: added bytesToUtf8 shim to utils.js');
    }
}

console.log('patch-noble-hashes: done.');
