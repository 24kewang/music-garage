/**
 * Every tunable in the loop station, in one place.
 *
 * Components and audio modules embed no literals; tests derive their expectations
 * from here rather than hardcoding, so tuning a value doesn't break the suite.
 */
export const config = {
  transport: {
    /** Default tempo shown before the user touches anything. */
    defaultTempo: 92,
    /**
     * Tempo range, in BPM. One ceiling for both the typed field and the tempo a
     * free loop derives — a derived value the field would reject is refused at
     * the source instead, so the two can never disagree.
     */
    minTempo: 20,
    maxTempo: 500,
    /** Beats per bar — the time-signature numerator. */
    minBeats: 1,
    maxBeats: 16,
    defaultBeats: 4,
    /** Bars in the master loop. */
    minBars: 1,
    maxBars: 8,
    defaultBars: 4,
    /**
     * Hard ceiling on the master loop, seconds. Also sizes the capture ring buffer,
     * so raising it costs memory for every visitor, not just long-loop ones.
     */
    maxLoopSeconds: 60,
    /** Free-mode recordings shorter than this are treated as a slip, not a loop. */
    minFreeLoopSeconds: 0.5,
  },

  capture: {
    /**
     * Seconds kept before and after every recording's button-press marks. This is
     * the range of the delay sliders: ±1000 ms is exactly the padding.
     */
    padSeconds: 1,
    /** Extra ring-buffer slack beyond maxLoop + 2×pad, seconds. */
    ringSlackSeconds: 2,
    /** How often the worklet posts an input level, in 128-frame blocks. */
    levelEveryBlocks: 8,
  },

  delay: {
    /** The settings slider's range, milliseconds. Must stay within ±padSeconds. */
    minMs: -1000,
    maxMs: 1000,
    /** Slider step, milliseconds. */
    stepMs: 5,
    /**
     * Where the default delay used to live on its own. Still read as a fallback
     * so an existing calibration survives the move to `settings.storageKey`.
     */
    legacyStorageKey: "loop-station:delay-ms",
  },

  settings: {
    /**
     * The new-recording defaults — delay, volume, reverb. One key rather than
     * three, read once and coerced field by field so a partially corrupt entry
     * degrades instead of discarding the lot.
     */
    storageKey: "loop-station:settings",
  },

  drag: {
    /** Pointer travel before a mouse drag begins, px. Below this it's a click. */
    thresholdPx: 5,
    /**
     * Touch hold before a drag arms, ms. Until it fires the list scrolls
     * normally, which is what keeps swipe-to-scroll working on a phone.
     */
    longPressMs: 400,
    /** Movement that cancels an un-armed long press, px. */
    longPressSlopPx: 8,
    /** Distance from the list's edge that starts auto-scrolling, px. */
    edgePx: 48,
    /** Auto-scroll speed at the very edge, px per second. */
    autoScrollPxPerSecond: 900,
  },

  calibration: {
    /** Fixed metronome tempo during calibration. Ours to tune, not the player's. */
    tempo: 90,
    /** Beats collected before the estimate settles. */
    targetBeats: 16,
    /** Offsets further than this fraction of a beat from a click are mis-hits. */
    outlierBeatFraction: 0.5,
    /** Fraction trimmed from each end of the offsets before averaging. */
    trimFraction: 0.2,
    /** Minimum usable offsets before a result is offered at all. */
    minSamples: 6,
    /** Onset detector: RMS the block must exceed. */
    onsetThreshold: 0.05,
    /** Onset detector: how much louder than the recent floor a rise must be. */
    onsetRiseRatio: 3,
    /** Onset detector: refractory window after a hit, milliseconds. */
    refractoryMs: 250,
  },

  /**
   * Listening for the player's first note instead of punching in the instant
   * the overwrite button is pressed. Separate thresholds from calibration's:
   * this listens over a playing loop, not a silent room.
   */
  autoDetect: {
    /** RMS a block must reach to count as playing. */
    threshold: 0.04,
    /** How much louder than the recent floor the rise must be. */
    riseRatio: 3.5,
    /** Dead time after a hit, ms — one note can't arm twice. */
    refractoryMs: 200,
    /**
     * A level threshold fires a block or two after the actual attack, so the
     * punch starts this much earlier than the detection. Clamped to the loop
     * iteration's start so it can never wrap into the previous one.
     */
    onsetBackoffMs: 25,
  },

  save: {
    /** How long "Saved!" / "Deleted!" shows before settling back to "Save". */
    savedFlashMs: 1600,
    /**
     * Hold before the Save button turns into Delete Saved. A press shorter than
     * this is an ordinary click, so saving never flashes red on the way.
     */
    deleteArmMs: 350,
    /** How long the armed button must be held to actually delete, ms. */
    deleteHoldMs: 2000,
    /** IndexedDB database and store names. */
    dbName: "loop-station",
    dbVersion: 1,
    manifestStore: "manifest",
    segmentStore: "segments",
    /** Single-slot save; a second Save overwrites it. */
    slotKey: "current",
  },

  metronome: {
    /** Click length, seconds. */
    clickSeconds: 0.03,
    /** Accented (beat 1) click pitch, Hz. */
    accentHz: 1760,
    /** Other beats' click pitch, Hz. */
    beatHz: 1174,
    /** Click gain, linear. */
    gain: 0.5,
  },

  scheduler: {
    /** How often the lookahead timer ticks, milliseconds. */
    tickMs: 25,
    /** How far ahead of the audio clock events are scheduled, seconds. */
    lookaheadSeconds: 0.1,
  },

  mix: {
    /** Track/bus/master sliders run 0–100; this is the gain at 100. */
    maxGain: 1.0,
    /**
     * The master fader alone may boost past 100. Tracks and buses stay capped
     * there — this is a mix output trim, not a per-source one. The limiter
     * below is what keeps the extra headroom from turning into hard clipping.
     */
    maxMasterVolume: 150,
    /** Default positions for new tracks and buses, 0–100. */
    defaultVolume: 80,
    defaultReverb: 15,
    defaultMasterVolume: 80,
    defaultMasterReverb: 20,
    /** setTargetAtTime constant for volume/mute ramps, seconds. No zipper noise. */
    rampSeconds: 0.015,
    /** Equal-power crossfade when a track's buffer is swapped live, seconds. */
    swapFadeSeconds: 0.015,
    /** Lead time between deciding a swap and its scheduled start, seconds. */
    swapLeadSeconds: 0.05,
    maxBuses: 3,
    /**
     * Nothing structural caps this — the cost is memory. A track holds its padded
     * recording, the baked loop and that buffer's AudioBuffer copy: ~35MB each at
     * the extreme (a 60s loop, mono 48kHz), ~5MB at ordinary loop lengths. The
     * capture ring buffer is unaffected; there is one, sized by maxLoopSeconds.
     */
    maxTracks: 20,
  },

  bake: {
    /** Equal-power crossfade at every tile seam (and the loop wrap), seconds. */
    seamFadeSeconds: 0.015,
    /** Re-bake debounce while a delay slider is dragging, milliseconds. */
    debounceMs: 120,
  },

  reverb: {
    /**
     * Generated impulse-response length, seconds. This does **not** set how
     * long the reverb rings — see `irDecay` — it only decides how much of the
     * tail is stored before being cut off. Keep it comfortably above RT60 or
     * the tail ends in a step.
     */
    irSeconds: 3.5,
    /**
     * Decay rate of the IR envelope. Higher dies faster.
     *
     * The envelope is `exp(-irDecay · t · irSeconds)` with `t = i/length`, so
     * the seconds cancel: **RT60 = 6.9 / irDecay, independent of irSeconds**.
     * At 2.2 the tail rings for about 3.1s. Raising `irSeconds` alone would
     * change nothing audible; this is the length knob.
     */
    irDecay: 2.2,
    /** Return-path gain at master reverb = 100. The wetness knob. */
    maxReturnGain: 2.0,
  },

  /**
   * Soft limiter on the master output. Inaudible below full scale; above it,
   * peaks round off instead of being shredded by the browser's hard clip —
   * which a 150% fader and a loud reverb return can otherwise reach easily.
   */
  limiter: {
    thresholdDb: -3,
    kneeDb: 0,
    ratio: 20,
    attackSeconds: 0.003,
    releaseSeconds: 0.12,
  },

  ui: {
    /** Waveform bars rendered per track row. */
    waveBars: 300,
    /**
     * Waveform envelopes are normalised to their own loudest bar. This is the
     * floor that divisor is clamped to, so a near-silent take stays visually
     * flat instead of being amplified into noise.
     */
    waveFloor: 0.05,
    /** Metronome/level meter segments. */
    meterSegments: 16,
    /**
     * Bottom of the meters' dB scale. Levels map amplitude → dBFS → this range,
     * because a linear amplitude scale leaves real material stuck near the floor.
     */
    meterFloorDb: -48,
    /** Meter smoothing per frame: jump to a rise, ease down from it. */
    meterAttack: 0.55,
    meterRelease: 0.12,
    /** Rename fields clip here so names can't blow the row layout apart. */
    trackNameMaxLength: 18,
    busNameMaxLength: 12,
  },
} as const;

export type LoopStationConfig = typeof config;
