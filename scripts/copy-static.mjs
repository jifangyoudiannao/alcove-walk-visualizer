import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('dist',{recursive:true});
for (const file of ['index.html','styles.css']) cpSync(file,`dist/${file}`);
