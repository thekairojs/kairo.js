import { defineConfig } from 'tsup'

export default defineConfig({
  entry:  { bin: 'src/bin.ts' },
  format: ['esm'],
  target: 'node18',
  banner: { js: '#!/usr/bin/env node' },
  clean:  true,
  dts:    false,
  sourcemap: false,
})
