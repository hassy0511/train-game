from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[2]
SOURCES = [
    (
        "APPROVED STYLE KEY",
        ROOT / "assets/concepts/character-deformation-c-strong.png",
        (500, 220, 890, 870),
    ),
    (
        "APPROVED TURNAROUND",
        ROOT / "assets/concepts/character-turnaround-c-piko.png",
        (15, 40, 535, 955),
    ),
    (
        "LATEST 3D / GLB",
        ROOT / "assets/previews/partner.png",
        (90, 0, 570, 685),
    ),
]


def load_fonts() -> tuple[ImageFont.ImageFont, ImageFont.ImageFont, ImageFont.ImageFont]:
    try:
        return (
            ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 32),
            ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 22),
            ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 18),
        )
    except OSError:
        fallback = ImageFont.load_default()
        return fallback, fallback, fallback


def render() -> Path:
    canvas = Image.new("RGB", (1800, 900), "#ECE7DD")
    draw = ImageDraw.Draw(canvas)
    title_font, label_font, note_font = load_fonts()
    draw.text(
        (60, 25),
        "PIKO — APPROVED 2D TO PRODUCTION 3D",
        fill="#2D251F",
        font=title_font,
    )
    draw.text(
        (60, 67),
        "Strong deformation level · 0.70 m · front silhouette comparison",
        fill="#665F57",
        font=note_font,
    )

    card_width = 520
    card_height = 750
    gap = 35
    left = 65
    top = 120
    for index, (label, path, crop_box) in enumerate(SOURCES):
        x = left + index * (card_width + gap)
        shadow = Image.new("RGBA", (card_width + 24, card_height + 24), (0, 0, 0, 0))
        shadow_draw = ImageDraw.Draw(shadow)
        shadow_draw.rounded_rectangle(
            (12, 12, card_width + 12, card_height + 12),
            radius=24,
            fill=(45, 37, 31, 40),
        )
        shadow = shadow.filter(ImageFilter.GaussianBlur(10))
        canvas.paste(shadow, (x - 12, top - 4), shadow)
        draw.rounded_rectangle(
            (x, top, x + card_width, top + card_height),
            radius=22,
            fill="#F8F5EF",
        )

        source = Image.open(path).convert("RGB").crop(crop_box)
        fitted = ImageOps.contain(
            source,
            (card_width - 48, card_height - 96),
            Image.Resampling.LANCZOS,
        )
        paste_x = x + (card_width - fitted.width) // 2
        paste_y = top + 62 + (card_height - 82 - fitted.height) // 2
        canvas.paste(fitted, (paste_x, paste_y))

        text_box = draw.textbbox((0, 0), label, font=label_font)
        label_width = text_box[2] - text_box[0]
        draw.text(
            (x + (card_width - label_width) // 2, top + 20),
            label,
            fill="#2D251F",
            font=label_font,
        )

    output = ROOT / "assets/previews/partner-reference-comparison.png"
    canvas.save(output, optimize=True)
    return output


if __name__ == "__main__":
    print(render())
