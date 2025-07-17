const { withLumberjackConfig } = require("@lumberjack-sdk/nextjs/config");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js config options here
};

module.exports = withLumberjackConfig(nextConfig, {
  // Lumberjack config options
  debug: true,
  uploadSourceMaps: true,
});
