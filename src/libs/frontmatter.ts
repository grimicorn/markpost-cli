import { Frontmatter, Record } from '@/types/records.types.js';

// Faithful mirror of markpost's server/utils/markdown.ts frontmatter assembly
// (`quoteYamlScalar`, `serializeTagsLine`, `serializeFrontmatter`,
// `assembleMarkdownDocument`). markpost is the source of truth: synced files
// must be byte-identical to what markpost would write, so the serialization
// here is kept deliberately in lockstep with that file. Update both together.

const FRONTMATTER_DELIMITER = '---';
const HEADING_PREFIX = '# ';
const BLOCK_SEPARATOR = '\n\n';
const EMPTY_TAGS_LINE = 'tags: []';
// Any of these characters give a bare YAML scalar a second meaning (map key,
// flow collection, anchor, comment, quote, ...), so a value containing one
// must be quoted to survive a round-trip through a real YAML parser.
const YAML_SPECIAL_CHARACTERS = /[:#[\]{}&!|>'"%@`,]/;

const quoteYamlScalar = (value: string): string => {
  const needsQuoting =
    YAML_SPECIAL_CHARACTERS.test(value) ||
    value.includes('\n') ||
    value.trim() !== value;

  if (!needsQuoting) {
    return value;
  }

  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');

  return `"${escaped}"`;
};

const serializeTagsLine = (tags: string[]): string => {
  if (tags.length === 0) {
    return EMPTY_TAGS_LINE;
  }

  const quotedTags = tags.map((tag) => quoteYamlScalar(tag)).join(', ');

  return `tags: [${quotedTags}]`;
};

export const serializeFrontmatter = (frontmatter: Frontmatter): string => {
  return [
    FRONTMATTER_DELIMITER,
    `title: ${quoteYamlScalar(frontmatter.title)}`,
    `source: ${quoteYamlScalar(frontmatter.source)}`,
    `created: ${frontmatter.created}`,
    serializeTagsLine(frontmatter.tags),
    FRONTMATTER_DELIMITER,
  ].join('\n');
};

type MarkdownDocument = {
  title: string;
  body: string;
  frontmatter: Frontmatter;
};

// The title-heading + body half of a document, shared by the full assembly
// (with frontmatter) and the frontmatter-disabled path (heading + body only).
const assembleTitledBody = (title: string, body: string): string => {
  return `${HEADING_PREFIX}${title}${BLOCK_SEPARATOR}${body}`;
};

export const assembleMarkdownDocument = (
  document: MarkdownDocument,
): string => {
  const frontmatterBlock = serializeFrontmatter(document.frontmatter);

  return `${frontmatterBlock}${BLOCK_SEPARATOR}${assembleTitledBody(document.title, document.body)}`;
};

const isPlainObject = (value: unknown): value is { [key: string]: unknown } => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const asString = (value: unknown, fallback: string): string => {
  return typeof value === 'string' ? value : fallback;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
};

// markpost's `created` is always an ISO-8601 string it derived via
// `resolveCreatedDate`, and it serializes the value unquoted. Mirroring that
// verbatim would let malformed API JSON (a `created` carrying a newline or a
// YAML control character) inject frontmatter keys, since `created` is the one
// field markpost emits without quoting. Accept only a date-shaped string and
// otherwise fall back to the record's `createdAt`, so valid timestamps stay
// byte-identical to markpost while junk can't break out of the value.
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+Z-]*)?$/;

const asTimestamp = (value: unknown, fallback: string): string => {
  if (typeof value === 'string' && TIMESTAMP_PATTERN.test(value)) {
    return value;
  }

  return fallback;
};

// The stored frontmatter object is markpost's single source of truth for a
// record's metadata, so key assembly off its presence: re-deriving `created`
// from the record's `createdAt` (the row's insert time) would diverge from the
// payload-resolved date markpost baked into the frontmatter. Its fields are
// typed but arrive as untrusted API JSON, so each is guarded with a fallback
// rather than assumed well-formed.
const normalizeFrontmatter = (record: Record): Frontmatter | null => {
  const raw = record.frontmatter;

  if (!isPlainObject(raw)) {
    return null;
  }

  return {
    title: asString(raw.title, record.title),
    source: asString(raw.source, record.source ?? ''),
    created: asTimestamp(raw.created, record.createdAt),
    tags: asStringArray(raw.tags),
  };
};

// Builds the full .md file contents for a record: a frontmatter block, title
// heading, and body when the record carries markpost-assembled metadata;
// otherwise the bare content (records with no frontmatter, e.g. `markpost
// push` created). `includeFrontmatter` is the user's `frontmatter` setting —
// when off, only the YAML frontmatter block is omitted; the `# Title` heading
// and body are still written, so disabling frontmatter doesn't silently
// discard the record's title (which autoDelete would then make unrecoverable).
export const buildRecordDocument = (
  record: Record,
  includeFrontmatter = true,
): string => {
  const frontmatter = normalizeFrontmatter(record);

  if (!frontmatter) {
    return record.content;
  }

  if (!includeFrontmatter) {
    return assembleTitledBody(frontmatter.title, record.content);
  }

  // Use the frontmatter's title for the heading too, so the block title and
  // the `# ` heading always agree (matching markpost, which writes one title
  // in both places from a single parsed payload).
  return assembleMarkdownDocument({
    title: frontmatter.title,
    body: record.content,
    frontmatter,
  });
};
