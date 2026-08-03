import type { SoundName } from "./types";

export class SkyPupAudio {
  private context: AudioContext | null = null;
  private bgmTimer: number | null = null;
  enabled = true;

  unlock() {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === "suspended") void this.context.resume();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stopBgm();
  }

  startBgm() {
    if (!this.enabled || this.bgmTimer !== null) return;
    this.unlock();
    const notes = [523, 659, 784, 659, 587, 698, 880, 698];
    let index = 0;
    this.bgmTimer = window.setInterval(() => {
      this.tone(notes[index++ % notes.length], 0.09, "sine", 0.022);
    }, 270);
  }

  stopBgm() {
    if (this.bgmTimer !== null) window.clearInterval(this.bgmTimer);
    this.bgmTimer = null;
  }

  play(name: SoundName) {
    if (!this.enabled) return;
    const sounds: Record<SoundName, [number, number, OscillatorType, number]> = {
      shoot: [880, 0.035, "square", 0.018], hit: [180, 0.07, "sawtooth", 0.035],
      explode: [95, 0.14, "sawtooth", 0.055], heal: [740, 0.2, "sine", 0.05],
      boss: [110, 0.45, "square", 0.06], special: [1046, 0.55, "sine", 0.07],
      gameover: [130, 0.55, "triangle", 0.055], levelup: [988, 0.28, "sine", 0.055]
    };
    this.tone(...sounds[name]);
  }

  destroy() {
    this.stopBgm();
    void this.context?.close();
    this.context = null;
  }

  private tone(frequency: number, duration: number, type: OscillatorType, volume: number) {
    this.unlock();
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);
    oscillator.type = type;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration);
  }
}
