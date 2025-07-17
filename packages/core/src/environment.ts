/**
 * Central utility for accessing environment variables and metadata
 * across different deployment platforms and CI/CD systems
 */

export interface EnvironmentInfo {
  commitSha?: string | undefined;
  branch?: string | undefined;
  buildId?: string | undefined;
  deploymentId?: string | undefined;
  platform?: string | undefined;
  environment?: string | undefined;
  version?: string | undefined;
  region?: string | undefined;
}

/**
 * Common environment variable mappings for different platforms
 */
const ENV_VAR_MAPPINGS = {
  commitSha: [
    "LUMBERJACK_COMMIT_SHA",
    "VERCEL_GIT_COMMIT_SHA",
    "GITHUB_SHA",
    "CI_COMMIT_SHA",
    "COMMIT_SHA",
    "GIT_COMMIT",
    "HEROKU_SLUG_COMMIT",
    "RENDER_GIT_COMMIT",
    "RAILWAY_GIT_COMMIT_SHA",
    "CF_PAGES_COMMIT_SHA",
    "NETLIFY_COMMIT_REF",
    "CIRCLE_SHA1",
    "TRAVIS_COMMIT",
    "BUILDKITE_COMMIT",
    "DRONE_COMMIT_SHA",
    "BITBUCKET_COMMIT",
    "AZURE_BUILD_SOURCEVERSION",
    "CODEBUILD_RESOLVED_SOURCE_VERSION",
  ],
  branch: [
    "LUMBERJACK_BRANCH",
    "VERCEL_GIT_COMMIT_REF",
    "GITHUB_REF_NAME",
    "CI_COMMIT_REF_NAME",
    "GIT_BRANCH",
    "HEROKU_SLUG_DESCRIPTION",
    "RENDER_GIT_BRANCH",
    "RAILWAY_GIT_BRANCH",
    "CF_PAGES_BRANCH",
    "NETLIFY_BRANCH",
    "CIRCLE_BRANCH",
    "TRAVIS_BRANCH",
    "BUILDKITE_BRANCH",
    "DRONE_COMMIT_BRANCH",
    "BITBUCKET_BRANCH",
    "SYSTEM_PULLREQUEST_SOURCEBRANCH",
  ],
  buildId: [
    "LUMBERJACK_BUILD_ID",
    "VERCEL_BUILD_ID",
    "GITHUB_RUN_ID",
    "CI_PIPELINE_ID",
    "BUILD_ID",
    "HEROKU_RELEASE_VERSION",
    "RENDER_SERVICE_ID",
    "RAILWAY_DEPLOYMENT_ID",
    "CF_PAGES_BUILD_ID",
    "NETLIFY_BUILD_ID",
    "CIRCLE_BUILD_NUM",
    "TRAVIS_BUILD_ID",
    "BUILDKITE_BUILD_ID",
    "DRONE_BUILD_NUMBER",
    "BITBUCKET_BUILD_NUMBER",
    "AZURE_BUILD_BUILDID",
    "CODEBUILD_BUILD_ID",
  ],
  deploymentId: [
    "LUMBERJACK_DEPLOYMENT_ID",
    "VERCEL_DEPLOYMENT_ID",
    "GITHUB_DEPLOYMENT_ID",
    "CI_DEPLOYMENT_ID",
    "DEPLOYMENT_ID",
    "HEROKU_DYNO_ID",
    "RENDER_INSTANCE_ID",
    "RAILWAY_REPLICA_ID",
    "CF_PAGES_URL",
    "NETLIFY_DEPLOY_ID",
  ],
  platform: [
    "LUMBERJACK_PLATFORM",
    "VERCEL",
    "GITHUB_ACTIONS",
    "GITLAB_CI",
    "CIRCLECI",
    "TRAVIS",
    "HEROKU",
    "RENDER",
    "RAILWAY",
    "NETLIFY",
    "CF_PAGES",
    "BUILDKITE",
    "DRONE",
    "AZURE_HTTP_USER_AGENT",
    "CODEBUILD_BUILD_ARN",
  ],
  environment: [
    "LUMBERJACK_ENVIRONMENT",
    "VERCEL_ENV",
    "GITHUB_ENVIRONMENT",
    "CI_ENVIRONMENT_NAME",
    "ENVIRONMENT",
    "NODE_ENV",
    "STAGE",
    "DEPLOYMENT_ENV",
    "APP_ENV",
  ],
  version: [
    "LUMBERJACK_VERSION",
    "VERCEL_GIT_COMMIT_MESSAGE",
    "GITHUB_REF",
    "CI_COMMIT_TAG",
    "VERSION",
    "RELEASE_VERSION",
    "APP_VERSION",
    "PACKAGE_VERSION",
  ],
  region: [
    "LUMBERJACK_REGION",
    "VERCEL_REGION",
    "AWS_REGION",
    "AWS_DEFAULT_REGION",
    "GOOGLE_CLOUD_REGION",
    "AZURE_REGION",
    "HEROKU_REGION",
    "RENDER_REGION",
    "RAILWAY_REGION",
    "CF_PAGES_BRANCH", // Cloudflare doesn't expose region directly
  ],
};

/**
 * Platform-specific detection logic
 */
