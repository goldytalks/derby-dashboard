# Versus mode: two fans, one arcade face-off slip

## Concept

Versus mode turns two completed fan portraits into a single square face-off card: France against Morocco, Spain against Belgium, USC against its opener, or any configured matchup.

The direction borrows the energy of a classic arcade-fighter matchup screen without copying another game's logo, characters, typography, sound, or protected artwork.

Visual ingredients:

- two large portraits angled toward the center,
- a bright central **VS** burst,
- country flags or team colors behind each person,
- mirrored nameplates,
- odds and chance under each side,
- one shared matchup line,
- and the Novig frame and tagline.

## Finished square

```text
┌────────────────────────────────────────┐
│ NOVIG                         MATCH 97  │
│                                        │
│  🇫🇷 FRANCE        VS       MOROCCO 🇲🇦  │
│  ┌────────────┐        ┌────────────┐  │
│  │            │   ✦    │            │  │
│  │  FAN A     │  /|\   │    FAN B   │  │
│  │  PORTRAIT  │  VS    │  PORTRAIT  │  │
│  │            │  \|/   │            │  │
│  └────────────┘        └────────────┘  │
│  -170 · 63%              +500 · 16.7%  │
│                                        │
│             novig: for the cup         │
└────────────────────────────────────────┘
```

The portraits should overlap the frame slightly so the result feels like a poster, not two passport photos.

## Recommended interaction: two linked phones

The cleanest event version uses one phone per fan.

### Fan A

1. Opens the configured matchup.
2. Taps **Challenge a friend**.
3. Receives a short room code and QR.
4. The left side is assigned automatically.
5. Takes one photo.

### Fan B

1. Scans the QR or enters the room code.
2. The right side is assigned automatically.
3. Takes one photo.

Both devices show the same room state. Generation begins for each person immediately after that person's capture; it does not wait for the other camera.

When both portraits pass quality checks, the server composes the shared square and both devices receive the same final URL.

## Same-device alternative

For a staffed physical booth, one tablet can capture Fan A and then Fan B in sequence.

This requires fewer devices but adds waiting and makes the first fan step away from the camera. Use it only where pairing two phones is impractical.

## Room state

```ts
type VersusRoom = {
  id: string;
  eventExperienceId: string;
  state: "waiting" | "capturing" | "generating" | "composing" | "complete" | "expired";
  leftSessionId?: string;
  rightSessionId?: string;
  finalSlipKey?: string;
  createdAt: string;
  expiresAt: string;
};
```

Each side remains an ordinary hosted booth session with its own immutable input, provider requests, generated portrait, and timing. The room record only links the two sessions and the combined artifact.

## API sketch

| Endpoint | Purpose |
| --- | --- |
| `POST /api/versus` | Create a room for the configured matchup |
| `POST /api/versus/:id/join` | Atomically claim the remaining side |
| `GET /api/versus/:id` | Read room and participant readiness |
| `POST /api/sessions` | Create each participant's photo session |
| `POST /api/sessions/:id/generate` | Start that side's image edit exactly once |
| `POST /api/webhooks/provider` | Complete an individual generated portrait |
| `POST /api/versus/:id/compose` | Idempotently create the combined square when both sides are ready |

The join operation must be transactional so two people cannot claim the same side.

## Pairing and privacy

- Room codes contain no personal information.
- QR links use unguessable room tokens.
- A room expires after ten minutes if the second fan never joins.
- A participant can remove their photo before the combined card is complete.
- The final artifact inherits the event's deletion window.
- The room cannot reveal one fan's source image to the other device; it exposes only status and the finished shared artifact.

## Latency

Versus generation runs in parallel.

If both people capture at nearly the same time:

```text
total pair latency = max(left generation, right generation) + composition
```

The pair does not wait for one generation and then start the other.

Targets after the second shutter:

- both generation lanes already active or start immediately,
- both accepted portraits available by `T+24`,
- versus composition complete by `T+27`,
- shared card visible on both devices by `T+30`.

If one participant captured earlier, their completed portrait is held securely and the 30-second clock begins from the second shutter.

## Visual variants to test

### 1. Split frame

Diagonal seam, each portrait owns half the square, oversized VS in the center. This is the clearest first prototype.

### 2. Face-off crop

Tighter shoulder-and-head crops, both people looking inward, flags filling the background. Highest arcade energy but more sensitive to portrait pose.

### 3. Gallery duel

Two smaller gilded portrait frames inside one larger Novig frame. Closest to the current Gallery Slip and easiest to compose reliably.

Recommended sequence: prototype **Split frame**, keep **Gallery duel** as the robust fallback, and test **Face-off crop** only after the image provider reliably produces inward-facing portraits.

## Minimal public actions

Before capture:

- **Challenge a friend**
- **Join challenge**

After completion:

- **Save versus slip**
- **Next matchup**

Do not add chat, profiles, friend lists, rematch settings, editable odds, or a bracket builder to the first version.

## Acceptance criteria

1. Two devices cannot claim the same side.
2. Each camera frame creates exactly one participant session.
3. Both generated identities appear on the correct side.
4. Matchup, flags, odds, and chance are deterministic application data, not generated text.
5. A stale or duplicated webhook cannot replace either participant.
6. Both devices receive the same final artifact URL.
7. The shared card is visible within 30 seconds of the second shutter in the release load test.
8. Expired and abandoned rooms delete their temporary source images.

