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
   - **Project name** : `mawaqit-salat` (même nom que dans `worker/wrangler.toml`)
   - **Advanced settings → Path / Root directory** : `/worker`
   - Laisser la commande de déploiement par défaut (`npx wrangler deploy`), puis **Deploy**.
4. Copier l'adresse du serveur affichée à la fin (du type `https://mawaqit-salat.xxxx.workers.dev`).
5. Dans ce dépôt GitHub, modifier `config.json` et coller l'adresse :
   ```json
   { "pushApi": "https://mawaqit-salat.xxxx.workers.dev" }
   ```
6. Sur l'iPhone : ouvrir le lien de l'app dans Safari → Partager → **Ajouter à l'écran d'accueil**. Ouvrir l'app depuis l'icône → Réglages → **تفعيل إشعارات الهاتف**.

Chaque modification du dossier `worker/` sur GitHub redéploie le serveur automatiquement.

## Ajouter l'Athan (quand l'app est ouverte)
- Dans l'app : Réglages → « الأذان » → « اختيار ملف », puis choisir un fichier audio (mp3) sur le téléphone.
- Pour tout le monde : déposer un fichier nommé `adhan.mp3` à côté de `index.html` dans ce dépôt.

Les notifications push utilisent le son du téléphone : iOS ne permet pas à une app web de jouer l'Athan quand elle est fermée.

## Notes
- Maroc : l'app applique GMT (UTC+0) depuis le 20 septembre 2026, même si le téléphone garde l'ancienne règle GMT+1. Le réglage « تصحيح الساعة » corrige d'une heure si besoin.
- Horaires calculés dans le téléphone (et sur le serveur pour les notifications), comparés au calendrier des Habous.
- Le nom de la ville détectée vient de BigDataCloud, la recherche de villes d'Open-Meteo (coordonnées approximatives envoyées).
- Le serveur garde seulement l'abonnement aux notifications, la position choisie et les réglages d'alerte.
- Date hégirienne : calendrier Umm al-Qura, ajustable de ±2 jours pour suivre l'observation du croissant au Maroc.
