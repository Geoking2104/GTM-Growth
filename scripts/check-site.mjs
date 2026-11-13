#!/usr/bin/env node
/** Verify the bilingual static contract, not merely that both pages exist. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseHTML } from 'linkedom';
execFileSync(process.execPath, ['scripts/render-landing.mjs', '--check'], { stdio: 'inherit' });
const root = path.resolve('site');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const documents = ['index.html', 'fr/index.html'].map(file => parseHTML(read(file)).document);
const translatedAttributes = new Set(['lang', 'aria-label', 'alt', 'title', 'placeholder', 'aria-current']);
function structure(document) {
  return [...document.body.querySelectorAll('*')].map(node => [node.localName, [...node.attributes]
    .filter(a => !translatedAttributes.has(a.name))
    .map(a => [a.name, a.value.replace(/lang=(en|fr)/g, 'lang=LOCALE').replace(/geo-board-(en|fr)\.svg/g, 'geo-board-LOCALE.svg').replace('/fr/confidentialite.html', '/privacy.html')])]);
}
assert.deepEqual(structure(documents[0]), structure(documents[1]), 'EN/FR structure, actions and assets must match');
for (const [i, document] of documents.entries()) {
  const locale = i ? 'fr' : 'en';
  const base = i ? 'fr' : '';
  const canonical = `https://gtm.kayroslab.com/${i ? 'fr/' : ''}`;
  assert.equal(document.documentElement.lang, locale);
  assert.equal(document.querySelector('link[rel="canonical"]').href, canonical);
  assert.ok(read('sitemap.xml').includes(canonical));
  assert.equal(document.querySelector('.lang [aria-current="page"]').textContent, locale.toUpperCase());
  const ids = [...document.querySelectorAll('[id]')].map(n => n.id);
  assert.equal(new Set(ids).size, ids.length, `${locale}: duplicate IDs`);
  for (const id of ['main','url-form','url-input','read-result','lead-form','lead-name','lead-email','lead-url','audit','ops','console','roadmap','offres','faq']) assert.ok(document.getElementById(id), `${locale}: missing ${id}`);
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) JSON.parse(script.textContent);
  assert.ok(document.querySelector('script[type="application/ld+json"]'));
  for (const node of document.querySelectorAll('[src],link[href],a[href]')) {
    const value = node.getAttribute('src') || node.getAttribute('href');
    if (!value || /^(https?:|data:)/.test(value)) continue;
    if (value.startsWith('#')) { assert.ok(document.getElementById(value.slice(1)), `${locale}: missing anchor ${value}`); continue; }
    if (value.startsWith('/console/')) { assert.ok(value.includes(`lang=${locale}`), `${locale}: console language lost`); continue; }
    const file = path.resolve(root, value.startsWith('/') ? '.' + value : path.join(base, value));
    assert.ok(file.startsWith(root + path.sep) || file === root, `Path outside site: ${value}`);
    assert.ok(fs.existsSync(file), `${locale}: missing asset ${value}`);
  }
  const text = document.querySelector('#offres').textContent;
  assert.match(text, /39/); assert.match(text, /149/); assert.match(text, /Mollie/);
  assert.match(text, locale === 'fr' ? /HT\/TTC/ : /VAT/);
  assert.equal(document.querySelectorAll('#faq details').length, 8, 'Keep the full French FAQ');
  assert.equal(document.querySelectorAll('#ops .loop-node').length, 6, 'Keep all French Ops stages');
  assert.equal(document.querySelectorAll('#roadmap .phase').length, 3, 'Keep all French roadmap phases');
  assert.equal(document.querySelectorAll('#toolkit .lever').length, 7, 'Keep all French toolkit items');
}
const behavior = read('landing.js');
for (const hook of ['url-form','lead-form','/api/free-read','/api/lead','auditUrlShape','sampleTables(dict)','translateLiveTables','renderSitemapMap']) assert.ok(behavior.includes(hook), `Missing shared behavior: ${hook}`);
assert.doesNotMatch(behavior, /mailto:/);
assert.ok(read('console/index.html').includes('src="locale-shell.js"'));
assert.ok(read('reports/opendpe.html').includes('opendpe.pdf'));
console.log('site check OK — English layout, full French content, bilingual actions, assets, SEO and generated-file parity');
