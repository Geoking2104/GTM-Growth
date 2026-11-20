#!/usr/bin/env node
/** Reproducible local ESM bundle. No CDN, build-time network or commercial plugins. */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const dependency = path.join(root, 'node_modules/@joint/core');
const joint = JSON.parse(await readFile(path.join(dependency, 'package.json'), 'utf8'));
if (joint.version !== manifest.dependencies['@joint/core']) throw new Error('JointJS must match its exact package pin.');
const result = await build({
  absWorkingDir: root, entryPoints: ['node_modules/@joint/core/joint.mjs'],
  bundle: true, format: 'esm', platform: 'browser', target: ['es2022'],
  minify: true, legalComments: 'inline', write: false,
  banner: { js: `/*! JointJS Community ${joint.version} — MPL-2.0. See LICENSE and NOTICE.md in this directory. */` },
});
const directory = path.join(root, 'site/assets/vendor/joint-core');
const files = new Map([
  ['joint.js', result.outputFiles[0].text],
  ['LICENSE', await readFile(path.join(dependency, 'LICENSE'), 'utf8')],
  ['NOTICE.md', `# JointJS Community ${joint.version}\n\nCopyright client IO and the JointJS contributors. Distributed under MPL-2.0;\nsee [LICENSE](LICENSE). The application uses the open-source Community package.\nNo JointJS+ commercial components are included.\n\nThis ESM bundle is generated from the unchanged, pinned \`@joint/core@${joint.version}\`\npackage by \`pnpm run vendor:joint\`. The preferred upstream source is available\nin the [exact npm source archive](https://registry.npmjs.org/@joint/core/-/core-${joint.version}.tgz)\nand the [upstream repository](https://github.com/clientIO/joint).\nThe application wrapper and custom editor are separate GTM Growth code.\n\nThe bundle retains included third-party license comments. Dependency upgrades\nmust regenerate this directory and run the strict-CSP Campaign Studio browser QA.\n`],
]);
if (process.argv.includes('--check')) {
  for (const [name, expected] of files) {
    const actual = await readFile(path.join(directory, name), 'utf8').catch(() => '');
    if (actual !== expected) throw new Error(`Stale JointJS asset: ${name}; run pnpm run vendor:joint.`);
  }
  console.log(`JointJS ${joint.version}: local assets match the lockfile.`);
} else {
  await mkdir(directory, { recursive: true });
  for (const [name, content] of files) await writeFile(path.join(directory, name), content);
  console.log(`JointJS ${joint.version}: generated ${files.size} local assets.`);
}
