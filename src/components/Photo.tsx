/**
 * A listing photo. "blur" is the only variant that exists for viewers without access: a ~32px
 * blurred image that is scaled up and softened by CSS. Sharp variants are served only to viewers
 * who may see the listing in full (enforced by the photo route, not by this component).
 */
export function Photo({
  id,
  alt,
  variant = "thumb",
  className,
  eager = false,
}: {
  id: string;
  alt: string;
  variant?: "thumb" | "full" | "blur";
  className?: string;
  eager?: boolean;
}) {
  if (variant === "blur") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/photos/${id}/blur.webp`} alt="" aria-hidden="true" className={`blurred-photo${className ? ` ${className}` : ""}`} loading={eager ? "eager" : "lazy"} decoding="async" />
    );
  }
  const webp = `/api/photos/${id}/${variant === "thumb" ? "thumb.webp" : "full.webp"}`;
  const jpg = `/api/photos/${id}/full.jpg`;
  return (
    <picture>
      <source type="image/webp" srcSet={webp} />
      <img src={jpg} alt={alt} className={className} loading={eager ? "eager" : "lazy"} decoding="async" />
    </picture>
  );
}
