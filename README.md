# Quiz gender reveal – Manon & Benjamin

## Lancer en local (soirée ou test)

Prérequis : Node.js 18+ sur le PC branché à la TV, téléphones sur le **même Wi-Fi**.

```bash
npm install
npm start
```

La console affiche les 3 adresses :

- **TV** : `http://<IP-du-PC>:3000/tv` (à ouvrir en plein écran, touche F11)
- **Animateur** : `http://<IP-du-PC>:3000/host?key=romain` (sur le téléphone de Romain)
- **Joueurs** : le QR code affiché sur la TV pointe vers `http://<IP-du-PC>:3000/`

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port HTTP |
| `HOST_KEY` | `romain` | Clé de l'écran animateur |
| `PUBLIC_URL` | IP locale détectée | URL encodée dans le QR code (si l'IP détectée est mauvaise ou si hébergé en ligne) |

Exemple : `PUBLIC_URL=http://192.168.1.42:3000 HOST_KEY=secret npm start`

## Ajouter les questions

Tout se passe dans `questions.js` :

- Partie 1 : `{ id, part: 1, text, choices: [...], answer: <index> }` ; utiliser la constante `QUI` pour les questions « Qui… ? ».
- Partie 2 : `{ id, part: 2, text, left: 'Manon', right: 'Benjamin' }`.
- Finale : `{ id: 62, part: 'final', text: 'Fille ou garçon ?', left: 'Fille', right: 'Garçon' }`.
- Lot du gagnant : champ `prize`.

Redémarrer le serveur après modification.

## Déroulé côté animateur

Le bouton à cliquer est toujours mis en surbrillance. Le chrono se coupe tout seul à 20 s ou quand tous les joueurs ont répondu. « Réinitialiser la partie » efface joueurs et scores (pratique après un test).

## Manon et Benjamin dans la partie 2

1. Manon et Benjamin scannent le QR code comme les invités (avant le début de la partie 2).
2. Sur l'écran animateur, colonne « Rôle » : choisir « Manon » et « Benjamin » pour leurs lignes.

Effets :
- ils ne répondent pas en partie 1 (ils connaissent les réponses) et n'apparaissent pas dans le classement ;
- ils répondent à la partie 2 et à la question finale (Fille ou garçon ?) ;
- leurs votes ne comptent pas dans le % des invités ;
- pendant le chrono, la TV indique s'ils ont répondu ;
- à la révélation (partie 2 et finale), leurs réponses s'affichent une par une sous la jauge, avec un verdict (« D'accord ! » / « Pas d'accord ! » et la position des invités) ;
- le récap affiche leur nombre de réponses communes et combien de fois chacun pense comme les invités.

## Son

- Le son ne sort que de l'écran TV (musique et effets synthétisés, aucun fichier audio).
- Les navigateurs exigent un clic avant de jouer du son : clique une fois sur « Activer le son » en bas à droite de la TV.
- L'écran animateur indique si le son est activé et permet de monter, baisser ou couper le volume à distance.

## Design

- Affiche d'accueil : `public/img/affiche.jpg` (remplace le fichier pour changer d'affiche).
- Décors aquarelle (montgolfières, ballons, étoiles, nuages) découpés dans l'affiche : `public/img/`.
- Polices Kaushan Script + Josefin Sans hébergées en local (`public/fonts/`) : tout fonctionne sans Internet.
- Palette et styles communs : `public/style.css`.

## Bon à savoir

- L'état de la partie est en mémoire : redémarrer le serveur = partie remise à zéro.
- Un joueur qui recharge sa page retrouve sa partie (stocké dans son navigateur).
- Un joueur qui arrive pendant une question joue dès la suivante.
- Hébergement en ligne possible (Render, Railway…, tout hébergeur compatible WebSocket) avec `PUBLIC_URL` renseignée.

## Mise en ligne sur Render

1. Crée un dépôt GitHub (privé conseillé) et envoie-y le contenu du dossier `quiz` (sans `node_modules`).
2. Sur render.com : New > Blueprint, choisis le dépôt. Render lit `render.yaml`.
3. Renseigne `HOST_KEY` (clé secrète de l'écran animateur) quand Render la demande.
4. Une fois déployé :
   - TV : `https://<ton-service>.onrender.com/tv`
   - Animateur : `https://<ton-service>.onrender.com/host?key=<HOST_KEY>`
   - Le QR code pointe automatiquement vers l'adresse Render.

Plan : `starter` (toujours allumé). Le plan `free` marche aussi mais se met en veille après 15 min sans visite
(réveil d'environ 1 min) et un redémarrage efface la partie en cours.
