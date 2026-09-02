// TIA-598-C fiber optic color code: 12 colors, used both for numbering tubes
// and for numbering cores within a tube. A cable with more than 12 fibers
// just repeats the sequence for the next tube.
export const FIBER_COLORS: { name: string; hex: string }[] = [
  { name: 'Biru', hex: '#2563eb' },
  { name: 'Jingga', hex: '#f97316' },
  { name: 'Hijau', hex: '#16a34a' },
  { name: 'Coklat', hex: '#92400e' },
  { name: 'Abu-abu', hex: '#6b7280' },
  { name: 'Putih', hex: '#e5e7eb' },
  { name: 'Merah', hex: '#dc2626' },
  { name: 'Hitam', hex: '#111827' },
  { name: 'Kuning', hex: '#eab308' },
  { name: 'Ungu', hex: '#7c3aed' },
  { name: 'Merah Muda', hex: '#ec4899' },
  { name: 'Aqua', hex: '#06b6d4' },
];

export interface CoreColorInfo {
  tubeNumber: number;
  tubeColor: string;
  tubeColorHex: string;
  positionInTube: number;
  coreColor: string;
  coreColorHex: string;
}

// 1-based core number -> its TIA-598-C tube + core color, given how many
// fibers this cable groups per tube (industry standard is 12).
export function coreColorInfo(coreNumber: number, fibersPerTube: number = 12): CoreColorInfo {
  const perTube = fibersPerTube > 0 ? fibersPerTube : 12;
  const idx = Math.max(0, (coreNumber || 1) - 1);
  const tubeNumber = Math.floor(idx / perTube) + 1;
  const positionInTube = (idx % perTube) + 1;
  const tube = FIBER_COLORS[(tubeNumber - 1) % 12];
  const core = FIBER_COLORS[(positionInTube - 1) % 12];
  return {
    tubeNumber,
    tubeColor: tube.name,
    tubeColorHex: tube.hex,
    positionInTube,
    coreColor: core.name,
    coreColorHex: core.hex,
  };
}
