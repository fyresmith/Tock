#!/usr/bin/env python3
"""
Generate a squircle-masked app icon from tock-logo.jpg.
Uses a superellipse (n=5) to approximate the macOS/iOS continuous squircle shape.
"""

from PIL import Image, ImageDraw, ImageFilter
import math

SIZE = 1024
PADDING = 0  # no padding, let the squircle fill the canvas

def make_squircle_mask(size, n=5.0):
    """
    Create a squircle mask using the superellipse formula:
    |x/a|^n + |y/b|^n <= 1
    with a slight inset so edges are fully inside the canvas.
    """
    mask = Image.new("L", (size, size), 0)
    pixels = mask.load()

    # Small inset so the edge anti-aliasing doesn't clip hard
    inset = size * 0.01
    a = (size / 2) - inset
    b = (size / 2) - inset

    for y in range(size):
        for x in range(size):
            nx = (x - size / 2) / a
            ny = (y - size / 2) / b
            val = abs(nx) ** n + abs(ny) ** n
            if val < 1.0:
                pixels[x, y] = 255
            elif val < 1.05:
                # Anti-alias the edge
                t = (val - 1.0) / 0.05
                pixels[x, y] = int(255 * (1.0 - t))

    return mask

def main():
    src = Image.open("tock-logo.jpg").convert("RGBA")

    # Crop to square (center crop)
    w, h = src.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    src = src.crop((left, top, left + side, top + side))

    # Resize to target
    src = src.resize((SIZE, SIZE), Image.LANCZOS)

    # Generate squircle mask
    print(f"Generating {SIZE}x{SIZE} squircle mask (this may take a moment)...")
    mask = make_squircle_mask(SIZE, n=5.0)

    # Slightly blur mask for smoother edges
    mask = mask.filter(ImageFilter.GaussianBlur(radius=0.5))

    # Apply mask as alpha channel
    src.putalpha(mask)

    out_path = "app-icon.png"
    src.save(out_path, "PNG")
    print(f"Saved: {out_path}")

if __name__ == "__main__":
    main()
