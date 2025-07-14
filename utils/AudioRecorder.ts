/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/**
 * A helper class to record audio from an AudioNode.
 */
export class AudioRecorder extends EventTarget {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  public readonly destinationNode: MediaStreamAudioDestinationNode;
  public isRecording = false;

  constructor(context: AudioContext) {
    super();
    this.destinationNode = context.createMediaStreamDestination();
  }

  public start() {
    if (this.isRecording) return;

    const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/webm',
        'audio/ogg',
        'audio/mp4',
    ];
    const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

    if (!supportedMimeType) {
        this.dispatchEvent(new CustomEvent('error', {
            detail: 'Recording is not supported in this browser.',
            bubbles: true,
            composed: true,
        }));
        return;
    }

    this.mediaRecorder = new MediaRecorder(this.destinationNode.stream, { mimeType: supportedMimeType });
    this.recordedChunks = [];

    this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
            this.recordedChunks.push(event.data);
        }
    };

    this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || supportedMimeType;
        const blob = new Blob(this.recordedChunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const fileExtension = mimeType.split(';')[0].split('/')[1];

        this.dispatchEvent(new CustomEvent('finished', {
            detail: { url, blob, fileName: `prompt-dj-mix-${Date.now()}.${fileExtension}` }
        }));
        
        this.isRecording = false;
        this.dispatchEvent(new CustomEvent('statechange', { detail: this.isRecording }));
        this.mediaRecorder = null;
    };

    this.mediaRecorder.start();
    this.isRecording = true;
    this.dispatchEvent(new CustomEvent('statechange', { detail: this.isRecording }));
  }

  public stop() {
    if (!this.isRecording || !this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        return;
    }
    this.mediaRecorder.stop();
  }
}
