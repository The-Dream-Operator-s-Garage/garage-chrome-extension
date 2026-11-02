// The Chrome Web Store package: dist/garage-chrome-extension-<version>.zip
// — the extension's files only, with the DEVELOPMENT host permission
// (http://localhost:3000/*) taken out of the manifest, so the published
// build asks for exactly api.pathos.cloud. `node scripts/package.mjs`
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
const stage = path.join(root, 'dist', 'stage')
fs.rmSync(stage, { recursive: true, force: true })
fs.mkdirSync(stage, { recursive: true })
const FILES = ['sw.js', 'options.html', 'options.js', 'popup.html', 'popup.js', 'ui.css', 'lib', 'content', 'icons']
for (const f of FILES) fs.cpSync(path.join(root, f), path.join(stage, f), { recursive: true })
const published = { ...manifest, host_permissions: manifest.host_permissions.filter((h) => !/localhost/.test(h)) }
fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(published, null, 2) + '\n')
// The witness's hook is harmless, but a store build carries no test seams.
const sw = fs.readFileSync(path.join(stage, 'sw.js'), 'utf8').replace(/\n\/\/ The witness's hand[\s\S]*$/, '\n')
fs.writeFileSync(path.join(stage, 'sw.js'), sw)
const zip = path.join(root, 'dist', `garage-chrome-extension-${manifest.version}.zip`)
fs.rmSync(zip, { force: true })
execFileSync('zip', ['-qr', zip, '.'], { cwd: stage })
console.log(`${path.relative(root, zip)} — host_permissions: ${published.host_permissions.join(', ')}`)
