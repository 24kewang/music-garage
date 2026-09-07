# 🏀 MUSIC

HORSE, played on melodies. Two to four musicians take turns; a failed copy earns a
letter, and spelling out **MUSIC** puts you out. Last player standing wins.

One player is the **setter**. They record the melody they are calling, then record it
again. The confirmation take has to match, which is the melodic equivalent of making the
shot you called. If it matches, the first take becomes the round's target and everyone
else copies it in turn. If it does not, nobody takes a letter and the turn passes on.

**Making your shot keeps you shooting.** Once everyone has answered, the melody goes
back to the same setter for another one. You only lose the ball by missing a confirmation
of your own. Before a first take is recorded, **any box on the board can be clicked** to
hand that player the turn: turn order picks a sensible default, but four people around
one screen rarely go in array order. The choice locks the moment a melody is recorded and
opens again when the round comes back around.

## What gets compared

A **sequence of pitches**, and nothing else:

- **Rhythm is discarded.** Play it faster or slower, in any time you like.
- **Silences don't count.** A rest can't split a note or fake a repeat.
- **Adjacent repeats collapse.** `C C G G A A G` is heard as `C G A G`.
- **Any key, any octave.** The comparison searches every transposition and keeps the
  best, so a bass and a piccolo can copy each other note for note. Leaps still have to
  be leaps: relative octave counts, absolute register does not.

A singer and a trumpet player can therefore play each other. **One note at a time,
though.** The pitch detector is monophonic, so chords give it nothing to hold.

## Recording

Press record and it listens instead of recording. The clock only starts on your first
note, so reaching back for your instrument costs you nothing. There is a live level ring
while it listens, a countdown over the last five seconds, and a second press stops early.
Press stop before playing anything and nothing is saved; the turn is untouched, as though
you never pressed it. Setters get 10 seconds and copiers get 30, since rhythm does not
count and nobody should fail for not matching someone else's note density.

Lose a copy and a dialog shows why: your attempt drawn over the melody you were copying,
green where the notes matched and red where they did not, with a missing or extra note
showing as a visible gap in one of the two lines. The score out of 100 underneath is not
flattering. A near miss reads in the high eighties, which is the number that makes
switching to loose tolerance an informed choice.

## The gear panel

**Players** is the roster: drag a row **by its handle** to reorder it, rename anyone,
edit a strike count directly, and switch players in and out, down to a floor of two.
Top-to-bottom here is left-to-right on the board. You can also focus a handle and use the
arrow keys.

**Game** sets the word, any 1–5 letters and not just MUSIC, plus the tolerance,
**strict** or **loose**. Everything applies immediately, including a shortened word that
eliminates somebody on the spot. Settings lock while a melody is being copied, since that
round's terms are already set.

Everything persists but the audio: names, order, who's in, the scores, the word and the
tolerance all survive a reload.

---

Transcription is [pitchy](https://github.com/ianprime0509/pitchy)'s McLeod Pitch Method
over a captured buffer, and judging is a weighted Needleman–Wunsch alignment over a
transposition search. Every threshold is tunable in [`config.ts`](config.ts). See
[`ARCHITECTURE.md`](ARCHITECTURE.md) for the decisions, including why plateau detection
uses a band around a fixed anchor instead of a derivative, why the substitution ceiling
has to stay under two indels, and why the tuning offset comes out before rounding.
