# Source Map Upload Improvements

## Overview

This document describes the improvements made to the Next.js source map uploader to capture both client-side and server-side source maps.

## Problem

Previously, the source map uploader only captured client-side source maps from the `.next/static` directory, missing important server-side source maps for:

- API routes (`/api/hello/route.js.map`)
- Server components (`/app/page.js.map`)
- Server chunks and utilities

## Solution

### 1. Enhanced Source Map Discovery

Updated `findSourceMapFiles()` function to search in both:

- `.next/static/` - Client-side source maps
- `.next/server/` - Server-side source maps

**Before:**

```typescript
// Only searched .next/static
const sourcemapFiles = findFilesRecursive(staticDir, ".js.map");
```

**After:**

```typescript
// Searches both client and server directories
if (existsSync(staticDir)) {
  const clientSourcemaps = findFilesRecursive(staticDir, ".js.map");
  // Map to .next/static/... URLs
}

if (existsSync(serverDir)) {
  const serverSourcemaps = findFilesRecursive(serverDir, ".js.map");
  // Map to .next/server/... URLs
}
```

### 2. Webpack Configuration Enhancement

Added automatic server-side source map generation in production builds:

```typescript
// Enable source maps for server-side code in production
if (!options.dev && options.isServer) {
  config.devtool = "source-map";
}
```

### 3. URL Pattern Mapping

Server-side source maps use a different URL pattern to distinguish them from client-side maps:

- Client: `.next/static/chunks/main.js.map`
- Server: `.next/server/app/api/hello/route.js.map`

## Test Coverage

Comprehensive test suite covers:

### Core Functionality

- ✅ Finds both client-side and server-side source maps
- ✅ Handles missing directories gracefully
- ✅ Includes API route source maps
- ✅ Includes server component source maps
- ✅ Logs debug information correctly

### Webpack Integration

- ✅ Enables server-side source maps in production
- ✅ Doesn't modify client builds
- ✅ Doesn't modify development builds

### Integration

- ✅ Uploads both client and server source maps
- ✅ Creates proper form data with metadata

## Results

**Before:** Only ~10 client-side source maps uploaded

**After:** Both client and server source maps uploaded (example output):

```
[Treebeard] Found sourcemap files: 22
  Client-side (10 files):
    .next/static/chunks/4bd1b696-0cb0a6cb76161ba2.js.map
    .next/static/chunks/684-700da991f1883e32.js.map
    ...

  Server-side (12 files):
    .next/server/app/api/hello/route.js.map
    .next/server/app/page.js.map
    .next/server/chunks/580.js.map
    ...
```

## Usage

Users can now capture complete source map coverage by using the `withTreebeardConfig` wrapper:

```javascript
// next.config.js
const { withTreebeardConfig } = require("@treebeardhq/nextjs/config");

module.exports = withTreebeardConfig(
  {
    // Next.js config
  },
  {
    // Treebeard config
    uploadSourceMaps: true,
    debug: true,
  }
);
```

The uploader will automatically:

1. Enable server-side source map generation
2. Discover all source maps (client + server)
3. Upload them with proper URL mappings for source resolution

## Files Modified

- `packages/nextjs/src/config.ts` - Enhanced source map discovery and webpack config
- `packages/nextjs/src/config.test.ts` - Comprehensive test suite
- `packages/nextjs/package.json` - Added Jest configuration and test dependencies
