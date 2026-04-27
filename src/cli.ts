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
import { runAuthLogin, type LoginCliOptions } from './auth-login.js';

const CLI_VERSION = '0.7.0';

function nonEmpty(label: string) {
  return (value: string): string => {
    if (value === '' || value.trim() === '') {
      throw new InvalidArgumentError(`${label} must be a non-empty string`);
    }
    return value;
  };
}

const AUTH_LOGIN_HELP_AFTER = `
CLOUDSDK_CONFIG resolution priority:
  1. --config-dir <path>
  2. $CLOUDSDK_CONFIG (existing env)        [pass-through; auth login does not rewrite]
  3. $GOOGLE_APPLICATION_CREDENTIALS dirname (only if basename === 'application_default_credentials.json')
  4. gcloud OS default                      [auth login unsets CLOUDSDK_CONFIG]

Quota project resolution priority:
  1. --quota-project <id>
  2. --no-quota-project (skip)
  3. $GOOGLE_CLOUD_PROJECT
  4. otherwise: skip with notice
`;

export function buildAuthLoginCommand(
  onAction?: (opts: LoginCliOptions) => Promise<void>,
): Command {
  const cmd = new Command('login')
    .description(
      'Run `gcloud auth application-default login` with CLOUDSDK_CONFIG inline + optional quota/scope',
    )
    .option(
      '--config-dir <path>',
      'override CLOUDSDK_CONFIG (default: $CLOUDSDK_CONFIG → GAC dirname → gcloud OS default)',
      nonEmpty('--config-dir'),
    )
    .option(
      '--quota-project <id>',
      'run set-quota-project after login (default: $GOOGLE_CLOUD_PROJECT if set)',
      nonEmpty('--quota-project'),
    )
    .option(
      '--no-quota-project',
      'skip quota project set (overrides $GOOGLE_CLOUD_PROJECT default)',
    )
    .option(
      '--scopes <csv>',
      'pass --scopes=<csv> to gcloud (default: gcloud built-in scopes)',
      nonEmpty('--scopes'),
    )
    .option('--dry-run', 'print resolved plan and exit 0 without spawning gcloud')
    .option('--verbose', 'print argv used for the spawned gcloud invocation')
    .addHelpText('after', AUTH_LOGIN_HELP_AFTER)
    .action(async (opts: LoginCliOptions) => {
      if (onAction) {
        await onAction(opts);
        return;
      }
      const code = await runAuthLogin(opts);
      process.exit(code);
    });
  return cmd;
}

const program = new Command()
  .name('nanobanana-adc')
  .description('Gemini 3 Pro Image CLI with ADC support')
  .version(CLI_VERSION);

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
  .option(
    '--probe-metadata-server',
    'probe 169.254.169.254 (300ms) for GCE/Cloud Run metadata server',
    false,
  )
  .action(
    async (opts: { json?: boolean; verbose?: boolean; probeMetadataServer?: boolean }) => {
      // doctor の --api-key は受け取らない。将来拡張点として resolveAuthRoute は
      // apiKeyFlag を受け付けるが、現時点では常に undefined を渡す。
      const env: DoctorEnv = {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
        GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION,
        GOOGLE_GENAI_USE_VERTEXAI: process.env.GOOGLE_GENAI_USE_VERTEXAI,
        GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        K_SERVICE: process.env.K_SERVICE,
        GAE_APPLICATION: process.env.GAE_APPLICATION,
        KUBERNETES_SERVICE_HOST: process.env.KUBERNETES_SERVICE_HOST,
        CLOUD_BUILD_BUILDID: process.env.CLOUD_BUILD_BUILDID,
        CLOUDSDK_CONFIG: process.env.CLOUDSDK_CONFIG,
      };
      const report = await buildDoctorReport(env, {
        verbose: !!opts.verbose,
        argv1: process.argv[1] ?? '',
        version: CLI_VERSION,
        probeMetadataServer: !!opts.probeMetadataServer,
      });
      const out = opts.json
        ? renderDoctorJSON(report) + '\n'
        : renderDoctorText(report);
      process.stdout.write(out);
    },
  );

const auth = program
  .command('auth')
  .description('ADC / gcloud authentication setup');
auth.addCommand(buildAuthLoginCommand());

// Only auto-parse argv when this module is executed as the entry point.
// Importing it in tests (for buildAuthLoginCommand) must not consume process.argv.
const isEntry = (() => {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  // import.meta.url comparison would be cleaner but we want to keep this CommonJS-friendly
  // for the built dist/cli.js. The bin shim invokes dist/cli.js directly.
  return /\bcli\.js$/.test(argv1) || /\bnanobanana-adc$/.test(argv1);
})();

if (isEntry) {
  program.parseAsync(process.argv).catch((err: unknown) => {
    const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
    process.stderr.write(`${msg}\n`);
    process.exit(1);
  });
}
