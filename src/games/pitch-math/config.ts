/**
 * Every tunable of Pitch Math, in one place.
 *
 * The detector's thresholds are the ones most likely to need adjusting: they depend on
 * the room, the microphone and the instruments, and no value chosen here can be right
 * for every setup. They are knobs rather than literals for exactly that reason.
 */

export const config = {
  capture: {
    /**
     * Analyser window, in samples. Also the capture length and the FFT size.
     *
     * 32768 is the largest an AnalyserNode allows, which is what makes the
     * worklet-free capture in `useCapture` possible: after waiting this many samples
     * the analyser holds exactly the post-onset window. At 48 kHz that is 0.68 s and
     * a 1.46 Hz bin — finer than the ~8 Hz gap between the lowest semitones.
     */
    fftSize: 32768,
    /**
     * RMS level that counts as someone starting to play. Raise it in a noisy room,
     * lower it for quiet instruments.
     */
    onsetRmsThreshold: 0.2,
    /** How much of the analyser's tail the onset level is measured over. */
    onsetWindowSamples: 2048,
    /**
     * Ignore onsets for this long after listening starts, so the click that granted
     * microphone permission doesn't trigger one.
     */
    onsetGraceMs: 250,
    /** Pause on a failed pass before listening again, so the retry is perceptible. */
    retryDelayMs: 900,
    /** A capture quieter than this overall never had a note in it. */
    minCaptureRms: 0.005,
    /**
     * How many analyser windows are kept for the replay button.
     *
     * Only the first is analysed; the rest are collected afterwards purely so the clip
     * is long enough to judge by ear. Because the analyser always holds the most recent
     * `fftSize` samples, a read one window later is exactly contiguous with the last —
     * the windows join with no gap and no overlap.
     *
     * 2 gives ~1.4 s at 48 kHz. 1 disables the tail and replays only what was analysed.
     */
    playbackWindows: 2,
  },

  detector: {
    /** Lowest candidate note, C2 — below a cello's open C. */
    minMidi: 36,
    /** Highest candidate note, C7 — above the top of a flute's usual range. */
    maxMidi: 96,
    /** Harmonics summed per candidate. Beyond about eight there is little left. */
    harmonics: 8,
    /**
     * How far off its predicted bin a harmonic may sit and still count, in cents.
     *
     * This is what lets a player who is twenty cents flat still be recognised. Without
     * it the detector only works on perfectly tuned input, which no one produces.
     */
    harmonicToleranceCents: 35,
    /**
     * How strong the second note must be, relative to the first, to be believed.
     *
     * Too low and one note's leftover overtones read as a second note; too high and a
     * genuinely quieter second player is discarded as a unison.
     */
    secondNoteSalienceRatio: 0.3,
    /**
     * Ceiling on how much of a bin the first note's harmonic series may remove.
     *
     * The perfect 5th case depends on this: the lower note's 3rd harmonic sits exactly
     * on the upper note's 2nd, so unrestricted subtraction erases the evidence for the
     * upper note and a 5th collapses into a unison.
     */
    cancellationCeiling: 0.8,
    /**
     * How far above its own predicted harmonic decay the even harmonics must sit
     * before a lone fundamental is read as an octave. See `octaveEvidence`.
     *
     * Measured across timbres and noise levels on synthesized pairs: a single note
     * lands at 0.95–1.04 whatever its brightness, and an octave at 1.59–5.79. 1.25
     * sits in that gap, 20% clear of the loudest false positive.
     *
     * The case this still misses is an octave whose upper note is much quieter than
     * the lower *and* played on a bright instrument, which can fall back to ~0.99 and
     * read as a unison. Lowering this catches more of those at the cost of calling
     * lone notes octaves, which is the worse error — it invents a note nobody played.
     */
    octaveEvidenceThreshold: 1.25,
  },

  reveal: {
    /** How long a wrong button shakes. Kept inside the UX guideline's 150–300 ms. */
    shakeMs: 160,
    /** Confetti burst, fired at the correct button. */
    confetti: {
      pieceCount: 90,
      /** Fallback origin as a fraction of the viewport, used if no element is given. */
      originX: 0.5,
      originY: 0.5,
      minSpeed: 320,
      maxSpeed: 680,
      spreadDeg: 70,
      gravity: 820,
      drag: 0.7,
      minLifetime: 1.2,
      maxLifetime: 2.2,
      minSize: 5,
      maxSize: 11,
      minSpin: 0.4,
      maxSpin: 2,
      /** Indigo through violet, matching the site's accent rather than the dial's. */
      colors: ["#818cf8", "#a5b4fc", "#c7d2fe", "#6366f1", "#f2f3f7"],
    },
  },

  playback: {
    /**
     * Ramp at each end of the replayed clip, in milliseconds.
     *
     * The capture starts and ends mid-note, so both edges are step discontinuities that
     * click on playback. Long enough to remove that, short enough not to be heard as a
     * fade.
     */
    fadeMs: 8,
  },

  wave: {
    /** Dots in the listening animation. */
    dotCount: 28,
    /** Baseline height of a dot column, in pixels. */
    baseHeight: 6,
    /** Extra height at full input level. */
    levelHeight: 34,
    /** Seconds for one pass of the travelling wave. */
    cycleSeconds: 1.6,
    /**
     * How much of the previous level carries into the next frame. Smooths the meter so
     * it reads as breathing rather than flickering.
     */
    levelSmoothing: 0.75,
  },
} as const;

export type PitchMathConfig = typeof config;
