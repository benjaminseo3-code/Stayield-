/** A photo with a WebP source and JPEG fallback. Served through the access-checked photo route. */
export function Photo({
  id,
  alt,
  variant = "thumb",
  className,
  eager = false,
}: {
  id: string;
  alt: string;
  variant?: "thumb" | "full";
  className?: string;
  eager?: boolean;
}) {
  const webp = `/api/photos/${id}/${variant === "thumb" ? "thumb.webp" : "full.webp"}`;
  const jpg = `/api/photos/${id}/full.jpg`;
  return (
    <picture>
      <source type="image/webp" srcSet={webp} />
      <img src={jpg} alt={alt} className={className} loading={eager ? "eager" : "lazy"} decoding="async" />
    </picture>
  );
}
