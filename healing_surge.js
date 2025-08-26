// Healing Surge (D&D5e) — spend Hit Dice to heal
// Select a token, run macro. Works in Foundry VTT with the D&D5e system.

const tokenDoc = canvas.tokens.controlled[0];
if (!tokenDoc) return ui.notifications.warn("Select a token first.");
const actor = tokenDoc.actor;
if (!actor) return ui.notifications.error("No actor on that token.");

const classes = actor.items.filter(i => i.type === "class");
if (classes.length === 0) return ui.notifications.error("This actor has no class items.");

function classLabel(c) {
  const die = c.system?.hitDice ?? "d8";
  const level = c.system?.levels ?? 1;
  const used  = c.system?.hitDiceUsed ?? 0;
  const avail = Math.max(level - used, 0);
  return `${c.name} (${avail}/${level} × ${die})`;
}

// Build choices (only classes with at least 1 remaining HD will be selectable)
const classOptions = classes.map(c => {
  const level = c.system?.levels ?? 1;
  const used  = c.system?.hitDiceUsed ?? 0;
  const avail = Math.max(level - used, 0);
  return { id: c.id, name: classLabel(c), avail, die: c.system?.hitDice ?? "d8" };
}).filter(o => o.avail > 0);

if (classOptions.length === 0) return ui.notifications.warn("No Hit Dice remaining to spend.");

const conMod = actor.system?.abilities?.con?.mod ?? 0;

// Render Dialog
const content = `
  <form>
    <div class="form-group">
      <label>Class / Hit Dice</label>
      <select id="hs-class">
        ${classOptions.map(o => `<option value="${o.id}" data-die="${o.die}" data-avail="${o.avail}">${o.name}</option>`).join("")}
      </select>
    </div>
    <div class="form-group">
      <label>Dice to Spend</label>
      <input id="hs-count" type="number" min="1" value="1" style="width: 6em;" />
      <p class="notes">Adds CON mod (${conMod >= 0 ? "+" : ""}${conMod}) to each die.</p>
    </div>
  </form>
`;

new Dialog({
  title: "Healing Surge",
  content,
  buttons: {
    heal: {
      label: "Spend Hit Dice",
      callback: async (html) => {
        const sel = html.find("#hs-class")[0];
        const classId = sel.value;
        const die = sel.selectedOptions[0].dataset.die || "d8";
        const avail = Number(sel.selectedOptions[0].dataset.avail || 0);
        let count = Math.max(1, Number(html.find("#hs-count").val() || 1));
        if (count > avail) count = avail;

        const cls = actor.items.get(classId);
        if (!cls) return ui.notifications.error("Class not found.");

        // Roll the dice
        const formula = `${count}${die} + ${count * conMod}`;
        const roll = await (new Roll(formula)).roll({async:true});

        // Apply healing, capped at max HP
        const hp = actor.system?.attributes?.hp;
        if (!hp) return ui.notifications.error("Actor has no HP data.");

        const before = hp.value;
        const healed = Math.clamped(roll.total, 0, hp.max - before);
        const after = before + healed;

        await actor.update({"system.attributes.hp.value": after});

        // Mark Hit Dice as used on the class item
        const used = cls.system?.hitDiceUsed ?? 0;
        await cls.update({"system.hitDiceUsed": used + count});

        // Chat message
        const flavor = `
          <div style="display:flex;gap:.5rem;align-items:center;">
            <img src="${tokenDoc.document.texture.src}" width="36" height="36" style="border:0"/>
            <b>${actor.name}</b> uses a <b>Healing Surge</b> (${count}× ${die} + ${count}× CON).
          </div>
          <div>Roll: <code>${formula}</code></div>
          <div><b>Healing:</b> ${roll.total} → <b>Applied:</b> ${healed}</div>
          <div>HP: ${before} → ${after} / ${hp.max}</div>
        `;
        roll.toMessage({
          speaker: ChatMessage.getSpeaker({actor}),
          flavor
        });
      }
    },
    cancel: { label: "Cancel" }
  },
  default: "heal"
}).render(true);