import type { SkyPupVisualAssets } from "./types";

const ASSET_PATHS = {
  background: "/games/sky-pup/sky-pup-cotton-world.webp",
  player: "/games/sky-pup/sky-pup-hero.png"
} as const;

let assetsPromise: Promise<SkyPupVisualAssets> | null = null;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load game image: ${src}`));
    image.src = src;
  });
}

export function loadSkyPupVisualAssets(): Promise<SkyPupVisualAssets> {
  if (assetsPromise) return assetsPromise;

  assetsPromise = Promise.allSettled([
    loadImage(ASSET_PATHS.background),
    loadImage(ASSET_PATHS.player)
  ]).then(([background, player]) => ({
    ...(background.status === "fulfilled" ? { background: background.value } : {}),
    ...(player.status === "fulfilled" ? { player: player.value } : {})
  }));

  return assetsPromise;
}
