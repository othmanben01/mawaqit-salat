# مواقيت الصلاة — Mawaqit Salat

Application web de prière, en arabe, dans un seul fichier `index.html`.

**En ligne :** https://othmanben01.github.io/mawaqit-salat/

## Fonctions
- Horaires des 5 prières par GPS, par ville (75 villes) ou par coordonnées
- 15 méthodes de calcul (Maroc — Habous par défaut), Asr joumhour ou hanafite, ajustement manuel en minutes
- Compte à rebours jusqu'à la prochaine prière et horaires du mois
- Nombre de rak'at (sunna avant, fard, sunna après) selon le joumhour
- Boussole Qibla en direct (Android et iPhone)
- Athkar du matin, du soir et après la prière, avec compteur
- Alertes à l'heure de la prière tant que l'app est ouverte : Athan, son simple ou silencieux

## Ajouter l'Athan
Deux façons :
- Dans l'app : Réglages → Son de l'alerte → « الأذان » → « اختيار ملف », puis choisir un fichier audio (mp3) depuis le téléphone. Il est gardé dans le navigateur.
- Pour tout le monde : déposer un fichier nommé `adhan.mp3` à côté de `index.html` dans ce dépôt. L'app l'utilise automatiquement.

## Installer sur le téléphone
Ouvrir le lien, puis « Ajouter à l'écran d'accueil ».

## Notes
- Maroc : l'app applique GMT (UTC+0) depuis le 20 septembre 2026, même si le téléphone garde l'ancienne règle GMT+1. Un réglage « تصحيح الساعة » permet de corriger d'une heure si besoin.
- Calcul astronomique fait dans le navigateur, sans serveur.
- Le nom de la ville détectée vient de BigDataCloud (coordonnées approximatives envoyées).
- Les horaires peuvent varier d'une minute ou deux par rapport au calendrier officiel : ajuster dans Réglages.
