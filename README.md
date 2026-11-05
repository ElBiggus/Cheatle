# Cheatle

Too smooth-brained for Worlde? Let me help with that!

Cheatle is a browser-based Wordle helper that uses science and magic to cut down on the amount of thinking required. No AI, just statistics!

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

## Use

1. Enter the suggested guess in Wordle.
2. Click each letter box to match the feedback cycle:
   - 1st click: grey (not in word)
   - 2nd click: yellow (in word, wrong position)
   - 3rd click: green (correct)
   - Additional clicks repeat this cycle
3. Click **Next guess**.
4. Choose your next guess from the list, and enter into Wordle. The primary list shows words that "fit" the current clues, the elimination list shows words that use untried letters with potential re-use of "right letter, wrong place" letters if it can't make words out of what's left.
   - Elimination words are not a strategy I've ever used before, but as *not* being able to use them is apparently what the "hard mode" toggle does in Wordle I guess some people find them helpful? Given that in most cases a "valid" guess can eliminate just as many words as an "invalid" one I don't really see the point but who am I to judge?
5. Repeat until solved.

Use **Reset** to restart from the full answer set.

Candidate words can be sorted by clicking the column headers. The "Eliminates" figure shows an estimated worst-case for how many words will be eliminated from the list if that word is chosen - it's not 100% accurate, but in most cases where it's wrong it should be _conservatively_ wrong.

While I can't guarantee it's flawless I have tested it against around 100 archived Wordles with no failures. Using the default "score" ranking method it can generally match Wordle Bot, but a combination of "common sense" (for example, while *DENNY* may be a "more likely" answer based on letter frequency *PENNY* is probably a better bet) and choosing carefully between score and elimination metrics I can beat the bot around 40% of the time.

(I also can't guarantee the word list is correct - if you find any errors or omissions then let me know!)

Why make this, you may ask. Surely it defeats the spirit of the game? Well sure, but nobody's forcing you to use it - I did it just to see if I could.

## To-Do

1. Use a less naive approach to histogram scoring, taking letter grouping and other language features into account - for example S is a common letter which means words with a double S score disproportionately high given the number of SS words in the list.
2. ~~Add an "elimination only" candidate word list (i.e. words that use a minimum number of already-tried letters)~~ DONE
3. ?
4. PROFIT!

## Revision history

- 04-11-2026: Initial commit
- 05-11-2026: Fixed a couple of minor oddities in the list generation and selection UI
- 05-11-2026: Fixed README.md