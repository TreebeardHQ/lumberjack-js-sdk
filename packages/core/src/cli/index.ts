#!/usr/bin/env node

import { argv } from "process";

const command = argv[2];

async function main() {
  switch (command) {
    case "build":
      await import("./build.js");
      break;
    default:
      console.log("Usage: lumberjack-sdk-cli <command>");
      console.log("");
      console.log("Commands:");
      console.log("  build    Fetch and generate gatekeeper types");
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
