# P-t-stutka

[frontend-README.md](https://github.com/user-attachments/files/25610714/frontend-README.md)
# PäätösTutka — Frontend

Kokkolan kaupungin päätösdatan visualisointi.

## Tiedostorakenne

```
index.html   — Rakenne ja sisältö
styles.css   — Kaikki tyylit
app.js       — Logiikka ja API-kutsut
```

## Teknologiat

- Vanilla HTML/CSS/JS — ei build-vaihetta
- Google Fonts (DM Mono, DM Serif Display, Syne)
- Tilastokeskus PxWeb API (väestö, työttömyys)
- Kaupunki Backend API (päätökset, kokoukset, uutiset)

## Kehitys

Avaa `index.html` selaimessa suoraan tai käytä paikallista palvelinta:

```bash
npx serve .
# tai
python3 -m http.server 8080
```

## Deployment

GitHub Pages — push `main`-haaraan → automaattinen deploy.
