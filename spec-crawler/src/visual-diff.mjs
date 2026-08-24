import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const DEFAULT_PIXEL_THRESHOLD = 12;

const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));
const round = (value, places = 4) => Number(Number(value).toFixed(places));

function bytesOf(value, name = 'image') {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === 'string') {
    const match = value.match(/^data:image\/png;base64,(.+)$/s);
    return Buffer.from(match ? match[1] : value, 'base64');
  }
  throw new TypeError(`${name} must be PNG bytes, a Uint8Array, or a PNG data URL`);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type, 'ascii');
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return result;
}

/** Encode 8-bit RGBA pixels as a deterministic, non-interlaced PNG. */
export function encodePng({ width, height, data }) {
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new TypeError('PNG dimensions must be positive integers');
  }
  const rgba = bytesOf(data, 'RGBA data');
  if (rgba.length !== width * height * 4) throw new RangeError(`RGBA data has ${rgba.length} bytes; expected ${width * height * 4}`);

  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const destination = y * (1 + width * 4);
    scanlines[destination] = 0;
    rgba.copy(scanlines, destination + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines, { level: 9 })), chunk('IEND')]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function unpackSample(row, bitDepth, sampleIndex) {
  const bit = sampleIndex * bitDepth;
  const shift = 8 - bitDepth - (bit % 8);
  const mask = (1 << bitDepth) - 1;
  return (row[Math.floor(bit / 8)] >>> shift) & mask;
}

/** Decode a non-interlaced PNG into canonical 8-bit RGBA pixels. */
export function decodePng(value) {
  const bytes = bytesOf(value);
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new TypeError('Invalid PNG signature');

  let offset = 8;
  let header;
  let palette;
  let transparency;
  const idat = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length) throw new TypeError(`Truncated PNG ${type} chunk`);
    const payload = bytes.subarray(start, end);
    if (type === 'IHDR') header = Buffer.from(payload);
    else if (type === 'PLTE') palette = Buffer.from(payload);
    else if (type === 'tRNS') transparency = Buffer.from(payload);
    else if (type === 'IDAT') idat.push(payload);
    else if (type === 'IEND') break;
    offset = end + 4;
  }
  if (!header || header.length !== 13) throw new TypeError('PNG is missing a valid IHDR chunk');
  if (idat.length === 0) throw new TypeError('PNG is missing image data');

  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const bitDepth = header[8];
  const colorType = header[9];
  const compression = header[10];
  const filterMethod = header[11];
  const interlace = header[12];
  if (!width || !height) throw new TypeError('PNG dimensions must be positive');
  if (compression !== 0 || filterMethod !== 0) throw new TypeError('Unsupported PNG compression or filter method');
  if (interlace !== 0) throw new TypeError('Interlaced PNGs are not supported');

  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 })[colorType];
  const validDepths = colorType === 3 ? [1, 2, 4, 8] : colorType === 0 ? [1, 2, 4, 8, 16] : [8, 16];
  if (!channels || !validDepths.includes(bitDepth)) throw new TypeError(`Unsupported PNG color type ${colorType} / bit depth ${bitDepth}`);
  if (colorType === 3 && (!palette || palette.length % 3 !== 0)) throw new TypeError('Indexed PNG is missing a valid palette');

  const bitsPerPixel = channels * bitDepth;
  const rowBytes = Math.ceil(width * bitsPerPixel / 8);
  const filterBpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const inflated = inflateSync(Buffer.concat(idat));
  if (inflated.length !== height * (rowBytes + 1)) {
    throw new TypeError(`PNG scanline length mismatch: got ${inflated.length}, expected ${height * (rowBytes + 1)}`);
  }

  const rows = [];
  let previous = Buffer.alloc(rowBytes);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = y * (rowBytes + 1);
    const filter = inflated[sourceOffset];
    const source = inflated.subarray(sourceOffset + 1, sourceOffset + 1 + rowBytes);
    const row = Buffer.alloc(rowBytes);
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = source[x];
      const left = x >= filterBpp ? row[x - filterBpp] : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= filterBpp ? previous[x - filterBpp] : 0;
      if (filter === 0) row[x] = raw;
      else if (filter === 1) row[x] = (raw + left) & 0xff;
      else if (filter === 2) row[x] = (raw + up) & 0xff;
      else if (filter === 3) row[x] = (raw + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) row[x] = (raw + paeth(left, up, upLeft)) & 0xff;
      else throw new TypeError(`Unsupported PNG filter ${filter}`);
    }
    rows.push(row);
    previous = row;
  }

  const rgba = Buffer.alloc(width * height * 4);
  const maxSample = (1 << Math.min(bitDepth, 8)) - 1;
  const sample = (row, index) => {
    if (bitDepth < 8) return Math.round((unpackSample(row, bitDepth, index) / maxSample) * 255);
    const byte = index * (bitDepth / 8);
    return row[byte]; // For 16-bit input, the high byte is the 8-bit representation.
  };

  const transparentGrey = colorType === 0 && transparency?.length >= 2 ? transparency.readUInt16BE(0) : null;
  const transparentRgb = colorType === 2 && transparency?.length >= 6
    ? [transparency.readUInt16BE(0), transparency.readUInt16BE(2), transparency.readUInt16BE(4)]
    : null;

  for (let y = 0; y < height; y += 1) {
    const row = rows[y];
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (colorType === 6) {
        const base = x * 4;
        rgba[destination] = sample(row, base);
        rgba[destination + 1] = sample(row, base + 1);
        rgba[destination + 2] = sample(row, base + 2);
        rgba[destination + 3] = sample(row, base + 3);
      } else if (colorType === 4) {
        const base = x * 2;
        const grey = sample(row, base);
        rgba[destination] = rgba[destination + 1] = rgba[destination + 2] = grey;
        rgba[destination + 3] = sample(row, base + 1);
      } else if (colorType === 2) {
        const base = x * 3;
        const values = [sample(row, base), sample(row, base + 1), sample(row, base + 2)];
        rgba[destination] = values[0];
        rgba[destination + 1] = values[1];
        rgba[destination + 2] = values[2];
        const sourceValues = bitDepth === 16
          ? [row.readUInt16BE(base * 2), row.readUInt16BE((base + 1) * 2), row.readUInt16BE((base + 2) * 2)]
          : values;
        rgba[destination + 3] = transparentRgb?.every((entry, index) => entry === sourceValues[index]) ? 0 : 255;
      } else if (colorType === 0) {
        const grey = sample(row, x);
        rgba[destination] = rgba[destination + 1] = rgba[destination + 2] = grey;
        const sourceGrey = bitDepth === 16 ? row.readUInt16BE(x * 2) : bitDepth < 8 ? unpackSample(row, bitDepth, x) : grey;
        rgba[destination + 3] = sourceGrey === transparentGrey ? 0 : 255;
      } else {
        const index = bitDepth < 8 ? unpackSample(row, bitDepth, x) : row[x];
        const paletteOffset = index * 3;
        if (paletteOffset + 2 >= palette.length) throw new TypeError(`PNG palette index ${index} is out of range`);
        rgba[destination] = palette[paletteOffset];
        rgba[destination + 1] = palette[paletteOffset + 1];
        rgba[destination + 2] = palette[paletteOffset + 2];
        rgba[destination + 3] = transparency?.[index] ?? 255;
      }
    }
  }
  return { width, height, data: rgba };
}

