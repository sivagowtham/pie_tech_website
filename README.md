# PIE Tech website redesign

Static redesign of https://www.pietech.edu.in (Pollachi Institute of Engineering and Technology).
Open `index.html` in a browser, or host the folder on any static host.

- **Content:** all 80 pages of the current site are carried over with their original text, links and photos.
- **Photos:** original files from the live site (`images/`). Only the five 16 MB camera photos (`Slide-53…57.JPG`) were
  down-sized to 2400 px wide for web delivery; nothing is redrawn or AI-generated.
- **Colours:** taken from the live site's CSS - sky blue `#3399cc`, orange `#ff9933` / `#ff7838`, navy `#003a6a` / `#004884`, grey `#f3f3f3`.
- **Left out on purpose:** hidden spam links (Parajumpers/Moncler) and a hidden `coinpot.co` crypto-miner iframe found in the live pages' HTML.
- **Rebuild:** `python3 tools/build.py <mirror_dir> .` (needs `beautifulsoup4`, `Pillow`). `<mirror_dir>` holds `pages/*.php` and `img/`
  downloaded from the live site.
- PDFs (brochure, AICTE order, mandatory disclosure, calendars) still link to the live site.
