/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Decodes a Base64 string into a Uint8Array.
 */
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decodes raw PCM Int16 audio data into an AudioBuffer.
 *
 * @param data - Uint8Array containing interleaved PCM Int16 samples.
 * @param ctx - The AudioContext to create the buffer in.
 * @param sampleRate - Sample rate of the audio (e.g., 44100).
 * @param numChannels - Number of channels (1=mono, 2=stereo).
 * @returns Promise resolving to an AudioBuffer.
 */
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  if (numChannels <= 0) {
    throw new Error('Number of channels must be greater than 0.');
  }

  const frameSizeBytes = numChannels * 2;
  const totalFrames = Math.floor(data.length / frameSizeBytes);

  if (data.length % frameSizeBytes !== 0) {
    console.warn('Warning: Data length is not aligned to complete frames. Trailing bytes will be ignored.');
  }

  const buffer = ctx.createBuffer(numChannels, totalFrames, sampleRate);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let frame = 0; frame < totalFrames; frame++) {
      const sampleIndex = (frame * numChannels + channel) * 2;
      if (sampleIndex + 2 > data.byteLength) {
        // Safety check
        channelData[frame] = 0;
        continue;
      }
      const int16 = view.getInt16(sampleIndex, true);
      // Normalized [-1, +1). Use 32768 divisor for symmetry
      const sample = int16 / 32768;
      // Clamping for safety
      channelData[frame] = Math.max(-1, Math.min(1, sample));
    }

    // Optional: fade out last 128 samples to prevent click
    const fadeSamples = Math.min(128, totalFrames);
    for (let i = 0; i < fadeSamples; i++) {
      const fadeFactor = (fadeSamples - i) / fadeSamples;
      channelData[totalFrames - fadeSamples + i] *= fadeFactor;
    }
  }

  return buffer;
}

export { decode, decodeAudioData };
