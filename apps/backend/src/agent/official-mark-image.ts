import sharp = require('sharp');

const MAX_IMAGE_DIMENSION = 2400;
const INK_DETECTION_THRESHOLD = 12;
const RULE_DETECTION_THRESHOLD = 8;

function findRuledLines(alpha: Buffer, width: number, height: number) {
  const horizontal = new Uint8Array(height);
  const vertical = new Uint8Array(width);
  const minimumHorizontalRun = Math.max(48, Math.floor(width * 0.62));
  const minimumVerticalRun = Math.max(48, Math.floor(height * 0.62));

  for (let y = 0; y < height; y += 1) {
    let longestRun = 0;
    let currentRun = 0;
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] > RULE_DETECTION_THRESHOLD) {
        currentRun += 1;
        longestRun = Math.max(longestRun, currentRun);
      } else {
        currentRun = 0;
      }
    }
    if (longestRun >= minimumHorizontalRun) horizontal[y] = 1;
  }

  for (let x = 0; x < width; x += 1) {
    let longestRun = 0;
    let currentRun = 0;
    for (let y = 0; y < height; y += 1) {
      if (alpha[y * width + x] > RULE_DETECTION_THRESHOLD) {
        currentRun += 1;
        longestRun = Math.max(longestRun, currentRun);
      } else {
        currentRun = 0;
      }
    }
    if (longestRun >= minimumVerticalRun) vertical[x] = 1;
  }

  return { horizontal, vertical };
}

function hasPerpendicularInk(
  alpha: Buffer,
  width: number,
  height: number,
  x: number,
  y: number,
  horizontalRule: boolean,
) {
  if (horizontalRule) {
    return (y >= 3 && alpha[(y - 3) * width + x] > INK_DETECTION_THRESHOLD) ||
      (y + 3 < height && alpha[(y + 3) * width + x] > INK_DETECTION_THRESHOLD);
  }

  return (x >= 3 && alpha[y * width + x - 3] > INK_DETECTION_THRESHOLD) ||
    (x + 3 < width && alpha[y * width + x + 3] > INK_DETECTION_THRESHOLD);
}

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
  const alpha = Buffer.alloc(info.width * info.height);
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const source = (y * info.width + x) * info.channels;
      const red = data[source];
      const green = data[source + 1];
      const blue = data[source + 2];
      const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
      const inkStrength = Math.max(0, Math.min(255, Math.round((238 - luminance - 16) * 4)));
      alpha[y * info.width + x] = Math.round(inkStrength * data[source + 3] / 255);
    }
  }

  const ruledLines = findRuledLines(alpha, info.width, info.height);
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
      const pixel = y * info.width + x;
      const crossesHorizontalRule = ruledLines.horizontal[y] === 1 &&
        hasPerpendicularInk(alpha, info.width, info.height, x, y, true);
      const crossesVerticalRule = ruledLines.vertical[x] === 1 &&
        hasPerpendicularInk(alpha, info.width, info.height, x, y, false);
      const isRuledPaper = (ruledLines.horizontal[y] === 1 || ruledLines.vertical[x] === 1) &&
        !crossesHorizontalRule && !crossesVerticalRule;

      rgba[target] = red;
      rgba[target + 1] = green;
      rgba[target + 2] = blue;
      rgba[target + 3] = isRuledPaper ? 0 : alpha[pixel];

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

export async function normalizeOfficialMark(input: Buffer): Promise<Buffer> {
  return sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .png()
    .toBuffer();
}
