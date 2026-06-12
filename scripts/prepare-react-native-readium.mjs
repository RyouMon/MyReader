import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgJson = require.resolve("@ryoumon/react-native-readium/package.json", {
  paths: [join(repoRoot, "my-reader-mobile")],
});
const readiumRoot = dirname(pkgJson);
const libIndex = join(readiumRoot, "lib/src/index.d.ts");

if (existsSync(libIndex)) {
  process.exit(0);
}
const pnpmNodeModules = join(dirname(pkgJson), "..", "..");
const linkPath = join(readiumRoot, "node_modules");

if (!existsSync(linkPath)) {
  symlinkSync(pnpmNodeModules, linkPath, "dir");
} else if (!lstatSync(linkPath).isSymbolicLink()) {
  throw new Error(`${linkPath} exists and is not a symlink`);
}

rmSync(join(readiumRoot, "lib"), { recursive: true, force: true });

const tsc = join(repoRoot, "my-reader/node_modules/typescript/bin/tsc");
const tsconfig = join(repoRoot, "scripts/react-native-readium.build.json");

execSync(`"${tsc}" -p "${tsconfig}"`, { stdio: "inherit", cwd: repoRoot });

const componentsDir = join(readiumRoot, "lib/src/components");
mkdirSync(componentsDir, { recursive: true });
writeFileSync(
  join(componentsDir, "ReadiumView.d.ts"),
  `import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import type { ReadiumViewProps, ReadiumViewMethods } from '../specs/ReadiumView.nitro';

export type ReadiumViewRef = ReadiumViewMethods;
export const ReadiumView: ForwardRefExoticComponent<
  ReadiumViewProps & RefAttributes<ReadiumViewRef>
>;
`,
);
writeFileSync(
  libIndex,
  `export * from './interfaces';
export { RANGES } from './utils';
export * from './components/ReadiumView';
`,
);
