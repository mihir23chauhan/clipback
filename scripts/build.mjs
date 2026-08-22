// MV3 needs each entry as a self-contained IIFE: content scripts are not module
// scripts, and code-splitting across entries would produce imports Chrome cannot
// resolve inside an extension. So Vite runs once per entry in lib mode rather
// than once with four inputs.
import { build } from 'vite'
import { cp, rm, mkdir } from 'node:fs/promises'

// [output filename, entry, IIFE global name]. The global name must be a legal
// JS identifier, which `main-world` is not — so the two are separate fields
// rather than one reused string.
const ENTRIES = [
  ['worker', 'src/worker/index.ts', 'clipbackWorker'],
  ['content', 'src/content/index.ts', 'clipbackContent'],
  ['main-world', 'src/main-world/reader.ts', 'clipbackMainWorld'],
  ['options', 'src/options/options.ts', 'clipbackOptions'],
]

await rm('dist', { recursive: true, force: true })
await mkdir('dist', { recursive: true })

for (const [file, entry, globalName] of ENTRIES) {
  await build({
    configFile: false,
    logLevel: 'warn',
    build: {
      emptyOutDir: false,
      outDir: 'dist',
      minify: false,
      lib: { entry, name: globalName, formats: ['iife'], fileName: () => `${file}.js` },
    },
  })
}

// manifest.json, the options HTML and the token stylesheet are copied, not bundled
await cp('public', 'dist', { recursive: true })
await cp('src/options/index.html', 'dist/options.html')
await cp('src/content/ui/tokens.css', 'dist/tokens.css')

console.log('built dist/ — load it unpacked at chrome://extensions')
