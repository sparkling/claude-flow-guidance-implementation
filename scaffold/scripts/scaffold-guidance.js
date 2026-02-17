#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scaffold } from '@claude-flow/guidance/generators';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const defaultOutputDir = resolve(rootDir, '.claude-flow', 'guidance', 'scaffold');

function parseArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function loadPackageJson() {
  const packagePath = resolve(rootDir, 'package.json');
  return JSON.parse(readFileSync(packagePath, 'utf-8'));
}

function buildProjectProfile(pkg) {
  const script = pkg.scripts ?? {};
  const frameworkHints = ['react', 'next', 'vue', 'svelte', 'solid', 'express'];
  const dependencies = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };
  const frameworks = Object.keys(dependencies).filter((name) =>
    frameworkHints.some((hint) => name.includes(hint))
  );

  return {
    name: pkg.name ?? 'project',
    description: pkg.description ?? '',
    languages: ['JavaScript'],
    frameworks: frameworks.length > 0 ? frameworks : undefined,
    packageManager: 'npm',
    monorepo: false,
    buildCommand: script.build ?? 'npm run build',
    testCommand: script.test ?? 'npm test',
    lintCommand: script.lint ?? 'npm run lint',
    srcDir: 'src',
    testDir: 'tests',
    architecture: 'layered',
    domainRules: [
      'Never commit secrets, credentials, or .env files',
      'Always validate inputs at system boundaries',
    ],
    conventions: [
      'Prefer editing existing files over creating new files',
      'Use deterministic scripts for automation tasks',
    ],
    forbidden: [
      'Hardcoded secrets',
      'Destructive git commands without explicit confirmation',
    ],
    required: [
      'Run tests after code changes',
      'Verify build succeeds before committing',
    ],
    guidanceControlPlane: true,
    wasmKernel: true,
    swarm: {
      topology: 'hierarchical',
      maxAgents: 8,
      strategy: 'specialized',
    },
  };
}

function buildLocalProfile() {
  return {
    developer: process.env.USER ?? 'developer',
    localUrls: {
      app: 'http://localhost:3000',
    },
    preferences: [
      'Show git diffs before commit',
      'Prefer explicit, reproducible shell commands',
    ],
  };
}

function writeScaffold(outputDir, result) {
  const written = [];
  for (const [relativePath, content] of result.files.entries()) {
    const fullPath = resolve(outputDir, relativePath);
    const dir = dirname(fullPath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
    written.push(fullPath);
  }
  return written;
}

function main() {
  const outputArg = parseArg('--output');
  const outputDir = outputArg ? resolve(rootDir, outputArg) : defaultOutputDir;
  const pkg = loadPackageJson();
  const project = buildProjectProfile(pkg);
  const local = buildLocalProfile();

  const result = scaffold({
    project,
    local,
    includeDefaultAgents: true,
    includeDefaultSkills: true,
  });

  const written = writeScaffold(outputDir, result);
  console.log(`Scaffold generated in: ${outputDir}`);
  console.log(`Files written: ${written.length}`);
  for (const file of written) {
    console.log(`- ${file}`);
  }
}

main();
