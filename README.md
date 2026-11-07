# Cheatle

Too smooth-brained for Worlde? Let me help with that!

Cheatle is a browser-based Wordle helper that uses science and magic to cut down on the amount of thinking required. No AI, just statistics!

Why make this, you may ask. Surely it defeats the spirit of the game? Well sure, but nobody's forcing you to use it - I did it initially out of spite after a particularly annoying "four letters confirmed, only one space, but there are four potential options" moment and it was meant as a throwaway piece of nonsense but I have now fallen down a rabbit hole of my own devising.

## Run

Serve this folder over HTTP (recommended):

```powershell
cd {your install path}
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Or just visit http://nd-network.co.uk/cheatle which should always be hosting the current version (although without the simulation harness).

## Use

1. Enter the suggested guess in Wordle.
2. Click each letter box to match the feedback cycle:
   - 1st click: grey (not in word)
   - 2nd click: yellow (in word, wrong position)
   - 3rd click: green (correct)
   - Additional clicks repeat this cycle
3. Click **Next guess**.
4. Choose your next guess from the list, and enter into Wordle. The primary list shows words that "fit" the current clues, the elimination list shows words that use untried letters with potential re-use of "right letter, wrong place" letters if it can't make words out of what's left. Words that are in the "Classic Wordle" solution pool are highlighted in green; while the list is no longer canonical it's not _entirely_ without merit, and when you're down to a handful of candidate words it may be worth favouring them over other options as long as you bear in mind that there will be valid solutions that are *not* in the OG list.
   - Elimination words are not a strategy I've ever used before, but as *not* being able to use them is apparently what the "hard mode" toggle does in Wordle I guess some people find them helpful? Given that in most cases a "valid" guess can eliminate just as many words as an "invalid" one I don't really see the point but who am I to judge?
5. Repeat until solved.

Use **Reset** to restart from the full answer set.

Candidate words can be sorted by clicking the column headers. The primary list defaults to score, and the elimination list defaults to entropy. The "Eliminates" figure shows a worst-case for how many words will be eliminated from the list if that word is chosen; most of the time it will eliminate *more* words, and it will never eliminate *fewer* words. The "Entropy" figure estimates the potential information gain that the word offers and is used to select the listed elimination candidates, but due to the computational overhead this is only computed for a subset of the word list so it's not guaranteed to be optimal.

## So how "good" is it at playing Wordle?

It's hard to say definitively. For target solutions picked from the *whole* ~13000 word list a lazy brute force "choose the first candidate word from the primary list" will get the answer in 6 or fewer turns in ~90% of cases with success taking an average of 4 turns. Using the non-canonical OG answer list of ~2300 words as target solutions this improves to ~95% success rate, and combining the reduced solution pool with a strategy of favouring the OG words when they're in the top 10 candidates it reaches ~99% success with only 17 failures across the set (mostly with awkward words like "ROGER" that result in a guess chain of "DINER LOWER COVER POKER FOYER HOMER BOXER ROGER"). In reality it's probably somewhere between the two extremes.

What's that? "So why not just use the OG list in the first place, forget the rest of it?" you ask? I tried that, and it works fine in simulation, 100% success, no foul, nor faults, no whammy, but when tested against actual archived Wordle games literally my second attempt had a solution that wasn't in the OG list. That's why.

*IMPORTANT NOTE* Since no canonical "valid guess" or "answer pool" lists have been available since the NYT took ownership of Wordle I cannot guarantee that all the possibilities are covered - let me know if you find any errors (either invalid guesses, or a solution that's somehow not in the list), and if anyone has a lead on a more up-to-date list then that would be smashing!

## Simulation

These were mostly useful during testing and development; they're a bit fragile, and unless you're going to try and tweak the word evaluations in the code there's no real reason why you'd want to run them. Still, if you're a glutton for punishment or *really* bored then I have included them in the repo. No instructions are provided, figure it out yourself!

## Things I have learned throughout this process

First, there are some really stupid five letter words out there.

Second, while there is some skill involved in the game, a large part of the difference between a two or three step solve and a five or six step solve is dumb luck. With some refinement of word ranking maybe I could push the average solution length closer to 3 than 4, but *BASTE CASTE HASTE PASTE WASTE*, *BILLY DILLY FILLY HILLY WILLY*, or *POUND BOUND FOUND HOUND MOUND WOUND* seem like they're never going to succumb to computation alone.

## To-Do

1. I honestly think I've just about exhausted the possibilities now.
2. ?
3. PROFIT!

## Revision history

- 04-11-2026: Initial commit
- 05-11-2026: Fixed a couple of minor oddities in the list generation and selection UI
- 05-11-2026: Fixed README.md
- 05-11-2026: Added positional weighting to the "score" ranking; weights are currently placeholder values until I've done some deeper analysis
- 06-11-2026: Elimination word list is now ranked by an entropy evaluation rather than simple minimum elimination value - slightly more effective, although it comes at a performance cost; also fixed UI bug that could erroneously highlight unveriified letters when picking from elimination list
- 07-11-2026: Massive entropy performance boost, additional UI tweaks, added the non-canonical OG solution pool as a "hint" to potentially improve accuracy, waffled on in the README for ages because I'm overtired and overcaffeinated