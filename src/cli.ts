#!/usr/bin/env node

async function main(): Promise<void> {
  // Entry point for nanobanana-adc CLI.
  // Real argument parsing and dispatch will be implemented in T04.
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
