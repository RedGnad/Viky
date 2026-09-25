import { HOME } from "@/src/sentences";
import { PREVIEW_SIZE, previewImage } from "./og/preview";

/**
 * The picture under a link to Viky itself, the landing and every page that names no picture of its own (D265): until
 * now there was none at all. The promise and its sentence, in the layout every link of Viky shares; a gift's link keeps
 * its own picture (app/g/[id]/page.tsx names it).
 */
export const size = PREVIEW_SIZE;
export const contentType = "image/png";
export const alt = HOME.promise;

export default async function Image() {
  return previewImage({ title: HOME.promise, under: HOME.promiseUnder, cacheSeconds: 86400 });
}
