# clipback

Clip a YouTube segment into a written note — without leaving the page, and
without the note claiming anything the transcript does not support.

You press a shortcut while watching. clipback takes the last three minutes,
reads what was actually said, and writes a note where **every claim carries the
verbatim span it came from**. A claim whose span cannot be found in the source
is not written down.

## Why the spans matter

Summaries of long videos are easy to generate and hard to trust. A note you
cannot check is a note you re-watch the video to verify, which defeats the point
of having it.

So clipback does something narrower and more useful: it grounds every claim
against the transcript by string matching — no model checking another model —
and drops the ones that do not match. When nothing matches, it says so and
writes nothing, rather than producing a confident note about a segment it could
not read.

The match is not fuzzy-by-vibes. Both sides are normalised the same way —
Unicode NFC, zero-width characters stripped, punctuation stripped, whitespace
collapsed, case folded — and a span must be at least four words before it counts.
That floor exists because without it the empty string is a substring of every
transcript, and a model returning empty spans would ground everything.

## Bring your own key

There is no clipback server. Your key lives in your browser for the session and
goes to your provider and nowhere else — because there is nothing else for it to
go to. Three providers behind one interface; adding a fourth is one file.

Captions mode is free and covers most videos. Video mode costs about 1.7¢ a clip
and exists for the ones where the captions are unusable — which, for
code-switched Hindi/English conversation, is often.

## Status

**Early.** The repository skeleton, toolchain and CI are up; the product is
being implemented against a written design.

## Development

```bash
npm install
npm run build          # produces dist/
npm test
npm run typecheck && npm run lint
```

Then load `dist/` unpacked at `chrome://extensions` with Developer mode on.

## License

MIT
