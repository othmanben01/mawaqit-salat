# مواقيت الصلاة — Mawaqit Salat

Application web de prière, en arabe, installable sur l'écran d'accueil du téléphone.

**En ligne :** https://othmanben01.github.io/mawaqit-salat/

## Fonctions
- Horaires des 5 prières par GPS (avec le quartier), par ville (recherche dans le monde entier) ou par coordonnées
- 15 méthodes de calcul (Maroc — Habous par défaut), Asr joumhour ou hanafite, ajustement manuel en minutes
- Compte à rebours jusqu'à la prochaine prière et horaires du mois
- Suivi des prières : case à cocher par prière, série de jours, 7 derniers jours, compteur de prières à rattraper (qada)
- Nombre de rak'at (sunna avant, fard, sunna après) selon le joumhour
- Boussole Qibla en direct (Android et iPhone)
- Athkar du matin, du soir et après la prière, avec compteur
- Tasbih : 8 dhikr, objectif 33 / 99 / 100 / libre, total du jour et total général
- Calendrier hégirien, jours importants, compte à rebours et imsakiya de Ramadan
- Vendredi : carte de rappel (Al-Kahf, salat 'ala n-Nabi ﷺ, heure de la Joumou'a)
- Notifications push : à l'heure de chaque prière, X minutes avant, athkar, vendredi. Elles arrivent même app fermée.

## Notifications push : mise en place (une seule fois)
Le dossier `worker/` contient un petit serveur gratuit (Cloudflare Workers) qui envoie les notifications.

1. Créer un compte gratuit sur https://dash.cloudflare.com
2. Aller dans **Workers & Pages → Create → Import a repository**, connecter GitHub et choisir `mawaqit-salat`.
3. Réglages du projet :
   - **Project name** : `mawaqit-push` (même nom que dans `worker/wrangler.toml`)
   - **Advanced settings → Path / Root directory** : `/worker`
   - Laisser la commande de déploiement par défaut (`npx wrangler deploy`), puis **Deploy**.
4. Copier l'adresse du serveur affichée à la fin (du type `https://mawaqit-push.xxxx.workers.dev`).
5. Dans ce dépôt GitHub, modifier `config.json` et coller l'adresse :
   ```json
   { "pushApi": "https://mawaqit-push.xxxx.workers.dev" }
   ```
6. Sur l'iPhone : ouvrir le lien de l'app dans Safari → Partager → **Ajouter à l'écran d'accueil**. Ouvrir l'app depuis l'icône → Réglages → **تفعيل إشعارات الهاتف**.

Chaque modification du dossier `worker/` sur GitHub redéploie le serveur automatiquement.

## Athan (quand l'app est ouverte)
Réglages → « الأذان » : 6 enregistrements au choix, écoute en touchant la ligne, ou « إضافة ملف من هاتفي » pour ton propre fichier.

| Fichier | Enregistrement | Auteur / source | Licence |
|---|---|---|---|
| `sounds/adhan-makkah.mp3` | Adhan, Great Mosque of Mecca (21 Jan 2013) | Seyfula Islam, Wikimedia Commons | CC BY 3.0 |
| `sounds/adhan-madinah.mp3` | Call to prayer from the Prophet's Mosque | ejaz215, Freesound / Wikimedia Commons | CC BY 3.0 |
| `sounds/adhan-marrakech.mp3` | Call to Prayer – Marrakech | brightonmatt2, Freesound | CC0 |
| `sounds/adhan-calm.mp3` | Beautiful adhan | Adam-synagda, Wikimedia Commons | CC0 |
| `sounds/adhan-short.mp3` | The Adhan – Aaqib Azeez | Atcovi, Wikimedia Commons | CC BY-SA 4.0 |
| `sounds/adhan-tarteel.mp3` | الأذان (Call to Prayer) | sonically_sound, Freesound | CC0 |

Fichiers convertis en MP3 mono 96 kb/s avec volume normalisé (repris des projets libres `geda22012/noor` et `marwan313/marsathan-adhan`). Les versions adaptées restent sous la licence d'origine.

### Extraits de 30 secondes (sonnerie iPhone)
`sounds/30s/` contient un extrait de chaque Athan (18 à 30 s, coupé sur une pause naturelle, fondu en fin), à transformer en sonnerie avec GarageBand puis à choisir dans Réglages → Sons et vibrations → Alertes par défaut. Mêmes auteurs et licences que les fichiers complets.

Les notifications push utilisent le son du téléphone : iOS ne permet pas à une app web de jouer l'Athan quand elle est fermée.

## Notes
- Maroc : l'app applique GMT (UTC+0) depuis le 20 septembre 2026, même si le téléphone garde l'ancienne règle GMT+1. Le réglage « تصحيح الساعة » corrige d'une heure si besoin.
- Horaires calculés dans le téléphone (et sur le serveur pour les notifications), comparés au calendrier des Habous.
- Le nom de la ville détectée vient de BigDataCloud, la recherche de villes d'Open-Meteo (coordonnées approximatives envoyées).
- Le serveur garde seulement l'abonnement aux notifications, la position choisie et les réglages d'alerte.
- Date hégirienne : calendrier Umm al-Qura, ajustable de ±2 jours pour suivre l'observation du croissant au Maroc.
