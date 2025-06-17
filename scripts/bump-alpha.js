#!/usr/bin/env node

import { execSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

// Function to run command in directory
function runCommand(command, cwd) {
  try {
    const result = execSync(command, {
      cwd,
      stdio: "inherit",
      encoding: "utf8",
    });
    return result;
  } catch (error) {
    console.error(`❌ Failed to run: ${command}`);
    throw error;
  }
}

// Function to get current version from package.json
function getCurrentVersion(packageDir) {
  const result = execSync("npm pkg get version", {
    cwd: packageDir,
    encoding: "utf8",
  });
  return JSON.parse(result.trim());
}

// Main function
function bumpAndPublishAlpha() {
  console.log("🚀 Bumping patch versions and publishing alpha releases...\n");

  const packages = [
    { name: "@treebeardhq/core", dir: join(rootDir, "packages/core") },
    { name: "@treebeardhq/nextjs", dir: join(rootDir, "packages/nextjs") },
    { name: "@treebeardhq/express", dir: join(rootDir, "packages/express") },
  ];

  const updates = [];

  // Process each package
  for (const pkg of packages) {
    console.log(`📦 Processing ${pkg.name}...`);

    // Get current version
    const oldVersion = getCurrentVersion(pkg.dir);
    console.log(`  Current version: ${oldVersion}`);

    // Bump patch version with alpha prerelease
    console.log("  Bumping to alpha prerelease...");
    runCommand("npm version prerelease && npm publish --tag alpha", pkg.dir);

    // Get new version
    const newVersion = getCurrentVersion(pkg.dir);
    console.log(`  New version: ${newVersion}`);

    updates.push({
      name: pkg.name,
      oldVersion,
      newVersion,
    });

    console.log("");
  }

  console.log("📋 Version bump summary:");
  updates.forEach((update) => {
    console.log(
      `  ${update.name}: ${update.oldVersion} → ${update.newVersion}`
    );
  });
}

// Run the script
try {
  bumpAndPublishAlpha();
} catch (error) {
  console.error("❌ Script failed:", error.message);
  process.exit(1);
}
