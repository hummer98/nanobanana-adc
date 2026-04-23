#!/usr/bin/env node

import { Command, Option } from 'commander';
import {
  generate,
  assertAspect,
  type GenerateOptions,
  type GenerateSize,
} from './generate.js';

const program = new Command();

program
  .name('nanobanana-adc')
  .description('Gemini 3 Pro Image CLI with ADC support')
  .version('0.1.0')
  .requiredOption('-p, --prompt <text>', 'prompt text (required)')
  .option('-o, --output <path>', 'output file path', 'output.png')
  .option(
    '-a, --aspect <ratio>',
    'aspect ratio (1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9, 9:21, 5:4)',
    '1:1',
  )
  .addOption(
    new Option('-s, --size <size>', 'image size')
      .choices(['1K', '2K', '4K'])
      .default('1K'),
  )
  .option('-m, --model <id>', 'model id', 'gemini-3-pro-image-preview')
  .option('--api-key <key>', 'Gemini API key (falls back to GEMINI_API_KEY / ADC)');

async function main(): Promise<void> {
  program.parse(process.argv);

  const opts = program.opts<{
    prompt: string;
    output: string;
    aspect: string;
    size: string;
    model: string;
    apiKey?: string;
  }>();

  assertAspect(opts.aspect);

  const generateOptions: GenerateOptions = {
    prompt: opts.prompt,
    output: opts.output,
    aspect: opts.aspect,
    size: opts.size as GenerateSize,
    model: opts.model,
    apiKey: opts.apiKey,
  };

  await generate(generateOptions);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});
