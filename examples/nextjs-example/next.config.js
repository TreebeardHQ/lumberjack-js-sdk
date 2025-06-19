const { withTreebeardConfig } = require('@treebeardhq/nextjs/config');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js config options here
};

module.exports = withTreebeardConfig(nextConfig, {
  // Treebeard config options
  debug: true,
  uploadSourceMaps: true,
});