import { useState } from "react";
import { newId } from "../../lib/reducer";
import type { CardData, GameAction } from "../../lib/types";

interface Props {
  playerId: string;
  dispatch: (a: GameAction) => void;
  onClose: () => void;
}

const COLOR_KEYS = ["W", "U", "B", "R", "G", "C"] as const;
const TYPE_OPTIONS = ["Creature Token", "Artifact Token", "Land Token", "Planeswalker Token"] as const;
type TypeOption = (typeof TYPE_OPTIONS)[number];

export default function TokenModal({ playerId, dispatch, onClose }: Props) {
  const [name, setName] = useState("");
  const [typeOption, setTypeOption] = useState<TypeOption>(TYPE_OPTIONS[0]);
  const [subtype, setSubtype] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [power, setPower] = useState("");
  const [toughness, setToughness] = useState("");
  const [loyalty, setLoyalty] = useState("");
  const [abilities, setAbilities] = useState("");
  const [image, setImage] = useState<string | undefined>(undefined);

  const isCreature = typeOption === "Creature Token";
  const isPlaneswalker = typeOption === "Planeswalker Token";

  function toggleColor(c: string) {
    setColors((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" && setImage(reader.result);
    reader.readAsDataURL(file);
  }

  function create() {
    if (!name.trim()) return;
    const base = typeOption.replace(" Token", "");
    const typeLine = subtype.trim() ? `${base} — ${subtype.trim()} Token` : typeOption;
    const card: CardData = {
      id: newId(),
      name: name.trim(),
      mana_cost: "",
      cmc: 0,
      price_usd: null,
      type_line: typeLine,
      oracle_text: abilities.trim(),
      keywords: [],
      colors,
      power: isCreature && power.trim() ? power.trim() : undefined,
      toughness: isCreature && toughness.trim() ? toughness.trim() : undefined,
      loyalty: isPlaneswalker && loyalty.trim() ? loyalty.trim() : undefined,
      image_small: image,
      image_large: image,
    };
    dispatch({ k: "createToken", playerId, card });
    onClose();
  }

  return (
    <div className="inspect-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="inspect-card token-modal">
        <button className="inspect-close" onClick={onClose} aria-label="Close">×</button>
        <div className="inspect-info">
          <h3>Create a token</h3>
          <label className="field">
            <span>Name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Zombie" />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Type</span>
              <select value={typeOption} onChange={(e) => setTypeOption(e.target.value as TypeOption)}>
                {TYPE_OPTIONS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Creature type (optional)</span>
              <input type="text" value={subtype} onChange={(e) => setSubtype(e.target.value)} placeholder="e.g. Soldier" />
            </label>
          </div>

          <div className="field">
            <span>Colors</span>
            <div className="pips">
              {COLOR_KEYS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={"pip" + (colors.includes(c) ? " active" : "")}
                  style={{ background: `var(--mana-${c.toLowerCase()})`, color: `var(--mana-${c.toLowerCase()}-ink)` }}
                  onClick={() => toggleColor(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {isCreature && (
            <div className="field-row">
              <label className="field">
                <span>Power</span>
                <input type="text" inputMode="numeric" value={power} onChange={(e) => setPower(e.target.value)} placeholder="2" />
              </label>
              <label className="field">
                <span>Toughness</span>
                <input type="text" inputMode="numeric" value={toughness} onChange={(e) => setToughness(e.target.value)} placeholder="3" />
              </label>
            </div>
          )}

          {isPlaneswalker && (
            <label className="field">
              <span>Starting loyalty</span>
              <input type="text" inputMode="numeric" value={loyalty} onChange={(e) => setLoyalty(e.target.value)} placeholder="4" />
            </label>
          )}

          <label className="field">
            <span>Abilities (optional)</span>
            <input type="text" value={abilities} onChange={(e) => setAbilities(e.target.value)} placeholder="e.g. Flying, vigilance" />
          </label>
          <label className="field">
            <span>Art (optional — otherwise shows as a plain color tile)</span>
            <input type="file" accept="image/*" onChange={handleFile} />
          </label>
          <button className="btn primary" onClick={create}>Create token</button>
        </div>
      </div>
    </div>
  );
}
