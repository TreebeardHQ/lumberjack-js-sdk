import type { NextConfig } from 'next';
import { execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

export interface TreebeardConfigOptions {
  /**
   * Service token for uploading sourcemaps
   * Will be read from TREEBEARD_SERVICE_TOKEN environment variable if not provided
   */
  serviceToken?: string;
  
  /**
   * Enable/disable sourcemap uploading
   * @default true
   */
  uploadSourceMaps?: boolean;
  
  /**
   * Custom sourcemap upload endpoint
   * @default 'https://api.treebeard.com/sourcemaps'
   */
  uploadUrl?: string;
  
  /**
   * Project identifier for sourcemap uploads
   * Will be read from package.json name if not provided
   */
  project?: string;
  
  /**
   * Git commit SHA to associate with sourcemaps
   * Will be auto-detected if not provided
   */
  commit?: string;
  
  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
  
  /**
   * Custom environment variable name for the commit SHA
   * @default 'TREEBEARD_COMMIT_SHA'
   */
  commitEnvVar?: string;
}

/**
 * Get the current git commit SHA
 */
function getGitCommitSha(debug = false): string | null {
  try {
    const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    if (debug) {
      console.log('[Treebeard] Detected git commit:', commit);
    }
    return commit;
  } catch (error) {
    if (debug) {
      console.warn('[Treebeard] Failed to detect git commit:', error);
    }
    return null;
  }
}

/**
 * Get project name from package.json
 */
function getProjectName(debug = false): string | null {
  try {
    const packageJsonPath = join(process.cwd(), 'package.json');
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      const name = packageJson.name;
      if (debug) {
        console.log('[Treebeard] Detected project name from package.json:', name);
      }
      return name;
    }
  } catch (error) {
    if (debug) {
      console.warn('[Treebeard] Failed to read project name from package.json:', error);
    }
  }
  return null;
}

/**
 * Recursively find all .js.map files in a directory
 */
function findFilesRecursive(dir: string, extension: string): string[] {
  const files: string[] = [];
  
  try {
    const entries = readdirSync(dir);
    
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...findFilesRecursive(fullPath, extension));
      } else if (stat.isFile() && entry.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Ignore errors (directory might not exist or be accessible)
  }
  
  return files;
}

/**
 * Find all sourcemap files in the Next.js build output
 */
function findSourceMapFiles(debug = false): Array<{ filePath: string; url: string }> {
  const buildDir = join(process.cwd(), '.next');
  const staticDir = join(buildDir, 'static');
  
  if (!existsSync(staticDir)) {
    if (debug) {
      console.warn('[Treebeard] No .next/static directory found');
    }
    return [];
  }

  try {
    // Find all .js.map files in .next/static
    const sourcemapFiles = findFilesRecursive(staticDir, '.js.map');
    
    const files = sourcemapFiles.map((filePath: string) => {
      // Convert file path to URL path for sourcemap mapping
      const relativePath = relative(staticDir, filePath);
      const url = `~/_next/static/${relativePath.replace(/\\/g, '/')}`;
      return { filePath, url };
    });
    
    if (debug) {
      console.log('[Treebeard] Found sourcemap files:', files.length);
      files.forEach((file: { filePath: string; url: string }) => {
        console.log(`  ${file.url} -> ${file.filePath}`);
      });
    }
    
    return files;
  } catch (error) {
    if (debug) {
      console.warn('[Treebeard] Error finding sourcemap files:', error);
    }
    return [];
  }
}

/**
 * Create FormData for sourcemap upload
 */
async function createSourceMapFormData(
  files: Array<{ filePath: string; url: string }>,
  project: string,
  commit: string,
  debug = false
): Promise<FormData> {
  const formData = new FormData();
  
  // Add metadata
  formData.append('project', project);
  formData.append('commit', commit);
  formData.append('version', commit); // Use commit as version
  
  // Add each sourcemap file
  for (const file of files) {
    try {
      const content = readFileSync(file.filePath, 'utf8');
      const blob = new Blob([content], { type: 'application/json' });
      
      // Use the URL path as the field name
      formData.append('sourcemap', blob, file.url);
      
      if (debug) {
        console.log(`[Treebeard] Added sourcemap: ${file.url} (${content.length} bytes)`);
      }
    } catch (error) {
      if (debug) {
        console.warn(`[Treebeard] Failed to read sourcemap file ${file.filePath}:`, error);
      }
    }
  }
  
  return formData;
}

/**
 * Upload sourcemaps to Treebeard
 */
