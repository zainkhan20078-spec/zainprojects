"""
Generate high-quality PNG ad creatives for AI-Powered Local Ads Manager
"""
from PIL import Image, ImageDraw, ImageFont
import os

def create_ad_creative(width, height, output_path):
    """
    Create a high-quality PNG ad creative with sophisticated design
    """
    # Create image with sophisticated dark navy gradient
    img = Image.new('RGB', (width, height), color='#0A0E1A')
    draw = ImageDraw.Draw(img)

    # Gradient background (simulated with multiple rectangles)
    for i in range(height):
        alpha = int(255 * (i / height))
        color_r = int(10 + (18 - 10) * (i / height))
        color_g = int(14 + (22 - 14) * (i / height))
        color_b = int(26 + (40 - 26) * (i / height))
        draw.rectangle([(0, i), (width, i+1)], fill=(color_r, color_g, color_b))

    # Decorative circles (subtle lime accents)
    circle_color = (198, 255, 45, 8)  # Very transparent lime
    # Top right circle
    draw.ellipse([width-150, -50, width+50, 100], fill=circle_color)
    # Bottom left circle
    draw.ellipse([-50, height-100, 100, height+50], fill=circle_color)
    # Center circle
    draw.ellipse([width//2-75, height//2-75, width//2+75, height//2+75], fill=circle_color)

    # Accent lines
    line_color = (198, 255, 45, 80)
    draw.line([40, 60, width-40, 60], fill=line_color, width=2)
    draw.line([40, height-60, width-40, height-60], fill=line_color, width=2)

    # Try to use system fonts, fallback to default
    try:
        # Try different font paths for Windows
        font_paths = [
            "C:\\Windows\\Fonts\\arialbd.ttf",
            "C:\\Windows\\Fonts\\arial.ttf",
            "C:\\Windows\\Fonts\\calibrib.ttf",
            "C:\\Windows\\Fonts\\segoeuib.ttf",
        ]
        font_path = None
        for path in font_paths:
            if os.path.exists(path):
                font_path = path
                break

        if font_path:
            headline_font = ImageFont.truetype(font_path, size=int(width * 0.12))
            sub_font = ImageFont.truetype(font_path, size=int(width * 0.035))
            badge_font = ImageFont.truetype(font_path, size=int(width * 0.025))
            cta_font = ImageFont.truetype(font_path, size=int(width * 0.035))
            logo_font = ImageFont.truetype(font_path, size=int(width * 0.025))
        else:
            headline_font = ImageFont.load_default()
            sub_font = ImageFont.load_default()
            badge_font = ImageFont.load_default()
            cta_font = ImageFont.load_default()
            logo_font = ImageFont.load_default()
    except:
        headline_font = ImageFont.load_default()
        sub_font = ImageFont.load_default()
        badge_font = ImageFont.load_default()
        cta_font = ImageFont.load_default()
        logo_font = ImageFont.load_default()

    # Logo
    logo_bg = (255, 255, 255, 25)
    draw.rectangle([30, 30, 110, 60], fill=logo_bg)
    draw.text((40, 40), "AI ADS", fill=(255, 255, 255), font=logo_font)

    # Badge
    badge_bg = (198, 255, 45, 38)
    badge_border = (198, 255, 45, 77)
    draw.rounded_rectangle([width//2-70, 120, width//2+70, 152], radius=20, fill=badge_bg, outline=badge_border, width=2)
    draw.text((width//2-60, 130), "LONDON FIRST", fill=(198, 255, 45), font=badge_font)

    # Headline
    headline_y = 180
    headline_lines = ["London first.", "Your next", "customers next."]
    for line in headline_lines:
        if "customers" in line:
            text_color = (198, 255, 45)  # Lime for emphasis
        else:
            text_color = (255, 255, 255)  # White
        draw.text((width//2, headline_y), line, fill=text_color, font=headline_font, anchor="mm")
        headline_y += int(width * 0.13)

    # Subheadline
    sub_text = "AI-assisted creative, local targeting, and clear weekly reporting for your Facebook and Instagram campaigns."
    sub_y = headline_y + 20
    # Wrap text
    words = sub_text.split()
    lines = []
    current_line = []
    for word in words:
        current_line.append(word)
        test_line = ' '.join(current_line)
        bbox = draw.textbbox((0, 0), test_line, font=sub_font)
        if bbox[2] > width - 80:
            current_line.pop()
            lines.append(' '.join(current_line))
            current_line = [word]
    lines.append(' '.join(current_line))

    for line in lines:
        draw.text((width//2, sub_y), line, fill=(255, 255, 255, 191), font=sub_font, anchor="mm")
        sub_y += int(width * 0.045)

    # CTA Button
    cta_y = sub_y + 30
    cta_width = 200
    cta_height = 56
    cta_x = (width - cta_width) // 2
    draw.rounded_rectangle([cta_x, cta_y, cta_x + cta_width, cta_y + cta_height], radius=12, fill=(198, 255, 45))
    draw.text((width//2, cta_y + cta_height//2 + 5), "BOOK NOW", fill=(10, 14, 26), font=cta_font, anchor="mm")

    # Save as PNG
    img.save(output_path, 'PNG', optimize=True, quality=100)
    print(f"Created: {output_path}")

def main():
    # Create output directory
    output_dir = "C:\\Users\\azkha\\Downloads\\ai-ads-analytics-dashboard\\ads"
    os.makedirs(output_dir, exist_ok=True)

    # Generate 4:5 Feed Ad (800x1000 for high quality)
    create_ad_creative(800, 1000, os.path.join(output_dir, "ad-feed-4x5.png"))

    # Generate 9:16 Stories/Reels Ad (540x960 for high quality)
    create_ad_creative(540, 960, os.path.join(output_dir, "ad-stories-9x16.png"))

    print("\n✓ High-quality PNG ad creatives generated successfully!")
    print(f"✓ Output directory: {output_dir}")
    print("\nGenerated files:")
    print("  - ad-feed-4x5.png (800×1000) - For Facebook/Instagram feeds")
    print("  - ad-stories-9x16.png (540×960) - For Stories/Reels")

if __name__ == "__main__":
    main()
