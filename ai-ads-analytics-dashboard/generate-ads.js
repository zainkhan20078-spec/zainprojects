/**
 * Generate high-quality PNG ad creatives for AI-Powered Local Ads Manager
 * Using Node.js Canvas library
 */

const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

async function createAdCreative(width, height, outputPath) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Gradient background (sophisticated dark navy)
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#0A0E1A');
    gradient.addColorStop(0.5, '#121628');
    gradient.addColorStop(1, '#0A0E1A');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Decorative circles (subtle lime accents)
    ctx.fillStyle = 'rgba(198, 255, 45, 0.03)';
    ctx.beginPath();
    ctx.arc(width - 75, 25, 100, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(25, height - 50, 75, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 75, 0, Math.PI * 2);
    ctx.fill();

    // Accent lines
    ctx.strokeStyle = 'rgba(198, 255, 45, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 60);
    ctx.lineTo(width - 40, 60);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(40, height - 60);
    ctx.lineTo(width - 40, height - 60);
    ctx.stroke();

    // Logo
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(30, 30, 80, 30);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px Inter, Arial, sans-serif';
    ctx.fillText('AI ADS', 40, 50);

    // Badge
    const badgeWidth = 140;
    const badgeHeight = 32;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = 120;

    ctx.fillStyle = 'rgba(198, 255, 45, 0.15)';
    ctx.strokeStyle = 'rgba(198, 255, 45, 0.3)';
    ctx.lineWidth = 2;
    roundRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#C6FF2D';
    ctx.font = 'bold 12px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LONDON FIRST', width / 2, badgeY + 21);

    // Headline
    ctx.textAlign = 'center';
    const headlineSize = Math.floor(width * 0.12);
    ctx.font = `900 ${headlineSize}px Inter, Arial, sans-serif`;

    let headlineY = 180;
    const headlines = ['London first.', 'Your next', 'customers next.'];

    headlines.forEach(line => {
        if (line.includes('customers')) {
            ctx.fillStyle = '#C6FF2D'; // Lime for emphasis
        } else {
            ctx.fillStyle = '#FFFFFF'; // White
        }
        ctx.fillText(line, width / 2, headlineY);
        headlineY += headlineSize * 1.1;
    });

    // Subheadline
    const subSize = Math.floor(width * 0.035);
    ctx.font = `500 ${subSize}px Inter, Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';

    const subText = 'AI-assisted creative, local targeting, and clear weekly reporting for your Facebook and Instagram campaigns.';
    const words = subText.split(' ');
    let lines = [];
    let currentLine = '';

    words.forEach(word => {
        const testLine = currentLine + word + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > width - 80) {
            lines.push(currentLine.trim());
            currentLine = word + ' ';
        } else {
            currentLine = testLine;
        }
    });
    lines.push(currentLine.trim());

    let subY = headlineY + 30;
    lines.forEach(line => {
        ctx.fillText(line, width / 2, subY);
        subY += subSize * 1.4;
    });

    // CTA Button
    const ctaWidth = 200;
    const ctaHeight = 56;
    const ctaX = (width - ctaWidth) / 2;
    const ctaY = subY + 30;

    ctx.fillStyle = '#C6FF2D';
    roundRect(ctx, ctaX, ctaY, ctaWidth, ctaHeight, 12);
    ctx.fill();

    ctx.fillStyle = '#0A0E1A';
    ctx.font = `800 ${Math.floor(width * 0.035)}px Inter, Arial, sans-serif`;
    ctx.fillText('BOOK NOW', width / 2, ctaY + 36);

    // Save as PNG
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    console.log(`Created: ${outputPath}`);
}

function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

async function main() {
    const outputDir = path.join(__dirname, 'ads');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    // Generate 4:5 Feed Ad (800x1000 for high quality)
    await createAdCreative(800, 1000, path.join(outputDir, 'ad-feed-4x5.png'));

    // Generate 9:16 Stories/Reels Ad (540x960 for high quality)
    await createAdCreative(540, 960, path.join(outputDir, 'ad-stories-9x16.png'));

    console.log('\n✓ High-quality PNG ad creatives generated successfully!');
    console.log(`✓ Output directory: ${outputDir}`);
    console.log('\nGenerated files:');
    console.log('  - ad-feed-4x5.png (800×1000) - For Facebook/Instagram feeds');
    console.log('  - ad-stories-9x16.png (540×960) - For Stories/Reels');
}

main().catch(console.error);
