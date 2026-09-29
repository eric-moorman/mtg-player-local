import { useState } from "react";
import { newId } from "../../lib/reducer";
import type { CardData, GameAction } from "../../lib/types";

interface Props {
  playerId: string;
  dispatch: (a: GameAction) => void;
  onClose: () => void;
}

const TYPE_OPTIONS = ["Creature Token", "Artifact Token", "Land Token", "Planeswalker Token"];

export default function TokenModal({ playerId, dispatch, onClose }: Props) {
  const [name, setName] = useState("");
  const [typeLine, setTypeLine] = useState(TYPE_OPTIONS[0]);
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | undefined>(undefined);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" && setImage(reader.result);
    reader.readAsDataURL(file);
  }

  function create() {
    if (!name.trim()) return;
    const card: CardData = {
      id: newId(),
      name: name.trim(),
      mana_cost: "",
      cmc: 0,
      price_usd: null,
      type_line: typeLine,
      oracle_text: text,
      keywords: [],
      colors: [],
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
          <label className="field">
            <span>Type</span>
            <select value={typeLine} onChange={(e) => setTypeLine(e.target.value)}>
              {TYPE_OPTIONS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Description (optional)</span>
            <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="2/2 black Zombie" />
          </label>
          <label className="field">
            <span>Art (optional)</span>
            <input type="file" accept="image/*" onChange={handleFile} />
          </label>
          <button className="btn primary" onClick={create}>Create token</button>
        </div>
      </div>
    </div>
  );
}
