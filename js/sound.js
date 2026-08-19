/* PLACEHOLDER SOUND FEEDBACK.
 *
 * No custom audio assets ship with this project, so tile pick / match / mismatch / win
 * feedback is synthesized with the Web Audio API (short oscillator beeps) rather than
 * <audio> files -- the same placeholder approach used by the DroidMahjong (ToneGenerator)
 * and iMahjong (AudioServicesPlaySystemSound) ports. Swap `beep()`'s oscillator for
 * `AudioContext.decodeAudioData`-loaded clips later without touching the call sites below.
 */
const Sound = (() => {
  let ctx = null;
  let enabled = true;

  function context() {
    if (!enabled) return null;
    if (!ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function beep(freq, durationMs, type = 'sine', gain = 0.08) {
    const c = context();
    if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g).connect(c.destination);
    const now = c.currentTime;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.start(now);
    osc.stop(now + durationMs / 1000);
  }

  return {
    setEnabled(value) { enabled = value; },
    tilePick() { beep(880, 70); },
    match() { beep(1320, 110, 'triangle'); },
    mismatch() { beep(160, 140, 'square', 0.05); },
    win() {
      [523, 659, 784, 1047].forEach((freq, i) => {
        setTimeout(() => beep(freq, 180, 'triangle'), i * 90);
      });
    },
  };
})();
