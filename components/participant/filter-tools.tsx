import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

/**
 * Outils de filtre simples pour la page participant.
 * Pour l'instant c'est un placeholder qui propose « none », « blur », « grayscale ».
 * Le composant reçoit le filtre courant et une fonction de mise à jour.
 */
export function FilterTools({ filter, setFilter }: { filter: string; setFilter: (value: string) => void }) {
  const options = [
    { value: 'none', label: 'Aucun filtre' },
    { value: 'blur', label: 'Flou' },
    { value: 'grayscale', label: 'Niveaux de gris' },
  ];

  return (
    <div className="border-b border-gray-200 bg-gray-50 py-3">
      <div className="container-shell flex items-center gap-2">
        <Label className="text-sm font-medium text-gray-700">Filtre</Label>
        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-48"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
