export class PCMPlayer {
  private audioCtx: AudioContext | null = null;
  private nextStartTime: number = 0;
  private sampleRate: number = 24000;

  private isPlaying: boolean = false;

  constructor() {
    this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  isSuspended() {
    return this.audioCtx?.state === 'suspended';
  }

  async resume(): Promise<boolean> {
    if (!this.audioCtx) return false;
    try {
      await this.audioCtx.resume();
      return this.audioCtx.state === 'running';
    } catch (e) {
      console.error('Manual resume failed:', e);
      return false;
    }
  }

  async playStream(response: Response, onEnd?: () => void) {
    if (!this.audioCtx) return;
    this.isPlaying = true;
    if (this.audioCtx.state === 'suspended') {
      const resumePromise = this.audioCtx.resume();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('AudioContext resume timed out')), 2000)
      );
      try {
        await Promise.race([resumePromise, timeoutPromise]);
      } catch (e) {
        console.warn('AudioContext resume failed or timed out:', e);
        // We continue anyway, but it might not play sound
      }
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    this.nextStartTime = this.audioCtx.currentTime + 0.1;

    let buffer: Uint8Array = new Uint8Array(0);

    try {
      try {
        while (this.isPlaying) {
          const { done, value } = await reader.read();
          if (done || !this.isPlaying) break;

          // Combine with previous leftover buffer
          const newBuffer = new Uint8Array(buffer.length + value.length);
          newBuffer.set(buffer);
          newBuffer.set(value, buffer.length);
          buffer = newBuffer;

          // PCM 16-bit Mono is 2 bytes per sample
          while (buffer.length >= 4096 && this.isPlaying) {
            const chunk = buffer.slice(0, 4096);
            buffer = buffer.slice(4096);
            this.playChunk(chunk);
          }
        }
      } finally {
        reader.releaseLock();
      }

      if (!this.isPlaying) return;

      // Play remaining
      if (buffer.length > 0) {
        this.playChunk(buffer);
      }

      // Rough estimate of when it ends
      const duration = (this.nextStartTime - this.audioCtx.currentTime);
      if (onEnd && this.isPlaying) {
        setTimeout(() => {
          if (this.isPlaying) {
            this.isPlaying = false;
            onEnd();
          }
        }, Math.max(0, duration * 1000));
      }
    } catch (e) {
      console.error('Error in playStream:', e);
      this.isPlaying = false;
      if (onEnd) onEnd();
    }
  }

  private playChunk(data: Uint8Array) {
    if (!this.audioCtx || !this.isPlaying) return;

    // Convert 16-bit PCM to Float32
    const int16Array = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768;
    }

    const audioBuffer = this.audioCtx.createBuffer(1, float32Array.length, this.sampleRate);
    audioBuffer.getChannelData(0).set(float32Array);

    const source = this.audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioCtx.destination);

    const startTime = Math.max(this.nextStartTime, this.audioCtx.currentTime);
    source.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;
  }

  stop() {
    this.isPlaying = false;
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }
}
