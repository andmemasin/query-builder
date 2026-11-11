// Builds dist/query-builder.js: Tailwind CSS compiled first, then bundled with Lit and Tom Select by esbuild.
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const entry = process.argv[2] ?? 'js/query-builder.js';
const outfile = process.argv[3] ?? 'dist/query-builder.js';

let css = execFileSync('node_modules/.bin/tailwindcss', ['-i', 'js/styles.css', '--minify'], { encoding: 'utf8' });

// @property rules are ignored inside a shadow root, so their initial values are set as plain custom properties instead.
const defaults = [];
css = css.replace(/@property\s*(--[\w-]+)\s*\{([^}]*)\}/g, (_, name, body) => {
    const initial = /initial-value:\s*([^;]+)/.exec(body);
    if (initial) defaults.push(`${name}:${initial[1].trim()}`);
    return '';
});
if (defaults.length) css += `:host,*,::before,::after,::backdrop{${defaults.join(';')}}`;

await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    minify: true,
    legalComments: 'eof',
    target: 'es2022',
    banner: {
        js: '/*! @andmemasin/query-builder | MIT License. Bundles Lit (BSD-3-Clause), Tom Select, @orchidjs/sifter and '
            + '@orchidjs/unicode-variants (Apache-2.0) and Tailwind CSS output (MIT); see THIRD_PARTY_NOTICES.md */',
    },
    plugins: [{
        name: 'styles',
        setup(b) {
            b.onResolve({ filter: /^qb:styles$/ }, () => ({ path: 'styles', namespace: 'qb' }));
            b.onLoad({ filter: /.*/, namespace: 'qb' }, () => ({ contents: css, loader: 'text' }));
        },
    }],
});
