/**
 * Every tunable of MUSIC, in one place.
 *
 * The transcription thresholds are the ones most likely to need adjusting: they
 * depend on the room, the microphone and whether people are singing or playing.
 * No value chosen here can be right for every setup, which is why they are knobs
 * rather than literals buried in the pipeline.
 *
 * Everything time-related is specified in **milliseconds** and converted against the
 * actual sample rate at use. A 44.1 kHz laptop and a 48 kHz interface must transcribe
 * the same melody the same way.
 */

export const config = {
  capture: {
    /**
     * Analysis window, in samples. The McLeod Pitch Method needs roughly two periods
     * of the fundamental, so 2048 reaches down to about 47 Hz at 48 kHz — below the
     * bottom of any instrument likely to be pointed at this game.
     *
     * It also sets the real time resolution of a *pitch change*: ~43 ms at 48 kHz.
     * `minNoteMs` below must stay above that or it is claiming a precision the
     * window cannot deliver.
     */
    frameSamples: 2048,
    /** Distance between successive analysis windows. */
    hopMs: 10,
    /**
     * Clarity floor for a frame to count as voiced.
     *
     * Deliberately below `DEFAULT_PITCH_OPTIONS.minClarity` (0.9). That default is
     * tuned for a live loop where a dropped frame costs nothing and the next one
     * arrives in 16 ms. Here a dropped frame shortens a plateau, and a plateau that
     * falls under `minNoteMs` is not a worse note — it is a *deleted* note.
     */
    minClarity: 0.8,
    /** Below a bass's low B and above the top of a piccolo. */
    minFrequency: 55,
    maxFrequency: 2200,
    /** Frames quieter than this are room tone whatever their clarity says. */
    minVolumeDecibels: -55,
  },

  record: {
    /** Coalesced sample blocks the worklet posts at a time. 2048 ≈ 43 ms at 48 kHz. */
    chunkSamples: 2048,
    /** RMS a block must reach to count as someone starting to play. */
    onsetRms: 0.02,
    /**
     * Consecutive blocks that must stay above the threshold before the clock starts.
     * A block is ~2.7 ms, so 6 is ~16 ms — long enough that a chair scrape or a
     * desk knock does not start a take, short enough to feel instant.
     */
    onsetHoldBlocks: 6,
    /**
     * Onsets are ignored for this long after arming. The click that grants
     * microphone permission makes a noise of its own, and a trackpad is louder
     * than a flute played softly.
     */
    graceMs: 250,
    /**
     * Audio kept from *before* the onset. The detector necessarily fires a block or
     * two into the attack, and cutting exactly at the onset clips the transient off
     * the first note.
     */
    preRollMs: 120,
    /** The setter's hard wall-clock cap, from the onset. */
    setterSeconds: 10,
    /**
     * The copier's window. Deliberately a multiple of the setter's: rhythm is
     * discarded, so nobody should fail because their instrument cannot physically
     * match the setter's note density in the same wall-clock time.
     */
    copierSeconds: 30,
    /** The last stretch of the window gets a visible countdown. */
    countdownSeconds: 5,
    /**
     * Armed with no onset for this long and the take is abandoned, releasing the
     * microphone. Otherwise the browser's recording indicator stays lit while
     * somebody answers the door.
     */
    armTimeoutSeconds: 25,
  },

  transcribe: {
    /**
     * Median filter width, in milliseconds of voiced contour.
     *
     * Near one vibrato period, as the design doc asks. A *median* is what makes that
     * safe: unlike a mean it preserves the step between two notes, so a long kernel
     * centres a vibrato'd note without rounding off the edges of the short ones. It
     * only erases a feature shorter than half the kernel, which is why this sits at
     * 130 ms rather than the doc's 150–200 — 65 ms is comfortably under `minNoteMs`.
     *
     * The stage that actually needs it is `findSegments`: the band it extends a run
     * within is anchored on the run's opening frames, and on a raw contour those can
     * land anywhere in the vibrato swing and push the band off to one side.
     */
    medianMs: 130,
    /**
     * How far the contour may stray from a run's anchor and still be the same note.
     *
     * Above the vibrato it has to tolerate — sung vibrato routinely reaches ±50
     * cents, strings ±30 — and below a semitone, so it can never merge two
     * neighbouring notes. This is why it is not the ±0.5 that "same rounded pitch"
     * would suggest.
     */
    toleranceSemitones: 0.7,
    /** Opening frames a run's anchor is taken from, as a median. */
    anchorPoints: 5,
    /**
     * Consecutive out-of-band points needed to end a run. One stray frame is a
     * consonant, a bow change or a bad reading — not a note boundary.
     */
    breakPoints: 3,
    /** Shortest run that counts as a note. */
    minNoteMs: 80,
    /** A segment shorter than this may be discarded as a passing tone. */
    maxGlideMs: 130,
    /**
     * …but only if its neighbours are further apart than this.
     *
     * A whole tone leaves room for exactly one chromatic passing tone, and a fast
     * chromatic run is real music that nobody should lose notes from. Three
     * semitones is the point where something genuinely had to happen in between.
     */
    minGlideSpanSemitones: 3,
    /**
     * Fewer notes than this and a transposition search will match almost anything,
     * so a set this short is rejected rather than scored.
     */
    minNotes: 4,
  },

  score: {
    /** Cost per semitone of a substitution. */
    subSlope: 0.25,
    /**
     * Ceiling on a substitution's cost. Must stay strictly below `2 * indel`, or the
     * aligner decomposes any large substitution into a cheaper deletion plus
     * insertion — interval weighting stops mattering, and the graph shatters a
     * single wrong note into a gap in one line and a spike in the other.
     */
    subCeiling: 1.9,
    indel: 1,
    /** Transposition search range, in semitones either way. */
    maxShift: 24,
  },

  /**
   * Error allowances. An attempt passes at or below its threshold.
   *
   * The setter's is far tighter than the copier's on purpose: the target inherits
   * whatever noise the setter's take contains, and every copy that round inherits
   * it in turn.
   */
  tolerance: {
    strict: { set: 0, copy: 0.1 },
    loose: { set: 0.05, copy: 0.2 },
  },

  graph: {
    width: 520,
    height: 180,
    padY: 18,
    /**
     * Semitones shown even when the phrase is flatter than that. Without a floor a
     * unison phrase divides by zero, and a two-semitone phrase would be stretched to
     * fill the panel and read as dramatic.
     */
    minSpanSemitones: 5,
  },

  playback: {
    /**
     * Ramp at each end of a replayed clip. Both edges are step discontinuities that
     * click otherwise. Long enough to remove that, short enough not to be heard.
     */
    fadeMs: 8,
  },

  drag: {
    /** Pointer movement before a mouse press becomes a drag. */
    thresholdPx: 4,
    /** A touch press must be held this long, so a swipe still scrolls the panel. */
    longPressMs: 220,
    /** Moving further than this before the long press fires means they meant to scroll. */
    longPressSlopPx: 10,
  },

  toast: {
    /** How long a notice stays up before it fades. */
    durationMs: 3600,
  },

  win: {
    /** Confetti burst, fired from the centre when the last player standing is found. */
    confetti: {
      pieceCount: 140,
      originX: 0.5,
      originY: 0.45,
      minSpeed: 340,
      maxSpeed: 760,
      spreadDeg: 360,
      gravity: 820,
      drag: 0.7,
      minLifetime: 1.4,
      maxLifetime: 2.6,
      minSize: 5,
      maxSize: 12,
      minSpin: 0.4,
      maxSpin: 2,
      /** The site's accent through violet, plus the success green. */
      colors: ["#818cf8", "#a5b4fc", "#c7d2fe", "#6366f1", "#4ade80", "#f2f3f7"],
    },
  },
} as const;

export type MusicConfig = typeof config;
