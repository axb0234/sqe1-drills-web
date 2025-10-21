const fs = require('fs');
const path = require('path');

async function ensureSwcBinaries() {
  const baseDir = path.join(__dirname, '..', 'node_modules', '@next');
  if (!fs.existsSync(baseDir)) {
    return;
  }

  const entries = await fs.promises.readdir(baseDir, { withFileTypes: true });
  const hiddenSwcDirs = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith('.swc-'));

  for (const entry of hiddenSwcDirs) {
    const sourceDir = path.join(baseDir, entry.name);
    const packageJsonPath = path.join(sourceDir, 'package.json');

    let packageName;
    try {
      const raw = await fs.promises.readFile(packageJsonPath, 'utf8');
      const pkg = JSON.parse(raw);
      packageName = pkg.name;
    } catch (err) {
      console.warn(`[prepare-swc] Skipping ${entry.name}: ${err.message}`);
      continue;
    }

    if (typeof packageName !== 'string' || !packageName.startsWith('@next/')) {
      console.warn(`[prepare-swc] Skipping ${entry.name}: unexpected package name`);
      continue;
    }

    const targetDir = path.join(baseDir, packageName.split('/')[1]);
    try {
      await fs.promises.access(targetDir);
      continue;
    } catch {
      // destination missing, continue
    }

    await fs.promises.mkdir(path.dirname(targetDir), { recursive: true });
    await fs.promises.cp(sourceDir, targetDir, { recursive: true });
  }
}

async function ensurePgStub() {
  const targetDir = path.join(__dirname, '..', 'node_modules', 'pg');
  const templateDir = path.join(__dirname, 'templates', 'pg');
  if (!fs.existsSync(templateDir)) {
    return;
  }

  const packageJsonPath = path.join(targetDir, 'package.json');
  try {
    await fs.promises.access(packageJsonPath);
    return;
  } catch {
    // fall through to create stub
  }

  await fs.promises.rm(targetDir, { recursive: true, force: true });
  await fs.promises.mkdir(path.dirname(targetDir), { recursive: true });
  await fs.promises.cp(templateDir, targetDir, { recursive: true });
}

Promise.all([ensureSwcBinaries(), ensurePgStub()]).catch((err) => {
  console.error('[prepare-swc] Failed during preparation:', err);
  process.exitCode = 1;
});
