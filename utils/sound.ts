

// Simple synth for retro sounds
let audioCtx: AudioContext | null = null;

// Global references for continuous sounds
let ufoOsc: OscillatorNode | null = null;
let ufoGain: GainNode | null = null;
let ufoLfo: OscillatorNode | null = null;

const getCtx = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
};

export const startUfoSound = () => {
    try {
        const ctx = getCtx();
        if (ctx.state === 'suspended') ctx.resume();
        if (ufoOsc) return; // Already playing

        ufoOsc = ctx.createOscillator();
        ufoGain = ctx.createGain();
        ufoLfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();

        // High pitched sci-fi tone
        ufoOsc.type = 'sine';
        ufoOsc.frequency.value = 3000; 

        // LFO modulates frequency for the "wobble"
        ufoLfo.type = 'sine';
        ufoLfo.frequency.value = 8; 
        lfoGain.gain.value = 800; 

        ufoLfo.connect(lfoGain);
        lfoGain.connect(ufoOsc.frequency);

        ufoOsc.connect(ufoGain);
        ufoGain.connect(ctx.destination);
        
        // Low volume background
        ufoGain.gain.setValueAtTime(0.05, ctx.currentTime);

        ufoOsc.start();
        ufoLfo.start();
    } catch (e) {
        console.warn('UFO sound start failed', e);
    }
};

export const stopUfoSound = () => {
    if (ufoOsc) {
        try {
            const now = audioCtx?.currentTime || 0;
            // Quick fade out to avoid pop
            if (ufoGain) {
                ufoGain.gain.cancelScheduledValues(now);
                ufoGain.gain.setValueAtTime(ufoGain.gain.value, now);
                ufoGain.gain.linearRampToValueAtTime(0, now + 0.1);
            }
            const oldOsc = ufoOsc;
            const oldLfo = ufoLfo;
            setTimeout(() => {
                oldOsc.stop();
                oldOsc.disconnect();
                oldLfo?.stop();
                oldLfo?.disconnect();
            }, 100);
        } catch(e) {}
        ufoOsc = null;
        ufoGain = null;
        ufoLfo = null;
    }
};

