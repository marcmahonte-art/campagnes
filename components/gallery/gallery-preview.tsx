'use client';

import { useEffect, useRef, useState } from 'react';
import { StaticCanvas } from 'fabric';
import { ImageOff } from 'lucide-react';
import { addBadge } from '@/lib/watermark';

/**
 * Vignette de galerie.
 *
 * Elle ne se contente pas d'afficher `frame.thumbnail_url` : elle compose la
 * vignette **exactement comme le participant la recevra**, badge compris. Le
 * badge est dessiné par `addBadge` — la même fonction que l'aperçu participant
 * et les exports PNG/vidéo. Une vignette peinte autrement finirait par montrer
 * un visuel que la plateforme ne produit pas.
 *
 * Conséquence voulue : une campagne dont le créateur est en formule Free
 * apparaît marquée dans la galerie publique, comme elle le sera dans le fichier
 * téléchargé. C'est la seule mention visible du plan sur cette page.
 *
 * Le cadre est ajusté **dans** la zone fournie, jamais recadré : ce sont des
 * visuels à fond transparent, un `object-fit: cover` les amputerait.
 */

interface GalleryPreviewProps {
  /** Vignette du cadre ; `null` si le cadre n'a pas encore été enregistré. */
  src: string | null;
  alt: string;
  /** Vrai si la formule du créateur impose le badge sur les visuels livrés. */
  watermark: boolean;
  /**
   * Nom de la campagne, affiché quand il n'y a pas de vignette.
   *
   * Un cadre vide n'est pas une erreur d'affichage : c'est une campagne publiée
   * dont le visuel n'a pas été généré. Le titre est alors la seule chose
   * honnête à montrer.
   */
  title?: string;
}

export function GalleryPreview({ src, alt, watermark, title = 'Aperçu indisponible' }: GalleryPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const element = canvasElRef.current;
    if (!host || !element || !src) return;

    let disposed = false;
    let canvas: StaticCanvas | null = null;

    const build = () => {
      void (async () => {
        try {
          const { FabricImage } = await import('fabric');
          const image = await FabricImage.fromURL(src);
          if (disposed) return;

          const naturalWidth = image.width || 1;
          const naturalHeight = image.height || 1;

          // La zone est mesurée sur place : la grille passe de 4 à 3 puis 2
          // colonnes, la vignette suit sans qu'on ait à connaître la mise en page.
          const boxWidth = host.clientWidth || 320;
          const boxHeight = host.clientHeight || 240;
          const scale = Math.min(boxWidth / naturalWidth, boxHeight / naturalHeight);
          const width = Math.max(1, Math.round(naturalWidth * scale));
          const height = Math.max(1, Math.round(naturalHeight * scale));

          canvas = new StaticCanvas(element, { width, height, backgroundColor: 'transparent' });
          image.set({
            left: 0,
            top: 0,
            originX: 'left',
            originY: 'top',
            scaleX: width / naturalWidth,
            scaleY: height / naturalHeight,
            selectable: false,
            evented: false,
          });
          canvas.add(image);

          if (watermark) await addBadge(canvas, width, height);
          if (disposed) return;

          canvas.renderAll();
          setReady(true);
        } catch {
          if (!disposed) setFailed(true);
        }
      })();
    };

    /*
     * Rendu différé : une galerie peut afficher beaucoup de cartes, et chacune
     * ouvre un canvas Fabric plus le décodage de sa vignette. On ne compose donc
     * que ce qui approche de l'écran, avec une marge d'une hauteur d'écran pour
     * que rien n'apparaisse vide pendant le défilement.
     */
    if (typeof IntersectionObserver === 'undefined') {
      build();
      return () => {
        disposed = true;
        void canvas?.dispose();
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        build();
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(host);

    return () => {
      disposed = true;
      observer.disconnect();
      void canvas?.dispose();
    };
  }, [src, watermark]);

  if (!src || failed) {
    /*
     * Pas de vignette : un cadre qui n'a pas encore été enregistré en laisse une.
     * On montre le **titre** plutôt qu'un rectangle vide — c'est la seule chose
     * que l'on sait dire de cette campagne, et une zone grise sans nom ferait
     * croire à une image cassée.
     *
     * Le pas `p-5` de la carte est reproduit ici : le texte doit tomber au même
     * endroit que le visuel qu'il remplace, sinon la ligne bouge quand la
     * vignette arrive.
     */
    return (
      <div className="flex size-full items-center justify-center p-2">
        <div
          aria-hidden
          className="flex size-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 px-3 text-center"
        >
          <ImageOff className="size-4 text-gray-300" />
          <span className="line-clamp-2 text-[12px] font-medium leading-snug text-gray-400">
            {title}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div ref={hostRef} className="flex size-full items-center justify-center">
      <canvas
        ref={canvasElRef}
        role="img"
        aria-label={alt}
        className={ready ? 'opacity-100 transition-opacity duration-200' : 'opacity-0'}
      />
    </div>
  );
}
