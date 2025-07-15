/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  if (numChannels <= 0) {
    throw new Error('Number of channels must be greater than 0.');
  }

  const numFrames = data.length / 2 / numChannels;
  const buffer = ctx.createBuffer(numChannels, numFrames, sampleRate);

  const dataInt16 = new Int16Array(data.buffer);

  // De-interleave and copy to the audio buffer channels without creating
  // intermediate arrays. This is much more efficient.
  for (let i = 0; i < numChannels; i++) {
    const channelData = buffer.getChannelData(i);
    for (let j = 0; j < numFrames; j++) {
      // Normalize Int16 to Float32 range [-1.0, 1.0]
      channelData[j] = dataInt16[j * numChannels + i] / 32768.0;
    }
  }

  return buffer;
}

export { decode, decodeAudioData };