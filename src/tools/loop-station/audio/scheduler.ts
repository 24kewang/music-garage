import { config } from "../config";

/**
 * The lookahead scheduler — the "two clocks" pattern. A coarse JS timer ticks
 * every ~25ms; each tick, the callback schedules any audio events falling in the
 * next ~100ms against their exact `AudioContext.currentTime` timestamps. The
 * timer only decides *when to schedule*; the audio hardware clock decides when
 * things actually sound. Nothing musical is ever timed off the JS clock itself.
 */
export function createScheduler(onTick: () => void): () => void {
  const id = setInterval(onTick, config.scheduler.tickMs);
  // Run one tick immediately so nothing waits for the first interval.
  onTick();
  return () => clearInterval(id);
}
