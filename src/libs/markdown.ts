import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { Record } from '@/types/records.types.js';

export const writeMarkdown = (record: Record) => {
  const vaultPath = join(
    homedir(),
    'Library/Mobile Documents/iCloud~md~obsidian/Documents/Vault',
    process.env.VAULT_DIRECTORY as string,
  );

  if (!existsSync(vaultPath)) {
    mkdirSync(vaultPath, { recursive: true });
  }

  writeFileSync(join(vaultPath, `${record.title}.md`), record.content);
};