function normalizeRect(rect, fallbackName) {
  if (!rect || typeof rect !== 'object') throw new TypeError(`${fallbackName} must be a rectangle`);
  const x = Number(rect.x ?? rect.left ?? 0);
  const y = Number(rect.y ?? rect.top ?? 0);
  const width = Number(rect.width ?? rect.w);
  const height = Number(rect.height ?? rect.h);
  if (![x, y, width, height].every(Number.isFinite) || width < 0 || height < 0) throw new TypeError(`${fallbackName} has invalid coordinates`);
  return { x, y, width, height, name: String(rect.name ?? fallbackName) };
}

function maskPredicate(masks, width, height) {
  if (!masks || (Array.isArray(masks) && masks.length === 0)) return () => false;
  const list = Array.isArray(masks) ? masks : [masks];
  const rectangles = [];
  const rasters = [];
  for (const [index, mask] of list.entries()) {
    if (typeof mask === 'function') {
      rasters.push(mask);
    } else if (Buffer.isBuffer(mask) || mask instanceof Uint8Array) {
      const bytes = bytesOf(mask, `mask ${index}`);
      if (bytes.length !== width * height && bytes.length !== width * height * 4) throw new RangeError(`mask ${index} has invalid byte length`);
      rasters.push((x, y) => bytes[(y * width + x) * (bytes.length === width * height * 4 ? 4 : 1)] > 0);
    } else {
      rectangles.push(normalizeRect(mask, `mask-${index + 1}`));
    }
  }
  return (x, y) => rectangles.some((rect) => x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height)
    || rasters.some((predicate) => predicate(x, y));
}

