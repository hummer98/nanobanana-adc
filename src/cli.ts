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
import {
  buildDoctorReport,
  renderDoctorJSON,
  renderDoctorText,
  type DoctorEnv,
} from './doctor.js';

const CLI_VERSION = '0.4.0';

const program = new Command()
  .name('nanobanana-adc')
  .description('Gemini 3 Pro Image CLI with ADC support')
  .version('0.4.0');

program
  .command('generate', { isDefault: true })
  .description('Generate an image (default subcommand)')
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
  )
  .action(async (opts: {
    prompt: string;
    output: string;
    aspect: string;
    size: string;
    model: string;
    apiKey?: string;
    personGeneration?: string;
    embedMetadata: boolean;
  }) => {
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
  });

program
  .command('doctor')
  .description('Diagnose auth / env state (always exit 0; see --json for scripting)')
  .option('--json', 'emit machine-readable JSON')
  .option('-v, --verbose', 'include debug fields (ACCESS_TOKEN prefix 8 chars, gcloud raw, runtime)')
  .action(async (opts: { json?: boolean; verbose?: boolean }) => {
    // doctor の --api-key は受け取らない。将来拡張点として resolveAuthRoute は
    // apiKeyFlag を受け付けるが、現時点では常に undefined を渡す。
    const env = process.env as DoctorEnv;
    const report = await buildDoctorReport(env, {
      verbose: !!opts.verbose,
      argv1: process.argv[1] ?? '',
      version: CLI_VERSION,
    });
    const out = opts.json
      ? renderDoctorJSON(report) + '\n'
      : renderDoctorText(report);
    process.stdout.write(out);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});
