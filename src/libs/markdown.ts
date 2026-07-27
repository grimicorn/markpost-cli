import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import {
  basename,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import slugify from '@sindresorhus/slugify';
import { config } from '@/libs/config.js';
import { Record } from '@/types/records.types.js';

const MARKDOWN_EXTENSION = '.md';
const FIRST_COLLISION_SUFFIX = 2;
// Give up rather than loop forever if a directory somehow has this many
// same-slug files already; something else is wrong at that point. Exported
// so tests can assert against it instead of duplicating the literal.
export const MAX_COLLISION_SUFFIX = 1000;
// Last-resort filename stem when both the title and its fallback (the
// record's uuid) slugify to nothing at all.
const UNTITLED_SLUG = 'untitled';
// node:fs exclusive-write flag: fail instead of silently overwriting when
// the target path already exists.
const EXCLUSIVE_WRITE_FLAG = 'wx';
const FILE_ALREADY_EXISTS_ERROR_CODE = 'EEXIST';

const getOutputDirectory = () => {
  return (
    process.env.OUTPUT_DIRECTORY ?? (config.get('outputDirectory') as string)
  );
};

// Slugify the title so it is always a single, safe path segment. Falls back
// to the record's uuid when the title has no sluggable characters at all
// (e.g. symbols-only, or non-Latin text the slugifier can't transliterate),
// so distinct empty-slug records stay traceable to their source record
// instead of all collapsing into the same bucket. The fallback is slugified
// too: it is API-controlled data, not a value we can trust to already be a
// safe path segment.
const slugifyTitle = (title: string, fallbackSlug: string): string => {
  return slugify(title) || slugify(fallbackSlug) || UNTITLED_SLUG;
};

// Resolve `fileName` against `outputDirectory` and verify the result is
// still inside it. Slugifying the title already strips path separators and
// `..` segments, but this is a second, independent guard against writing
// outside outputDirectory rather than trusting slugification alone.
const resolveWithinOutputDirectory = (
  outputDirectory: string,
  fileName: string,
): string => {
  const resolvedDirectory = resolve(outputDirectory);
  const resolvedPath = resolve(resolvedDirectory, fileName);
  const relativePath = relative(resolvedDirectory, resolvedPath);
  const escapesDirectory =
    relativePath === '..' || relativePath.startsWith(`..${sep}`);
  const isWithinDirectory =
    relativePath !== '' && !escapesDirectory && !isAbsolute(relativePath);

  if (!isWithinDirectory) {
    throw Error(`Refusing to write outside output directory: ${fileName}`);
  }

  return resolvedPath;
};

const isFileAlreadyExistsError = (error: unknown): boolean => {
  return (
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code === FILE_ALREADY_EXISTS_ERROR_CODE
  );
};

// Two records can slugify to the same title. Rather than silently
// overwriting one, try `<slug>`, `<slug>-2`, `<slug>-3`, ... until a write
// actually succeeds, so every record keeps its own file. The write uses the
// exclusive-create flag so the "is this path free?" check and the write
// itself are one atomic filesystem operation instead of two separate steps
// with a race between them.
const writeToFirstAvailablePath = (
  outputDirectory: string,
  slug: string,
  content: string,
): string => {
  let candidateFileName = `${slug}${MARKDOWN_EXTENSION}`;
  let suffix = FIRST_COLLISION_SUFFIX;

  while (suffix <= MAX_COLLISION_SUFFIX) {
    const candidatePath = resolveWithinOutputDirectory(
      outputDirectory,
      candidateFileName,
    );

    try {
      writeFileSync(candidatePath, content, { flag: EXCLUSIVE_WRITE_FLAG });
      return candidatePath;
    } catch (error) {
      if (!isFileAlreadyExistsError(error)) {
        throw error;
      }
    }

    candidateFileName = `${slug}-${suffix}${MARKDOWN_EXTENSION}`;
    suffix += 1;
  }

  throw Error(
    `Too many filename collisions for "${slug}" in ${outputDirectory}`,
  );
};

export const writeMarkdown = (record: Record): string => {
  const outputDirectory = getOutputDirectory();

  if (!outputDirectory) {
    throw Error('Output directory is not set!');
  }

  if (!existsSync(outputDirectory)) {
    mkdirSync(outputDirectory, { recursive: true });
  }

  const slug = slugifyTitle(record.title, record.uuid);

  return writeToFirstAvailablePath(outputDirectory, slug, record.content);
};

// Used by the push command to create a new record from a local file: the
// title comes from the filename (no extension). Note this is the filename
// as written on disk, which may be a slug rather than the original title
// if the file was previously pulled down by writeMarkdown.
export const readMarkdown = (
  filePath: string,
): Pick<Record, 'title' | 'content'> => {
  if (!existsSync(filePath)) {
    throw Error(`File not found: ${filePath}`);
  }

  return {
    title: basename(filePath, extname(filePath)),
    content: readFileSync(filePath, 'utf-8'),
  };
};