async function uploadSourceMaps(options: Required<Pick<TreebeardConfigOptions, 'serviceToken' | 'uploadUrl' | 'project' | 'commit' | 'debug'>>) {
  const { serviceToken, uploadUrl, project, commit, debug } = options;
  
  try {
    if (debug) {
      console.log('[Treebeard] Starting sourcemap upload...', { project, commit, uploadUrl });
    }
    
    // Find all sourcemap files
    const sourcemapFiles = findSourceMapFiles(debug);
    
    if (sourcemapFiles.length === 0) {
      if (debug) {
        console.log('[Treebeard] No sourcemap files found, skipping upload');
      }
      return;
    }
    
    // Create form data
    const formData = await createSourceMapFormData(sourcemapFiles, project, commit, debug);
    
    // Upload to Treebeard API
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceToken}`,
        'User-Agent': '@treebeardhq/nextjs'
      },
      body: formData
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    
    if (debug) {
      console.log('[Treebeard] Sourcemap upload successful:', result);
    } else {
      console.log(`[Treebeard] Successfully uploaded ${sourcemapFiles.length} sourcemap(s) for ${project}@${commit}`);
    }
    
  } catch (error) {
    console.error('[Treebeard] Failed to upload sourcemaps:', error);
    throw error;
  }
}

/**
 * Validate service token and show warning if missing
 */
function validateServiceToken(serviceToken?: string, debug = false): string | null {
  const token = serviceToken || process.env.TREEBEARD_SERVICE_TOKEN;
  
  if (!token) {
    console.warn(
      '\n⚠️  [Treebeard] Service token not found!\n' +
      'Sourcemap uploading is disabled. To enable it:\n' +
      '1. Get your service token from: https://app.treebeardhq.com/service-token\n' +
      '2. Set TREEBEARD_SERVICE_TOKEN environment variable\n' +
      '   or pass it to withTreebeardConfig({ serviceToken: "..." })\n'
    );
    return null;
  }
  
  if (debug) {
    console.log('[Treebeard] Service token found');
  }
  
  return token;
}

/**
 * Wraps Next.js config to add Treebeard functionality
 */
export function withTreebeardConfig(
  nextConfig: NextConfig = {},
  treebeardOptions: TreebeardConfigOptions = {}
): NextConfig {
  const {
    serviceToken,
    uploadSourceMaps = true,
    uploadUrl = 'https://api.treebeard.com/sourcemaps',
    project,
    commit,
    debug = false,
    commitEnvVar = 'TREEBEARD_COMMIT_SHA'
  } = treebeardOptions;

  // Validate service token
  const validatedServiceToken = validateServiceToken(serviceToken, debug);
  
  // Get commit SHA
  const commitSha = commit || getGitCommitSha(debug);
  
  // Get project name
  const projectName = project || getProjectName(debug) || 'unknown';
  
  if (debug) {
    console.log('[Treebeard] Config wrapper initialized', {
      uploadSourceMaps,
      uploadUrl,
      project: projectName,
      commit: commitSha,
      hasServiceToken: !!validatedServiceToken
    });
  }

  // Merge environment variables
  const env = {
    ...(nextConfig.env || {}),
  };
  
  // Add commit SHA to environment if available
  if (commitSha) {
    env[commitEnvVar] = commitSha;
    if (debug) {
      console.log(`[Treebeard] Injected ${commitEnvVar}=${commitSha} into environment`);
    }
  }

  // Create the enhanced config
  const enhancedConfig: NextConfig = {
    ...nextConfig,
    env,
    // Enable source maps for production builds
    productionBrowserSourceMaps: nextConfig.productionBrowserSourceMaps ?? true,
  };

  // Wrap the webpack config to add sourcemap upload
  const originalWebpack = nextConfig.webpack;
  enhancedConfig.webpack = (config, options) => {
    // Call original webpack config if it exists
    if (originalWebpack) {
      config = originalWebpack(config, options) || config;
    }

    // Add sourcemap upload plugin for production builds
    if (!options.dev && uploadSourceMaps && validatedServiceToken && commitSha) {
      if (debug) {
        console.log('[Treebeard] Adding sourcemap upload to webpack build');
      }
      
      // Add a plugin to upload sourcemaps after build
      config.plugins = config.plugins || [];
      config.plugins.push(
        new SourceMapUploadPlugin({
          serviceToken: validatedServiceToken,
          uploadUrl,
          project: projectName,
          commit: commitSha,
          debug
        })
      );
    }

    return config;
  };

  return enhancedConfig;
}

/**
 * Webpack plugin to upload sourcemaps after build
 */
class SourceMapUploadPlugin {
  private options: Required<Pick<TreebeardConfigOptions, 'serviceToken' | 'uploadUrl' | 'project' | 'commit' | 'debug'>>;

  constructor(options: Required<Pick<TreebeardConfigOptions, 'serviceToken' | 'uploadUrl' | 'project' | 'commit' | 'debug'>>) {
    this.options = options;
  }

  apply(compiler: any) {
    compiler.hooks.afterEmit.tapAsync('SourceMapUploadPlugin', async (_compilation: any, callback: any) => {
      try {
        if (this.options.debug) {
          console.log('[Treebeard] Build completed, uploading sourcemaps...');
        }
        
        await uploadSourceMaps(this.options);
        
        if (this.options.debug) {
          console.log('[Treebeard] Sourcemap upload completed');
        }
      } catch (error) {
        console.error('[Treebeard] Sourcemap upload failed:', error);
        // Don't fail the build, just log the error
      }
      
      callback();
    });
  }
}