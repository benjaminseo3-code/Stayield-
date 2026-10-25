/** Generates public/brand/og.png (1200x630). Run: pnpm tsx scripts/make-og.ts */
import sharp from "sharp";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#0B1C30"/>
<circle cx="1050" cy="80" r="260" fill="#17B77F" opacity="0.14"/>
<rect x="80" y="90" width="84" height="84" rx="24" fill="#12304f"/>
<path d="M101 140 122 120l21 20" fill="none" stroke="#17B77F" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M111 138v22h22v-22" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>
<text x="190" y="150" font-family="Georgia, serif" font-weight="700" font-size="64" fill="#fff">Stayield</text>
<text x="80" y="340" font-family="Georgia, serif" font-weight="700" font-size="70" fill="#fff">Apartments with income</text>
<text x="80" y="425" font-family="Georgia, serif" font-weight="700" font-size="70" fill="#fff">you can verify</text>
<text x="80" y="520" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#7ff0c3">Verified short-term-rental income reports</text>
</svg>`;

sharp(Buffer.from(svg))
  .png()
  .toFile("public/brand/og.png")
  .then(() => console.log("ok"));
