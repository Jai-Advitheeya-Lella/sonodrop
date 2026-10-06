/**
 * The live audio feed every visual reads from. In the main window the engine fills it each frame;
 * in a desktop widget it is filled from frames the main window sends over. Nothing here touches React.
 */

/** Smoothed, volume-independent levels, each 0..1. */
export const levels = { bass: 0, mid: 0, treble: 0, level: 0, beat: 0 }

export const FEED_SIZE = 64

/** FEED_SIZE log-spaced spectrum bands (30 Hz – 16 kHz) followed by FEED_SIZE waveform samples, 0..255. */
export const feed = new Uint8Array(FEED_SIZE * 2).fill(0, 0, FEED_SIZE).fill(128, FEED_SIZE)

/** What the transport is doing, for visuals that mimic a record player. */
export const transport = { playing: false, progress: 0 }
