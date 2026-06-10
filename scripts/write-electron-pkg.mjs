// Creates dist-electron/package.json with "type": "commonjs".
// This overrides the root package.json "type": "module" for the Electron main process,
// so the compiled .js files are treated as CommonJS by Node.js.
// Must run before tsc.
import { writeFileSync, mkdirSync } from 'fs';

mkdirSync('dist-electron', { recursive: true });
writeFileSync('dist-electron/package.json', JSON.stringify({ type: 'commonjs' }, null, 2));
console.log('Created dist-electron/package.json (type: commonjs)');
