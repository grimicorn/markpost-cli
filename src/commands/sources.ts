import chalk from 'chalk';
import { input, select } from '@inquirer/prompts';
import { createSource, deleteSource, fetchSources } from '@/libs/sources.js';
import { checkConfig } from '@/libs/config.js';
import { Source, SOURCE_TYPES } from '@/types/sources.types.js';

// Mirror the endpoint constants markpost's web app uses in
// app/composables/useSources.ts so the CLI shows the same URL a user would
// see there.
const WEBHOOK_INGEST_BASE = 'https://ingest.markpost.io/v1/hooks';
const EMAIL_DOMAIN = 'in.markpost.io';

const USAGE = `Usage: markpost sources <list|create|delete> [uuid]

  list           List all sources
  create         Create a new source (prompts for details)
  delete [uuid]  Delete a source; prompts to pick one if uuid is omitted`;

export const buildEndpointUrl = (
  sourceType: string,
  endpointSlug: string,
): string => {
  if (sourceType === 'email') {
    return `${endpointSlug}@${EMAIL_DOMAIN}`;
  }

  return `${WEBHOOK_INGEST_BASE}/${endpointSlug}`;
};

export const runSourcesCommand = async (args: string[]): Promise<void> => {
  try {
    await checkConfig();

    const [subcommand, uuid] = args;

    if (subcommand === 'list') {
      await listSources();
      return;
    }

    if (subcommand === 'create') {
      await createSourceCommand();
      return;
    }

    if (subcommand === 'delete') {
      await deleteSourceCommand(uuid);
      return;
    }

    console.log(USAGE);
  } catch (error) {
    console.error(chalk.redBright(error));
  }
};

const printSource = (source: Source): void => {
  console.log(chalk.bold(source.name));
  console.log(`  uuid:      ${source.uuid}`);
  console.log(`  type:      ${source.type}`);
  console.log(
    `  endpoint:  ${buildEndpointUrl(source.type, source.endpointSlug)}`,
  );
  console.log(`  folder:    ${source.routeFolder}`);
  console.log(`  records:   ${source.recordCount}`);
  console.log(`  last hit:  ${source.lastHitAt ?? 'never hit'}`);
};

const listSources = async (): Promise<void> => {
  const sources = await fetchSources();

  if (sources.length === 0) {
    console.log('No sources found.');
    return;
  }

  sources.forEach(printSource);
};

const createSourceCommand = async (): Promise<void> => {
  const type = await select({
    message: 'Source type',
    choices: SOURCE_TYPES.map((sourceType) => ({ value: sourceType })),
  });
  const name = await input({ message: 'Source name' });
  const routeFolder = await input({
    message: 'Route folder (e.g. 99-incoming/)',
  });
  const provider = await input({
    message: 'Provider (optional)',
    default: '',
  });

  const source = await createSource({
    type,
    name,
    routeFolder,
    provider: provider || undefined,
  });

  if (!source) {
    console.error(chalk.redBright('Failed to create source.'));
    return;
  }

  console.log(chalk.greenBright(`Created source "${source.name}"`));
  printSource(source);
};

const promptForSourceToDelete = async (): Promise<Source | null> => {
  const sources = await fetchSources();

  if (sources.length === 0) {
    console.log('No sources to delete.');
    return null;
  }

  const selectedUuid = await select({
    message: 'Select a source to delete',
    choices: sources.map((source) => ({
      name: `${source.name} (${source.type})`,
      value: source.uuid,
    })),
  });

  return sources.find((source) => source.uuid === selectedUuid) ?? null;
};

const deleteSourceCommand = async (uuid?: string): Promise<void> => {
  const targetUuid = uuid ?? (await promptForSourceToDelete())?.uuid;

  if (!targetUuid) {
    return;
  }

  const meta = await deleteSource(targetUuid);

  if (!meta) {
    console.error(chalk.redBright('Failed to delete source.'));
    return;
  }

  console.log(chalk.greenBright(`Deleted ${meta.deleted} source(s).`));
};
