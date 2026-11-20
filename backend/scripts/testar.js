// Inicia o Vitest com a letra do drive em maiúscula.
// No Windows, se o terminal estiver em "c:\..." (minúsculo), o Vitest carrega a
// si mesmo duas vezes e nenhum teste roda ("failed to find the current suite").

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const pasta = process.cwd().replace(/^[a-z]:/, (drive) => drive.toUpperCase());
const binarioVitest = join(pasta, 'node_modules', 'vitest', 'vitest.mjs');

const resultado = spawnSync(process.execPath, [binarioVitest, ...process.argv.slice(2)], {
  cwd: pasta,
  stdio: 'inherit',
});
process.exit(resultado.status ?? 1);