const PLATFORM_DETECTION = {
  vercel: () => !!process.env.VERCEL,
  github: () => !!process.env.GITHUB_ACTIONS,
  gitlab: () => !!process.env.GITLAB_CI,
  circleci: () => !!process.env.CIRCLECI,
  travis: () => !!process.env.TRAVIS,
  heroku: () => !!process.env.DYNO,
  render: () => !!process.env.RENDER,
  railway: () => !!process.env.RAILWAY_ENVIRONMENT,
  netlify: () => !!process.env.NETLIFY,
  cloudflare: () => !!process.env.CF_PAGES,
  buildkite: () => !!process.env.BUILDKITE,
  drone: () => !!process.env.DRONE,
  azure: () => !!process.env.AZURE_HTTP_USER_AGENT,
  codebuild: () => !!process.env.CODEBUILD_BUILD_ARN,
  bitbucket: () => !!process.env.BITBUCKET_BUILD_NUMBER,
};

/**
 * Get the first available environment variable value from a list
 */
function getFirstAvailableEnvVar(envVars: string[]): string | undefined {
  for (const envVar of envVars) {
    const value = process.env[envVar];
    if (value && value.trim() !== "") {
      return value.trim();
    }
  }
  return undefined;
}

/**
 * Detect the current deployment platform
 */
function detectPlatform(): string | undefined {
  for (const [platform, detector] of Object.entries(PLATFORM_DETECTION)) {
    if (detector()) {
      return platform;
    }
  }
  return undefined;
}

/**
 * Get commit SHA from environment variables
 */
export function getCommitSha(): string | undefined {
  return getFirstAvailableEnvVar(ENV_VAR_MAPPINGS.commitSha);
}

/**
 * Get branch name from environment variables
 */
export function getBranch(): string | undefined {
  let branch = getFirstAvailableEnvVar(ENV_VAR_MAPPINGS.branch);

  // Clean up GitHub refs (refs/heads/main -> main)
  if (branch?.startsWith("refs/heads/")) {
    branch = branch.replace("refs/heads/", "");
  }
  if (branch?.startsWith("refs/tags/")) {
    branch = branch.replace("refs/tags/", "");
  }

  return branch;
}

/**
 * Get build ID from environment variables
 */
export function getBuildId(): string | undefined {
  return getFirstAvailableEnvVar(ENV_VAR_MAPPINGS.buildId);
}

/**
 * Get deployment ID from environment variables
 */
export function getDeploymentId(): string | undefined {
  return getFirstAvailableEnvVar(ENV_VAR_MAPPINGS.deploymentId);
}

/**
 * Get environment name (production, staging, development, etc.)
 */
export function getEnvironmentName(): string | undefined {
  return getFirstAvailableEnvVar(ENV_VAR_MAPPINGS.environment);
}

/**
 * Get version/release information
 */
export function getVersion(): string | undefined {
  return getFirstAvailableEnvVar(ENV_VAR_MAPPINGS.version);
}

/**
 * Get deployment region
 */
export function getRegion(): string | undefined {
  return getFirstAvailableEnvVar(ENV_VAR_MAPPINGS.region);
}

/**
 * Get comprehensive environment information
 */
export function getEnvironmentInfo(): EnvironmentInfo {
  return {
    commitSha: getCommitSha(),
    branch: getBranch(),
    buildId: getBuildId(),
    deploymentId: getDeploymentId(),
    platform: detectPlatform(),
    environment: getEnvironmentName(),
    version: getVersion(),
    region: getRegion(),
  };
}

/**
 * Get a formatted string describing the current deployment context
 */
export function getDeploymentContext(): string {
  const info = getEnvironmentInfo();
  const parts: string[] = [];

  if (info.platform) parts.push(`platform=${info.platform}`);
  if (info.environment) parts.push(`env=${info.environment}`);
  if (info.branch) parts.push(`branch=${info.branch}`);
  if (info.commitSha) parts.push(`commit=${info.commitSha.substring(0, 8)}`);
  if (info.region) parts.push(`region=${info.region}`);

  return parts.join(" ");
}

/**
 * Check if running in a CI/CD environment
 */
export function isCI(): boolean {
  return !!(
    process.env.CI ||
    process.env.CONTINUOUS_INTEGRATION ||
    process.env.BUILD_NUMBER ||
    detectPlatform()
  );
}

/**
 * Check if running in production environment
 */
export function isProduction(): boolean {
  const env = getEnvironmentName()?.toLowerCase();
  return !!(
    env === "production" ||
    env === "prod" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

/**
 * Check if running in development environment
 */
export function isDevelopment(): boolean {
  const env = getEnvironmentName()?.toLowerCase();
  return !!(
    env === "development" ||
    env === "dev" ||
    env === "local" ||
    process.env.VERCEL_ENV === "development" ||
    process.env.NODE_ENV === "development"
  );
}

/**
 * Get environment variable with fallback to Lumberjack-specific naming
 */
export function getEnvironmentValue(
  key: string,
  fallbacks: string[] = []
): string | undefined {
  // Try the exact key first
  const direct = process.env[key];
  if (direct && direct.trim() !== "") {
    return direct.trim();
  }

  // Try fallbacks
  for (const fallback of fallbacks) {
    const value = process.env[fallback];
    if (value && value.trim() !== "") {
      return value.trim();
    }
  }

  return undefined;
}
