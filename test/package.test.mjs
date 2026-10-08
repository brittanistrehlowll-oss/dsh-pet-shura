import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

test('every published file and declared entry point exists', () => {
  for (const entry of [pkg.main, pkg.types, ...pkg.files]) {
    assert.ok(existsSync(resolve(root, entry)), `missing package file: ${entry}`);
  }
});

test('public type declarations follow the JavaScript exports', () => {
  const implementation = readFileSync(resolve(root, pkg.main), 'utf8');
  const declaration = readFileSync(resolve(root, pkg.types), 'utf8');
  for (const name of ['name', 'inject', 'apply']) {
    assert.match(implementation, new RegExp(`export (?:const|function) ${name}\\b`));
    assert.match(declaration, new RegExp(`export declare (?:const|function) ${name}\\b`));
  }
});
