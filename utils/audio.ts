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
  if (data.length % (2 * numChannels) !== 0) {
    console.warn('Warning: Data length is not aligned to complete frames. Some samples may be ignored.');
  }

  const numFrames = Math.floor(data.length / 2 / numChannels);
  const buffer = ctx.createBuffer(numChannels, numFrames, sampleRate);

  // Use DataView for correct endianness handling
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // De-interleave and normalize samples
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let frame = 0; frame < numFrames; frame++) {
      const sampleIndex = (frame * numChannels + channel) * 2;
      const int16 = view.getInt16(sampleIndex, true); // Little-endian
      // Clamp to [-1.0, 1.0]
      channelData[frame] = Math.max(-1, Math.min(1, int16 / 32768));
    }
  }

  return buffer;
}

export { decode, decodeAudioData };
