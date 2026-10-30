import {build} from 'esbuild';
import {copyFileSync,mkdirSync} from 'node:fs';
mkdirSync('build',{recursive:true});
await build({entryPoints:['src/desktop/main.ts'],outfile:'build/main.cjs',bundle:true,platform:'node',format:'cjs',target:'node22',external:['electron','sql.js'],logLevel:'info'});
await build({entryPoints:['src/desktop/preload.ts'],outfile:'build/preload.cjs',bundle:true,platform:'node',format:'cjs',target:'node22',external:['electron'],logLevel:'info'});
await build({entryPoints:['src/ui/App.tsx'],outfile:'build/app.js',bundle:true,platform:'browser',format:'iife',target:'chrome120',logLevel:'info'});
copyFileSync('src/ui/index.html','build/index.html');copyFileSync('src/ui/styles.css','build/styles.css');
copyFileSync('src/ui/assets/logo.png','build/logo.png');copyFileSync('src/ui/assets/banner.png','build/banner.png');
