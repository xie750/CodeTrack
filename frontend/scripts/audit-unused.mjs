import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceRoot = path.join(root, 'src');
const configPath = path.join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const files = ts.sys.readDirectory(sourceRoot, ['.ts', '.tsx']).filter(file => !file.endsWith('.d.ts'));
const normalize = file => path.resolve(file).replaceAll('\\', '/');
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const graph = new Map();
const unresolved = [];
const dynamic = [];

for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const dependencies = [];
  function addDependency(specifier) {
    if (!specifier.startsWith('.') && !specifier.startsWith('@admin/')) return;
    const result = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule;
    if (result) dependencies.push(normalize(result.resolvedFileName));
    else if (!/\.(css|png|jpg|jpeg|svg|webp|woff2?)(\?.*)?$/.test(specifier)) unresolved.push(`${relative(file)}: ${specifier}`);
  }
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      addDependency(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === 'require')) {
      if (node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) addDependency(node.arguments[0].text);
      else dynamic.push(`${relative(file)}: ${node.getText(source)}`);
    }
    if (ts.isCallExpression(node) && node.expression.getText(source).startsWith('import.meta.glob')) dynamic.push(`${relative(file)}: ${node.getText(source)}`);
    ts.forEachChild(node, visit);
  }
  visit(source);
  graph.set(normalize(file), dependencies);
}

const reachable = new Set();
function walk(file) {
  if (reachable.has(file)) return;
  reachable.add(file);
  for (const dependency of graph.get(file) ?? []) walk(dependency);
}
walk(normalize(path.join(sourceRoot, 'main.tsx')));
const unused = files.filter(file => !reachable.has(normalize(file))).map(relative).sort();
console.log(JSON.stringify({ entry: 'src/main.tsx', modules: files.length, unused, unresolved, dynamic }, null, 2));
if (unused.length || unresolved.length || dynamic.length) process.exitCode = 1;