function premultipliedPixel(image, x, y) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return null;
  const offset = (y * image.width + x) * 4;
  const alpha = image.data[offset + 3] / 255;
  return [
    image.data[offset] * alpha,
    image.data[offset + 1] * alpha,
    image.data[offset + 2] * alpha,
    image.data[offset + 3],
  ];
}

function relativeLuminance(pixel) {
  if (!pixel) return 0;
  const convert = (channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * convert(pixel[0]) + 0.7152 * convert(pixel[1]) + 0.0722 * convert(pixel[2]);
}

function edgeMagnitude(image, x, y) {
  const luminance = (px, py) => relativeLuminance(premultipliedPixel(image, px, py));
  const left = luminance(Math.max(0, x - 1), y);
  const right = luminance(Math.min(image.width - 1, x + 1), y);
  const top = luminance(x, Math.max(0, y - 1));
  const bottom = luminance(x, Math.min(image.height - 1, y + 1));
  return Math.hypot(right - left, bottom - top) / Math.SQRT2;
}

function percent(numerator, denominator) {
  return denominator ? round((numerator / denominator) * 100, 4) : 0;
}

function defaultRegions(width, height) {
  const leftWidth = Math.ceil(width / 2);
  const topHeight = Math.ceil(height / 2);
  return [
    { name: 'top-left', x: 0, y: 0, width: leftWidth, height: topHeight },
    { name: 'top-right', x: leftWidth, y: 0, width: width - leftWidth, height: topHeight },
    { name: 'bottom-left', x: 0, y: topHeight, width: leftWidth, height: height - topHeight },
    { name: 'bottom-right', x: leftWidth, y: topHeight, width: width - leftWidth, height: height - topHeight },
  ].filter((region) => region.width > 0 && region.height > 0);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

/**
 * Compare decoded RGBA images without resizing either side.
 * Transparent RGB is compared in premultiplied form, so invisible RGB payloads
 * do not create false changes while alpha changes remain visible.
 */
export function compareRgba(reference, candidate, options = {}) {
  const pixelThreshold = Number(options.pixelThreshold ?? DEFAULT_PIXEL_THRESHOLD);
  const changedThreshold = Number(options.threshold ?? options.changedThreshold ?? 2);
  if (!Number.isFinite(pixelThreshold) || pixelThreshold < 0 || pixelThreshold > 255) throw new RangeError('pixelThreshold must be between 0 and 255');
  if (!Number.isFinite(changedThreshold) || changedThreshold < 0 || changedThreshold > 100) throw new RangeError('threshold must be between 0 and 100');

  const width = Math.max(reference.width, candidate.width);
  const height = Math.max(reference.height, candidate.height);
  const isMasked = maskPredicate(options.masks, width, height);
  const regionDefinitions = options.regions === undefined ? defaultRegions(width, height) : options.regions;
  const regions = (regionDefinitions ?? []).map((region, index) => normalizeRect(region, `region-${index + 1}`));
  const regionCounters = regions.map((region) => ({ ...region, total: 0, changed: 0, rgbaDelta: 0, luminanceDelta: 0, edgeDelta: 0 }));
  const bands = [0, 1, 2].map((index) => ({ name: ['top', 'middle', 'bottom'][index], total: 0, changed: 0, rgbaDelta: 0 }));
  const output = Buffer.alloc(width * height * 4);
  let comparedPixels = 0;
  let maskedPixels = 0;
  let changedPixels = 0;
  let rgbaDelta = 0;
  let luminanceDelta = 0;
  let edgeDelta = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const outputOffset = (y * width + x) * 4;
      const masked = isMasked(x, y);
      const referencePixel = premultipliedPixel(reference, x, y);
      const candidatePixel = premultipliedPixel(candidate, x, y);
      if (masked) {
        maskedPixels += 1;
        output[outputOffset] = output[outputOffset + 1] = output[outputOffset + 2] = 35;
        output[outputOffset + 3] = 180;
        continue;
      }

      comparedPixels += 1;
      const missing = referencePixel === null || candidatePixel === null;
      const deltas = missing ? [255, 255, 255, 255] : referencePixel.map((entry, index) => Math.abs(entry - candidatePixel[index]));
      const pixelDelta = deltas.reduce((sum, value) => sum + value, 0) / 4;
      const colorDelta = (deltas[0] + deltas[1] + deltas[2]) / 3;
      const changed = missing || colorDelta > pixelThreshold || deltas[3] > pixelThreshold;
      const lumDelta = missing ? 1 : Math.abs(relativeLuminance(referencePixel) - relativeLuminance(candidatePixel));
      const thisEdgeDelta = missing ? 1 : Math.abs(edgeMagnitude(reference, x, y) - edgeMagnitude(candidate, x, y));
      rgbaDelta += pixelDelta / 255;
      luminanceDelta += lumDelta;
      edgeDelta += thisEdgeDelta;
      if (changed) changedPixels += 1;

      const band = bands[Math.min(2, Math.floor((y / Math.max(1, height)) * 3))];
      band.total += 1;
      band.rgbaDelta += pixelDelta / 255;
      if (changed) band.changed += 1;
      for (const region of regionCounters) {
        if (x < region.x || y < region.y || x >= region.x + region.width || y >= region.y + region.height) continue;
        region.total += 1;
        region.rgbaDelta += pixelDelta / 255;
        region.luminanceDelta += lumDelta;
        region.edgeDelta += thisEdgeDelta;
        if (changed) region.changed += 1;
      }

      if (changed) {
        output[outputOffset] = missing ? 255 : 255;
        output[outputOffset + 1] = missing ? 184 : 0;
        output[outputOffset + 2] = missing ? 0 : 96;
        output[outputOffset + 3] = 255;
      } else {
        const source = referencePixel ?? candidatePixel ?? [0, 0, 0, 0];
        const grey = source[0] * 0.3 + source[1] * 0.5 + source[2] * 0.2;
        output[outputOffset] = output[outputOffset + 1] = output[outputOffset + 2] = clampByte(grey * 0.35);
        output[outputOffset + 3] = 255;
      }
    }
  }

  const referenceSize = { width: reference.width, height: reference.height, w: reference.width, h: reference.height };
  const candidateSize = { width: candidate.width, height: candidate.height, w: candidate.width, h: candidate.height };
  const sizeMatch = reference.width === candidate.width && reference.height === candidate.height;
  const rgbaChangedPct = percent(changedPixels, comparedPixels);
  const changedPct = round(rgbaChangedPct, 2); // legacy CLI precision
  const bandStats = bands.map((band) => ({
    name: band.name,
    comparedPixels: band.total,
    changedPixels: band.changed,
    changedPct: percent(band.changed, band.total),
    rgbaMeanDeltaPct: percent(band.rgbaDelta, band.total),
  }));
  const regionStats = regionCounters.map((region) => ({
    name: region.name,
    rect: { x: region.x, y: region.y, width: region.width, height: region.height },
    comparedPixels: region.total,
    changedPixels: region.changed,
    changedPct: percent(region.changed, region.total),
    rgbaMeanDeltaPct: percent(region.rgbaDelta, region.total),
    luminanceMeanDeltaPct: percent(region.luminanceDelta, region.total),
    edgeMeanDeltaPct: percent(region.edgeDelta, region.total),
  }));
  const summary = {
    referenceSize,
    candidateSize,
    sizes: { reference: referenceSize, candidate: candidateSize },
    comparisonSize: { width, height },
    sizeMatch,
    threshold: changedThreshold,
    pixelThreshold,
    comparedPixels,
    maskedPixels,
    changedPixels,
    changedPct,
    rgbaChangedPct,
    rgbaMeanDeltaPct: percent(rgbaDelta, comparedPixels),
    perceptual: {
      luminanceMeanDeltaPct: percent(luminanceDelta, comparedPixels),
      edgeMeanDeltaPct: percent(edgeDelta, comparedPixels),
    },
    bands: bandStats.map((band) => round(band.changedPct, 2)),
    bandStats,
    regions: regionStats,
  };
  summary.metrics = {
    rgbaChangedPct: summary.rgbaChangedPct,
    rgbaMeanDeltaPct: summary.rgbaMeanDeltaPct,
    luminanceMeanDeltaPct: summary.perceptual.luminanceMeanDeltaPct,
    edgeMeanDeltaPct: summary.perceptual.edgeMeanDeltaPct,
  };
  const diffPng = encodePng({ width, height, data: output });
  const reportHash = createHash('sha256').update(stableJson({ ...summary, diffSha256: createHash('sha256').update(diffPng).digest('hex') })).digest('hex');
  const pass = sizeMatch && rgbaChangedPct <= changedThreshold;
  return { ...summary, pass, reportHash, diffPng };
}

/** Decode and compare two PNGs. Neither image is ever rescaled. */
export function comparePngs(referencePng, candidatePng, options = {}) {
  return compareRgba(decodePng(referencePng), decodePng(candidatePng), options);
}

export const comparePng = comparePngs;
export const comparePngBuffers = comparePngs;
export const compareImages = comparePngs;
export const diffPngs = comparePngs;
export const readPng = decodePng;
export const writePng = encodePng;
