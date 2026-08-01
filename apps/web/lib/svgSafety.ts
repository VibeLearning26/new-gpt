const ALLOWED_ELEMENTS = new Set([
  "svg", "g", "defs", "title", "desc", "metadata",
  "path", "line", "polyline", "polygon", "rect", "circle", "ellipse",
  "text", "tspan", "textpath", "marker", "pattern", "clippath", "mask",
  "lineargradient", "radialgradient", "stop", "use", "image",
]);

const URL_ATTRIBUTE_NAMES = new Set(["href", "xlink:href", "src"]);
const UNSAFE_STYLE = /(?:javascript\s*:|expression\s*\(|@import|url\s*\(\s*['"]?\s*(?:https?:|\/\/))/i;

export class UnsafeSvgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeSvgError";
  }
}

function isSafeResource(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith("#") ||
    /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/.test(normalized)
  );
}

/** Sanitize generated SVG before it is converted to an isolated image URL. */
export function sanitizeSvg(source: string): string {
  if (!source.trim() || source.length > 2_000_000) {
    throw new UnsafeSvgError("The drawing output is empty or too large.");
  }
  if (typeof DOMParser === "undefined") {
    throw new UnsafeSvgError("SVG validation is unavailable in this browser.");
  }

  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  if (document.querySelector("parsererror") || document.documentElement.localName !== "svg") {
    throw new UnsafeSvgError("The drawing service returned malformed SVG.");
  }

  for (const element of Array.from(document.querySelectorAll("*"))) {
    const tag = element.localName.toLowerCase();
    if (!ALLOWED_ELEMENTS.has(tag)) {
      element.remove();
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
      } else if (URL_ATTRIBUTE_NAMES.has(name) && !isSafeResource(value)) {
        element.removeAttribute(attribute.name);
      } else if (name === "style" && UNSAFE_STYLE.test(value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  const sanitized = new XMLSerializer().serializeToString(document.documentElement);
  if (!sanitized.includes("<svg")) {
    throw new UnsafeSvgError("The drawing could not be validated.");
  }
  return sanitized;
}

export function svgObjectUrl(source: string): { url: string; sanitized: string } {
  const sanitized = sanitizeSvg(source);
  return {
    sanitized,
    url: URL.createObjectURL(new Blob([sanitized], { type: "image/svg+xml;charset=utf-8" })),
  };
}
