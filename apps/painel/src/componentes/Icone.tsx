// Ícones Material Design (mesma fonte do app do técnico), servidos de /fonts/mdi.ttf.
const GLIFOS = {
  "monitor-dashboard": 985607, "clipboard-text-outline": 985656, "map-marker-radius-outline": 987900, "calendar-month-outline": 986648,
  "account-group-outline": 985944, "package-variant": 984022, "map-outline": 985474, binoculars: 983205, "chart-box-outline": 988494,
  "chart-line": 983338, "clock-outline": 983376, "car-outline": 988397, "cash-multiple": 983318, "format-list-bulleted": 983673,
  warehouse: 987009, "toolbox-outline": 985517, "cog-outline": 985275, "lan-connect": 983832, menu: 983900, logout: 983875,
  magnify: 983881, "map-marker-distance": 985328, "chart-bell-curve": 986192, "bell-outline": 983196, "chevron-left": 983361, domain: 983511,
} as const;
export type NomeIcone = keyof typeof GLIFOS;

export default function Icone({ nome, tamanho = 18, className = "" }: { nome: NomeIcone; tamanho?: number; className?: string }) {
  return (
    <span aria-hidden className={`inline-block shrink-0 leading-none ${className}`} style={{ fontFamily: "mdi", fontSize: tamanho }}>
      {String.fromCodePoint(GLIFOS[nome])}
    </span>
  );
}
