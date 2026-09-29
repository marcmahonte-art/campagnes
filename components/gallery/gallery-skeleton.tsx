/**
 * Squelettes de chargement de la galerie.
 *
 * On garde la forme exacte des cartes à venir : la grille ne saute donc pas au
 * moment où les données arrivent. Un spinner centré ferait disparaître puis
 * réapparaître toute la page.
 *
 * `aria-hidden` : l'attente est annoncée une seule fois par la page, pas une
 * fois par carte — sinon un lecteur d'écran énumérerait douze squelettes.
 */
export function GallerySkeleton({ count = 8 }: { count?: number }) {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-x-5 gap-y-7 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex flex-col">
          <div className="aspect-[4/3] animate-pulse rounded-lg bg-gray-100" />
          <div className="mt-3 flex flex-col gap-2">
            <div className="h-3.5 w-3/4 animate-pulse rounded-pill bg-gray-100" />
            <div className="h-3 w-1/2 animate-pulse rounded-pill bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
