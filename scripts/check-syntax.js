import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

let checked = 0;
async function check(directory){
  for(const entry of await readdir(directory, {withFileTypes:true})){
    const file = path.join(directory, entry.name);
    if(entry.isDirectory()) await check(file);
    else if(/\.(m?js)$/.test(entry.name)){
      const result = spawnSync(process.execPath, ['--check', file], {stdio:'inherit'});
      if(result.status !== 0) process.exitCode = 1;
      checked++;
    }
  }
}
for(const directory of ['src','tests','scripts']) await check(directory);
console.log(`Syntax checked ${checked} JavaScript files.`);