export const playSound = (type: 'shoot' | 'enemy_shoot' | 'explosion' | 'start' | 'powerup' | 'shield_hit' | 'dive' | 'laser' | 'barrier_hit' | 'extend' | 'bonus' | 'cloak' | 'game_over' | 'warp') => {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    switch (type) {
      case 'shoot':
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.15);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        break;

      case 'enemy_shoot':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.2);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
        
      case 'laser':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.3);
        // Modulate for "beam" texture
        const lfo = ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = 50;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 500;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start(now);
        lfo.stop(now + 0.3);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;

      case 'explosion':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        
        // Add some noise texture (simulated via rapid freq modulation)
        osc.frequency.linearRampToValueAtTime(50, now + 0.1);
        
        osc.start(now);
        osc.stop(now + 0.3);
        break;
        
      case 'start':
        osc.type = 'square';
        // Simple arpeggio
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554, now + 0.1);
        osc.frequency.setValueAtTime(659, now + 0.2);
        osc.frequency.setValueAtTime(880, now + 0.4);
        
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.setValueAtTime(0.1, now + 0.5);
        gain.gain.linearRampToValueAtTime(0, now + 0.8);
        
        osc.start(now);
        osc.stop(now + 0.8);
        break;

      case 'powerup':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.linearRampToValueAtTime(1200, now + 0.1);
        osc.frequency.linearRampToValueAtTime(600, now + 0.2);
        osc.frequency.linearRampToValueAtTime(1200, now + 0.3);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;

      case 'shield_hit':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
        
      case 'barrier_hit':
        // Electric buzz/static
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.linearRampToValueAtTime(50, now + 0.15);
        
        // Rapid modulation for static - Increased intensity for more "electric" feel
        const staticLfo = ctx.createOscillator();
        staticLfo.type = 'square';
        staticLfo.frequency.value = 400; // Faster modulation
        const staticGain = ctx.createGain();
        staticGain.gain.value = 800; // Deeper modulation
        staticLfo.connect(staticGain);
        staticGain.connect(osc.frequency);
        staticLfo.start(now);
        staticLfo.stop(now + 0.15);

        // Louder (0.15 vs 0.1)
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        break;
        
      case 'dive':
        // Distinct "Whistling" drop sound for dive attacks
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 1.0);
        
        // Louder than background noise
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 1.0);
        
        osc.start(now);
        osc.stop(now + 1.0);
        break;
        
      case 'extend':
        // "1-UP" sound: Rapid arpeggio
        osc.type = 'square';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
        osc.frequency.setValueAtTime(1046.50, now + 0.3); // C6
        
        // Louder (0.15 vs 0.1)
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.setValueAtTime(0.15, now + 0.3);
        gain.gain.linearRampToValueAtTime(0, now + 0.6);
        
        osc.start(now);
        osc.stop(now + 0.6);
        
        // Add a second oscillator for "electric" feel (detuned saw)
        const osc2 = ctx.createOscillator();
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(523.25 * 2, now); // Octave up
        osc2.frequency.linearRampToValueAtTime(1046.50 * 2, now + 0.4);
        
        const gain2 = ctx.createGain();
        // Louder (0.08 vs 0.05)
        gain2.gain.value = 0.08;
        gain2.connect(ctx.destination);
        
        osc2.connect(gain2);
        osc2.start(now);
        osc2.stop(now + 0.6);
        break;
        
      case 'bonus':
        // High pitched bell ring
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1568, now); // G6
        
        // Bell envelope
        gain.gain.setValueAtTime(0.0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.02); // Fast attack
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8); // Long decay
        
        // Add a second slightly detuned oscillator for metallic effect
        const bellOsc2 = ctx.createOscillator();
        bellOsc2.type = 'triangle';
        bellOsc2.frequency.setValueAtTime(1575, now); // Slightly sharp
        const bellGain2 = ctx.createGain();
        bellGain2.gain.setValueAtTime(0.0, now);
        bellGain2.gain.linearRampToValueAtTime(0.1, now + 0.02);
        bellGain2.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        bellOsc2.connect(bellGain2);
        bellGain2.connect(ctx.destination);
        bellOsc2.start(now);
        bellOsc2.stop(now + 0.8);

        osc.start(now);
        osc.stop(now + 0.8);
        break;

      case 'cloak':
        // "Phase out" sound
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.5); // Pitch drop
        
        // Volume Envelope
        gain.gain.setValueAtTime(0.0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.1);
        gain.gain.linearRampToValueAtTime(0.0, now + 0.5);
        
        // Add heavy modulation for "sci-fi phase"
        const cloakLfo = ctx.createOscillator();
        cloakLfo.frequency.value = 25; // Fast vibrato
        const cloakLfoGain = ctx.createGain();
        cloakLfoGain.gain.value = 200;
        
        cloakLfo.connect(cloakLfoGain);
        cloakLfoGain.connect(osc.frequency);
        
        cloakLfo.start(now);
        cloakLfo.stop(now + 0.5);
        
        osc.start(now);
        osc.stop(now + 0.5);
        break;
        
      case 'game_over':
        // Pac-man style death: Descending pitch with modulation
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.linearRampToValueAtTime(50, now + 1.5);
        
        // LFO to create the "whip whip whip" texture
        const dieLfo = ctx.createOscillator();
        dieLfo.type = 'sine';
        dieLfo.frequency.setValueAtTime(12, now); // "whips" per second
        dieLfo.frequency.linearRampToValueAtTime(2, now + 1.5); // Slows down
        
        const dieLfoGain = ctx.createGain();
        dieLfoGain.gain.setValueAtTime(200, now); // Depth of modulation
        dieLfoGain.gain.linearRampToValueAtTime(0, now + 1.5);

        dieLfo.connect(dieLfoGain);
        dieLfoGain.connect(osc.frequency);
        
        dieLfo.start(now);
        dieLfo.stop(now + 1.5);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 1.5);
        
        osc.start(now);
        osc.stop(now + 1.5);
        break;

      case 'warp':
        // Power-up / Warp sound - Extended to match level transition (~3s)
        const warpDur = 2.8;

        // Rising sine/triangle wave
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + warpDur);
        
        // Add LFO for "flutter" engine sound
        const warpLfo = ctx.createOscillator();
        warpLfo.type = 'square';
        warpLfo.frequency.setValueAtTime(15, now);
        warpLfo.frequency.linearRampToValueAtTime(30, now + warpDur); // Speed up
        
        const warpLfoGain = ctx.createGain();
        warpLfoGain.gain.setValueAtTime(20, now);
        warpLfoGain.gain.linearRampToValueAtTime(50, now + warpDur);
        
        warpLfo.connect(warpLfoGain);
        warpLfoGain.connect(osc.frequency);
        warpLfo.start(now);
        warpLfo.stop(now + warpDur);

        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.2, now + (warpDur * 0.8));
        gain.gain.linearRampToValueAtTime(0, now + warpDur);

        osc.start(now);
        osc.stop(now + warpDur);
        break;
    }
  } catch (e) {
    console.warn("Audio play failed", e);
  }
};