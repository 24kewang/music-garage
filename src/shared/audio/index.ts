/**
 * Public surface of the shared audio module.
 *
 * Games should import from `@/shared/audio` only — never from the individual files
 * or from `pitchy` — so the implementation stays swappable.
 */

export {
  NOTE_NAMES,
  DEFAULT_A4,
  frequencyToMidi,
  midiToFrequency,
  midiToNoteName,
  midiToOctave,
  frequencyToNote,
  formatNote,
  formatMidi,
  parseNoteName,
  type NoteName,
  type DetectedNote,
} from "./notes";

export {
  createPitchDetector,
  detectPitch,
  DEFAULT_PITCH_OPTIONS,
  type PitchResult,
  type PitchDetectionOptions,
  type Detector,
} from "./pitch";

export {
  useMicrophone,
  type Microphone,
  type MicrophoneStatus,
  type MicrophoneOptions,
} from "./useMicrophone";

export {
  usePitchDetector,
  type LivePitch,
  type PitchDetectorOptions,
} from "./usePitchDetector";
