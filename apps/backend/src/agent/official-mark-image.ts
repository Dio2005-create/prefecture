import sharp = require('sharp');

const MAX_IMAGE_DIMENSION = 2400;

export async function extractOfficialMark(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels < 3 || info.width === 0 || info.height === 0) {
    throw new Error('L’image sélectionnée ne contient pas de pixels exploitables.');
  }

  const rgba = Buffer.alloc(info.width * info.height * 4);
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const source = (y * info.width + x) * info.channels;
      const target = (y * info.width + x) * 4;
      const red = data[source];
      const green = data[source + 1];
      const blue = data[source + 2];
      const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
      const inkStrength = Math.max(0, Math.min(255, Math.round((238 - luminance - 16) * 4)));

      rgba[target] = red;
      rgba[target + 1] = green;
      rgba[target + 2] = blue;
      rgba[target + 3] = Math.round(inkStrength * data[source + 3] / 255);

      if (rgba[target + 3] > 12) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (right < left || bottom < top) {
    throw new Error('Aucun trait de signature ou de cachet n’a été détecté. Essayez une image plus nette et mieux éclairée.');
  }

  const padding = Math.max(4, Math.round(Math.max(right - left + 1, bottom - top + 1) * 0.04));
  const cropLeft = Math.max(0, left - padding);
  const cropTop = Math.max(0, top - padding);
  const cropRight = Math.min(info.width - 1, right + padding);
  const cropBottom = Math.min(info.height - 1, bottom + padding);

  return sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({
      left: cropLeft,
      top: cropTop,
      width: cropRight - cropLeft + 1,
      height: cropBottom - cropTop + 1,
    })
    .png()
    .toBuffer();
}
