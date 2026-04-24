#!/usr/bin/env node

import { Command, InvalidArgumentError, Option } from 'commander';
import {
  generate,
  assertAspect,
  assertPersonGeneration,
  PERSON_GENERATION_MODES,
  type GenerateOptions,
  type GenerateSize,
} from './generate.js';

const program = new Command();

program
  .name('nanobanana-adc')
  .description('Gemini 3 Pro Image CLI with ADC support')
  .version('0.3.0')
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
  .option('--api-key <key>', 'Gemini API key (falls back to GEMINI_API_KEY / ADC)')
  .addOption(
    new Option('--person-generation <mode>', 'control person generation')
      .choices([...PERSON_GENERATION_MODES])
      .argParser((v: string) => {
        const upper = v.toUpperCase();
        if (!(PERSON_GENERATION_MODES as readonly string[]).includes(upper)) {
          throw new InvalidArgumentError(
            `Allowed choices are ${PERSON_GENERATION_MODES.join(', ')}.`,
          );
        }
        return upper;
      }),
  )
  .option(
    '--no-embed-metadata',
    'do not embed AIview-compatible parameters metadata (PNG only; default: embed)',
  );

async function main(): Promise<void> {
  program.parse(process.argv);

  const opts = program.opts<{
    prompt: string;
    output: string;
    aspect: string;
    size: string;
    model: string;
    apiKey?: string;
    personGeneration?: string;
    embedMetadata: boolean;
  }>();

  assertAspect(opts.aspect);

  const generateOptions: GenerateOptions = {
    prompt: opts.prompt,
    output: opts.output,
    aspect: opts.aspect,
    size: opts.size as GenerateSize,
    model: opts.model,
    apiKey: opts.apiKey,
    embedMetadata: opts.embedMetadata,
  };

  if (opts.personGeneration) {
    assertPersonGeneration(opts.personGeneration);
    generateOptions.personGeneration = opts.personGeneration;
  }

  await generate(generateOptions);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});
