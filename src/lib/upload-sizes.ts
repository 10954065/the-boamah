/**
 * Every uploaded picture of a kind is saved at one size, whatever the camera
 * gave. Products keep the whole photo on a white square, so nothing is cut
 * off; the others fill their shape.
 */
export const UPLOAD_SIZES = {
  products: { width: 1000, height: 1000, fit: "contain" },
  categories: { width: 1200, height: 900, fit: "cover" },
  banners: { width: 1600, height: 900, fit: "cover" },
} as const;
