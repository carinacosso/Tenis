// Hook PostToolUse: tras editar un archivo TS/TSX, corre ESLint sobre ese archivo y tsc.
// Si hay errores, sale con código 2 para que Claude los vea y los corrija.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const filePath = input.tool_input?.file_path ?? '';
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const rel = relative(root, filePath);

if (!/\.(ts|tsx)$/.test(filePath) || rel.startsWith('..') || !existsSync(filePath)) process.exit(0);

const problems = [];
const run = (cmd, args) => {
  try {
    execFileSync(cmd, args, { cwd: root, stdio: 'pipe', encoding: 'utf8' });
  } catch (error) {
    problems.push(`$ ${cmd} ${args.join(' ')}\n${error.stdout ?? ''}${error.stderr ?? ''}`);
  }
};

run('npx', ['eslint', '--no-warn-ignored', rel]);
run('npm', ['run', '--silent', 'typecheck']);

if (problems.length > 0) {
  process.stderr.write(`Errores después de editar ${rel}:\n\n${problems.join('\n')}`);
  process.exit(2);
}
