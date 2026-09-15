import s from "./ArenaPaletteStudy.module.css";

const palettes = {
  a: {
    name: "Espresso & Clay",
    canvas: "#E8DED2",
    surface: "#FFFCF7",
    ink: "#3D281F",
    border: "#CDBCAE",
    hues: [
      { name: "Espresso", shades: ["#EFE4D9", "#B99A80", "#4B3024"] },
      { name: "Clay", shades: ["#F9E7D8", "#DA986B", "#A34E25"] },
      { name: "Olive", shades: ["#EEF0E2", "#A8AF85", "#586244"] },
      { name: "Slate Blue", shades: ["#E6EDF1", "#9FAFBA", "#4E6574"] },
    ],
  },
  b: {
    name: "Cocoa & Apricot",
    canvas: "#E9DCD0",
    surface: "#FFFAF4",
    ink: "#472D23",
    border: "#CFB9A6",
    hues: [
      { name: "Cocoa", shades: ["#F0E2D5", "#B98E72", "#573828"] },
      { name: "Apricot", shades: ["#FBE8D6", "#E3AB7D", "#A14D26"] },
      { name: "Dusty Rose", shades: ["#F5E8E5", "#CBA8A0", "#8B5A55"] },
      { name: "Soft Gold", shades: ["#F5EDD8", "#D5BC81", "#80632E"] },
    ],
  },
  c: {
    name: "Orange & Brown",
    canvas: "#FFFFFF",
    surface: "#FFFFFF",
    ink: "#3F2B22",
    border: "#EBDDD2",
    hues: [
      { name: "Espresso", shades: ["#F5EBE3", "#AE8468", "#4E2F20"] },
      { name: "Orange", shades: ["#FFE5CF", "#EF853F", "#BD4A19"] },
      { name: "Cocoa", shades: ["#F0DDCE", "#BA855D", "#7A4B35"] },
      { name: "Amber", shades: ["#FFF0CC", "#E1B04F", "#A46312"] },
    ],
  },
};

const tones = ["light", "mid", "deep"] as const;

export default function ArenaPaletteStudy({ design }: { design: "a" | "b" | "c" }) {
  const palette = palettes[design];

  return (
    <details className={s.study} data-arena-design={design}>
      <summary className={s.summary}>Colour study · Light / Mid / Deep</summary>
      <div className={s.content}>
        <table className={s.shadeTable}>
          <caption className={s.visuallyHidden}>{palette.name} colour shades</caption>
          <thead>
            <tr>
              <th scope="col">Colour</th>
              <th scope="col">Light</th>
              <th scope="col">Mid</th>
              <th scope="col">Deep</th>
            </tr>
          </thead>
          <tbody>
            {palette.hues.map((hue, hueIndex) => (
              <tr key={hue.name}>
                <th scope="row">{hue.name}</th>
                {hue.shades.map((hex, toneIndex) => (
                  <td key={hex}>
                    <span
                      className={s.swatch}
                      style={{ backgroundColor: `rgb(var(--arena-hue${hueIndex}-${tones[toneIndex]}))` }}
                      aria-hidden="true"
                    />
                    <span className={s.hex}>{hex}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <dl className={s.roles}>
          <dt>Light</dt><dd>Small icon panels and quiet highlights</dd>
          <dt>Mid</dt><dd>Small accents and selected borders</dd>
          <dt>Deep</dt><dd>{design === "c" ? "Espresso text; orange actions; cocoa and amber ranking accents" : "Brown text; burnt orange actions; restrained supporting hues"}</dd>
          <dt>Page</dt><dd>{palette.canvas} · {design === "c" ? "white canvas" : "warm canvas"}</dd>
          <dt>Card</dt><dd>{palette.surface} · {design === "c" ? "white surface" : "ivory surface"}</dd>
          <dt>Ink</dt><dd>{palette.ink} · deep brown</dd>
          <dt>Edge</dt><dd>{palette.border} · {design === "c" ? "warm sand divider" : "visible warm border"}</dd>
        </dl>
        <div className={s.references}>
          <p>{design === "c" ? "White, orange and brown revision · combines the two approved layouts. Earlier palette references below." : "Pinterest references · original Revenue shades adapted from brown, orange and off-white studies"}</p>
          <div className={s.links}>
            <a href="https://uk.pinterest.com/pin/120682465013311762/" target="_blank" rel="noreferrer">Brown, orange &amp; off-white</a>
            <a href="https://in.pinterest.com/pin/sunset-dunes-colour-palette-in-orange-and-brown--609885974561005108/" target="_blank" rel="noreferrer">Sunset Dunes palette</a>
            <a href="https://ca.pinterest.com/pin/corona-mobile-app-design-ios-health-hex-colors--816699713665427298/" target="_blank" rel="noreferrer">Mobile UI colour study</a>
          </div>
        </div>
      </div>
    </details>
  );
}
