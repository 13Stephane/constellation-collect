# nova curva · entrada rápida

`docs/nova-curva.html` — one self-contained file, no build step, no dependencies. Change
request 7, which supersedes the typed-digit approach of change request 3.

## The two addresses

| Who | URL |
|---|---|
| relator (QR per table) | `nova-curva.html?mesa=3&sessao=tarde` |
| facilitator | `nova-curva.html?console=1&sessao=tarde` |

Without `mesa` the relator screen does not open. Wrong table and wrong session are the two
failures that corrupt data in silence, so the one defence against them is also the one thing
the page refuses to start without.

## What it does

- **One screen, four steps.** Triagem · Colocação · Muro · Compromisso as a vertical list.
  The facilitator opens one from the console; it expands, the other three stay greyed and
  inert. Tapping a closed step does nothing — there is nowhere to navigate to.
- **The sort.** 4×4 grid, card order. Tap: submerso → pôlder → neutral. Long press:
  sem acordo. The chip carries the number only; the "?" under the grid opens the texts.
- **The placement.** Seven rows, three buttons, seven taps. The rival name field appears
  in `sessao=manha` only, and is one of the two text inputs in the whole flow.
- **The wall.** Twelve letter chips A–L, same two-state tap, plus the optional addition.
- **Autosave, no submit.** Every tap writes. One `travar` at the foot, one `desfazer`
  that reverses the last tap and counts down from sixty. No dialogs.
- **The read-back.** A locked step reads itself back in plain language —
  *submerso: 1, 2, 3 · pôlder: 16 · sem acordo: 7* — so the relator checks it against the
  paper without leaving the screen.
- **Offline first.** Writes queue in `localStorage` and flush when the network returns. The
  relator sees no spinner, no error, and no sync counter; if the queue is unsent at lock
  time, one quiet line: *guardado no aparelho, vai sincronizar.*
- **The console.** One screen: open a step, watch every table's state, and type the fallback.
  The three line formats tell themselves apart — digits are the sort, letters are the wall,
  words are the placement — so the facilitator types tables, not modes.

## The two things to fill before a session

Both live in the `CONTENT` block at the top of the `<script>`. The surface works with them
empty, because the relator taps numbers and letters, not text.

1. **`cartas[].texto`, `eixos[].nome`, `muro[].texto`** — the deck's own wording. With
   `nome` set, the placement rows re-lay themselves to carry the name; empty, they are
   numbered. The "?" says plainly when nothing is loaded rather than showing a blank sheet.
2. **`compromisso`** — `{pergunta, opcoes:[{id, rotulo}]}`. The commitment fork belongs to
   the model, which change request 7 explicitly does not touch, so it is not invented here.
   Until it is filled, step 4 says so and its lock is disabled; the facilitator records that
   table from the console.

## The transport

`TRANSPORT.endpoint` is `null`. On that setting every table is local to its own device and
the console reads the tables that device has seen — which is exactly the fallback case, and
is how the whole flow can be rehearsed on one laptop. Point `endpoint` at a service that
accepts `POST {events}` and answers `GET ?sessao=` with `{aberto}` and the same code drives
a room of phones; nothing else changes. The queue, the flush, and the control poll are
already there.

## Tests

`nova-curva.test.mjs` exercises the page against every acceptance criterion — tap states,
the long press, undo, the read-back, the offline path, the fallback parser and its
rejections, and zero overflow at 390×844, 360×640 and 320×568. Fifty-seven assertions:

```bash
npm i playwright
node nova-curva.test.mjs
```

Touch targets measure ≥44px on the chips and ≥40px on the axis buttons and the lock, at the
smallest phone tested. What the script cannot measure is the forty seconds; what it can
measure is that a typical sort costs six taps, the placement exactly seven, and neither
costs a scroll.
