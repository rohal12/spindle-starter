import { createWriteStream, mkdirSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import archiver from 'archiver';
import type { BuildContext } from '../types.js';

const README_TEXT = `JoiPlay HTML Game

To play this story in JoiPlay:

1. Install JoiPlay and the JoiPlay HTML Plugin from the Play Store
2. Extract this zip to a folder on your device
3. Open JoiPlay, tap the + button
4. Select the index.html file from the extracted folder
5. Tap Play

Enjoy!
`;

export async function buildJoiPlay(ctx: BuildContext): Promise<void> {
  const outDir = join(ctx.outDir, 'joiplay');
  mkdirSync(outDir, { recursive: true });

  const zipName = `${ctx.config.name.replace(/\s+/g, '-')}-joiplay.zip`;
  const zipPath = join(outDir, zipName);

  console.log(`[spindle-pack] Creating JoiPlay zip: ${zipName}`);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);

    // Add all dist/ contents, excluding the pack/ output directory
    archive.glob('**/*', {
      cwd: ctx.distDir,
      ignore: ['pack/**'],
    });

    // Add README
    archive.append(README_TEXT, { name: 'README.txt' });

    archive.finalize();
  });

  console.log(`[spindle-pack] JoiPlay zip created: ${zipPath}`);
}
