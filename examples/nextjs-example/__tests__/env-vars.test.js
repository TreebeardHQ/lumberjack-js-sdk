const { execSync } = require('child_process');
const { readFileSync, rmSync, existsSync } = require('fs');
const { join } = require('path');

describe('Lumberjack environment variables', () => {
  const testDir = join(__dirname, '..');
  const buildDir = join(testDir, '.next');
  
  beforeAll(() => {
    // Clean any existing build
    if (existsSync(buildDir)) {
      rmSync(buildDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    // Clean up build artifacts
    if (existsSync(buildDir)) {
      rmSync(buildDir, { recursive: true, force: true });
    }
  });

  test('LUMBERJACK_COMMIT_SHA is available during build', () => {
    // Create a simple page that outputs the env var
    const testPagePath = join(testDir, 'app', 'test-env', 'page.tsx');
    const testPageContent = `
export default function TestEnvPage() {
  const commitSha = process.env.LUMBERJACK_COMMIT_SHA || 'NOT_FOUND';
  return (
    <div>
      <h1>Commit SHA: {commitSha}</h1>
      <pre>{JSON.stringify({ LUMBERJACK_COMMIT_SHA: commitSha }, null, 2)}</pre>
    </div>
  );
}
`;
    
    // Write test page
    const { mkdirSync, writeFileSync } = require('fs');
    mkdirSync(join(testDir, 'app', 'test-env'), { recursive: true });
    writeFileSync(testPagePath, testPageContent);

    try {
      // Run Next.js build
      console.log('Running Next.js build...');
      execSync('npm run build', {
        cwd: testDir,
        stdio: 'pipe',
        env: {
          ...process.env,
          NODE_ENV: 'production'
        }
      });

      // Check if build output contains the env var
      const serverChunkFiles = require('glob').sync(
        join(buildDir, 'server', 'app', 'test-env', '*.js')
      );
      
      expect(serverChunkFiles.length).toBeGreaterThan(0);
      
      // Read the generated server file
      const serverFileContent = readFileSync(serverChunkFiles[0], 'utf8');
      
      // The commit SHA should be embedded in the build
      // Next.js inlines process.env values at build time
      expect(serverFileContent).toContain('LUMBERJACK_COMMIT_SHA');
      
      // Clean up test page
      rmSync(join(testDir, 'app', 'test-env'), { recursive: true, force: true });
    } catch (error) {
      // Clean up test page on error
      rmSync(join(testDir, 'app', 'test-env'), { recursive: true, force: true });
      throw error;
    }
  });

  test('Environment variable is accessible at runtime', () => {
    // Create an API route that returns env vars
    const apiRoutePath = join(testDir, 'app', 'api', 'env-test', 'route.ts');
    const apiRouteContent = `
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    LUMBERJACK_COMMIT_SHA: process.env.LUMBERJACK_COMMIT_SHA || 'NOT_FOUND',
    NODE_ENV: process.env.NODE_ENV,
  });
}
`;
    
    // Write API route
    const { mkdirSync, writeFileSync } = require('fs');
    mkdirSync(join(testDir, 'app', 'api', 'env-test'), { recursive: true });
    writeFileSync(apiRoutePath, apiRouteContent);

    try {
      // Build the app
      execSync('npm run build', {
        cwd: testDir,
        stdio: 'pipe',
        env: {
          ...process.env,
          NODE_ENV: 'production'
        }
      });

      // Check the API route file was built
      const apiFiles = require('glob').sync(
        join(buildDir, 'server', 'app', 'api', 'env-test', '*.js')
      );
      
      expect(apiFiles.length).toBeGreaterThan(0);
      
      // Clean up API route
      rmSync(join(testDir, 'app', 'api', 'env-test'), { recursive: true, force: true });
    } catch (error) {
      // Clean up API route on error
      rmSync(join(testDir, 'app', 'api', 'env-test'), { recursive: true, force: true });
      throw error;
    }
  });

  test('withLumberjackConfig does not pass unrecognized keys to Next.js', () => {
    // Read the next.config.js to ensure it uses withLumberjackConfig
    const configContent = readFileSync(join(testDir, 'next.config.js'), 'utf8');
    expect(configContent).toContain('withLumberjackConfig');
    
    // Build should not show warning about unrecognized keys
    const buildOutput = execSync('npm run build', {
      cwd: testDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'production'
      }
    });
    
    // Check that the warning about 'commitEnvVar' is not present
    expect(buildOutput).not.toContain("Unrecognized key(s) in object: 'commitEnvVar'");
  });
});