// Hook Stop: al terminar una tarea corre `npm run verify`.
// Si falla, bloquea el cierre (código 2) para que Claude corrija.
// Tras 5 fallos seguidos deja de bloquear: hay que reportar el error al usuario.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MAX_ATTEMPTS = 5;
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const counterFile = join(root, '.claude', '.verify-attempts');

if (!existsSync(join(root, 'node_modules'))) process.exit(0);

try {
  execFileSync('npm', ['run', '--silent', 'verify'], {
    cwd: root,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  rmSync(counterFile, { force: true });
} catch (error) {
  const attempts =
    (existsSync(counterFile) ? Number(readFileSync(counterFile, 'utf8')) || 0 : 0) + 1;
  const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.slice(-6000);
  if (attempts >= MAX_ATTEMPTS) {
    rmSync(counterFile, { force: true });
    process.stderr.write(
      `npm run verify sigue fallando después de ${MAX_ATTEMPTS} intentos. ` +
        `Detenete y reportá al usuario: el error, qué intentaste y tu hipótesis.\n\n${output}`,
    );
    process.exit(0);
  }
  writeFileSync(counterFile, String(attempts));
  process.stderr.write(
    `npm run verify falló (intento ${attempts}/${MAX_ATTEMPTS}). Corregí la causa y volvé a verificar.\n\n${output}`,
  );
  process.exit(2);
}
