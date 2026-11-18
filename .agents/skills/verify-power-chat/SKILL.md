---
name: verify-power-chat
description: "Drive the real Power Chat (built apps/chat on its own local Worker and D1) the way a person does and capture proof: screenshots, ARIA snapshots, ranked design findings, the build beside a reference image, and numbered before / after callouts for the PR. Use before review to prove any change a person sees in the chat, sidebar, composer, sign-in or admin space."
---

# Verify Power Chat

One command starts a private copy of Power Chat: the built `apps/chat` bundle and its Worker under `wrangler dev --local`, with local auth, the browser catalog fixture and a fresh D1 in its own folder. Every port is free-picked and nothing is shared with another agent or with `pnpm test:browser`.

Run it from the repo root. Below, `V` means the helper:

```sh
V=.agents/skills/verify-power-chat/bin/verify-power-chat.mjs
```

`$V` with no command prints usage. Every command prints one JSON line, or a message and exit 1.

## Launch, doctor, stop

```sh
$V launch                       # this checkout, built now
$V launch --ref origin/main     # a scratch worktree of another commit, for "before"
$V doctor <run>                 # serveOwned, appServed, apiAnswers, buildIsHead
$V stop <run>                   # stops only this run's Worker, removes its scratch and worktree
```

Launch prints `{run, origin, commit, evidence}`. Keep the `run`. A launch takes about 25 s, plus a `pnpm install` for `--ref`. Launch again after you edit code: the stack serves the build it made. Run `stop` for every run you launched, passed or failed. A launch prints its run on stderr first, so a launch that fails can be stopped too. Evidence under `~/tmp/verify-power-chat/<run>/` survives `stop`.

Chromium needs system libraries. When they are missing, the helper adds `~/.cache/chromium-libs/root/usr/lib/x86_64-linux-gnu` to `LD_LIBRARY_PATH` if it exists, and otherwise names the missing library.

## View options

`look`, `beside` and callout blocks take the same view:

- `--as <email>` signs in through the real magic link, read from the run's `mail_log`. The default is `person@powerday.work`. `admin@example.com` is the admin. `--as nobody` stays signed out.
- `--width`, `--height` in CSS px (default 1280 by 800), `--scheme light|dark`. Captures run at device scale 2 with reduced motion.
- `--say <text>` sends a message through the composer and waits for the mock reply, so a chat has content.
- `--click <selector>` clicks after load, repeatable, such as `'button:has-text("Toggle Sidebar")'`.

## look

```sh
$V look <run> / --as admin@example.com --width 375 --height 812
```

Writes `page.png`, `aria.txt`, `findings.json` and `annotated.png`, with each finding boxed and numbered (red rank 1, orange rank 2). Rank 1: a person loses content or a control. Rank 2: readability or reach.

| Detector        | Rank | Catches                                                                       | Cannot judge                                                                 |
| --------------- | ---- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| page-overflow   | 1    | an element past the right edge that scrolls the page sideways                 | overflow inside a scroller                                                   |
| unnamed-control | 1    | a visible button, link or field with no accessible name                       | whether the name is right                                                    |
| cut-text        | 2    | text cut by an ellipsis, a line clamp or hidden overflow                      | whether the cut was meant                                                    |
| small-target    | 2    | a control with a side under 24 CSS px and an area under 24 by 24 (WCAG 2.5.8) | a long thin control, such as a 16 px edge handle; inline links in a sentence |
| text-contrast   | 2    | text under WCAG AA against the solid colors under it                          | text over images, gradients or filters                                       |

Zero findings is not a design sign-off. Open `page.png` and say what you see, as a designer would: what draws the eye, what looks off, what differs from the reference.

## beside: match a reference image

```sh
$V beside <run> / --reference ref.png --scale 1.4 --regions regions.json --as admin@example.com
```

Captures the build at the reference's size divided by `--scale`, puts the reference and the build together (side by side when they fit, the reference above when the capture is wide), boxes each region on both, and writes `beside.png` and `beside.json` with the box deltas in CSS px. A region is `{ "name", "selector", "target"?: "text", "reference": {x, y, width, height} }`, with the reference box in image px.

Find the scale before you trust a delta. A Mac screenshot is usually 2, but a resized one is not. Match a known size, such as a 768 px composer or a 14 px label, and write the scale down as an estimate. Compare proportions first: the rail's and panel's share of the width, the composer's width and height, and where the greeting sits. Pixels come after. Sample the reference's colors to tell which surfaces share a background and which have a border. Keep a reference screenshot of another product out of the public repo and its releases.

## annotate: before / after for the PR

Write a callouts file, one block per state:

```json
[
  {
    "path": "/",
    "title": "New chat at 1430 px, admin, light",
    "width": 1430,
    "height": 900,
    "as": "admin@example.com",
    "callouts": [
      {
        "at": ["nav[aria-label=Spaces]", "a[href='/admin']"],
        "note": "Chat / Admin switch at top center (was a sidebar footer link)"
      },
      {
        "at": "h1:has-text('How can I help you today')",
        "target": "text",
        "note": "Greeting sits right above the composer"
      }
    ]
  }
]
```

```sh
$V launch --ref origin/main          # before
$V launch                            # after
$V annotate callouts.json --before <run> --after <run> --out <dir>
```

- `at` is a selector, a list of selectors (the first visible match wins, so one callout can name the old place on Before and the new one on After), or a box in CSS px. `target` is `element` (default, for frames and geometry) or `text`.
- `crop` takes a selector or a box. Both sides use the union of their crop boxes, padded 24 px, so a moved element stays in frame. `say`, `click` and `scheme` work as in the view options.
- Each side places its own numbered circles on the side of the target with the most room, off every target, other circle, line of text and icon. The arrow stops 3 px outside the target.
- A note stays under 90 characters and names the measured change, such as "Composer is one centered pill, 768 px wide".

It writes `annotated-N.png` and `before-after.md`, and lists warnings: a callout not found on a side, a target outside the crop, a page error. "Not found on Before" is right only for something new.

Open every image before you publish it. Check that each arrow lands on the thing its note names on both sides, that no circle hides text, that every note is true, and that a stranger sees the change in ten seconds. Fix the callouts and render again until it does.

## publish

```sh
$V publish <dir> --pr <number>
```

Uploads each PNG to the `proof` prerelease as `pr-<number>-<name>-<sha256:10>.png` and writes `before-after.published.md` with the links. Paste it into the PR's `## Before / after` section. Never paste a local path.

## Tests

`node --test .agents/skills/verify-power-chat/look/draw.test.mjs` covers callout reading, circle placement and arrow ends.
