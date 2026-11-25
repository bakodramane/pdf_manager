# PDF Manager

**Un éditeur de PDF libre et gratuit qui fonctionne entièrement sur votre
appareil — en français et en anglais.** Sans compte, sans envoi de fichiers,
sans pistage.

*[Read in English](README.md)*

Créé par **[Dramane Bako](https://github.com/bakodramane)** · licence
Apache-2.0 · pour les élèves, enseignants, chercheurs, administrations, ONG
et petites entreprises, y compris avec une connexion lente ou coûteuse.

## L'obtenir

| Version | Pour | Remarques |
|---|---|---|
| **Installateur Windows** (`…-Setup.exe`) | Windows 10/11 x64 | Installation pour l'utilisateur courant, **sans droits d'administrateur**, assistant en français ou en anglais |
| **Windows portable** (`…-portable.exe`) | Windows 10/11 x64 | Sans installation ; se lance depuis n'importe quel dossier |
| **Version web** | Tout navigateur récent | Rien à installer ; fonctionne hors ligne après la première visite |

Téléchargez uniquement depuis la page
[GitHub Releases](https://github.com/bakodramane/pdf_manager/releases) du
projet et vérifiez le fichier avec `SHA256SUMS.txt`
([procédure, en anglais](docs/release/verify.md)) :

```powershell
Get-FileHash ".\PDF Manager-0.2.0-beta.1-Setup.exe" -Algorithm SHA256
```

> **État actuel :** la version 0.2.0 est en préparation. Les exécutables
> Windows **ne sont pas encore signés** ; les fichiers de préversion sont
> nommés `…-UNSIGNED.exe` et Windows SmartScreen affichera un avertissement.
> Si votre organisation bloque les logiciels non signés, attendez une
> version signée ou utilisez la version web.

## Ce qu'il fait

- **Organiser les pages** — ouvrir, fusionner, découper, extraire, insérer,
  supprimer, faire pivoter, réordonner, dupliquer, ajouter des pages
  blanches, transformer des images en pages.
- **Lire et annoter** — zoom, sélection de texte, ajout de texte et
  d'images de signature (avec suppression du fond), remplissage de
  formulaires PDF.
- **Reconnaître le texte (OCR)** — rendre les pages numérisées consultables
  et copiables, en français, en anglais ou les deux, **hors ligne** ;
  enregistrer le texte, un PDF consultable, ou un fichier Word/Excel
  approximatif.
- **Compresser** — sans perte, équilibré ou fort (réduit les numérisations
  et photos).
- **Convertir** — PDF vers Word (.docx) ou Excel (.xlsx) ; pages en PNG/JPEG.
- **Marquer** — numéros de page et filigranes texte.
- **Annuler / rétablir** chaque modification ; raccourcis clavier.

### Confidentialité

Vos documents sont traités sur votre ordinateur ou dans l'onglet de votre
navigateur. Ils ne sont jamais envoyés. L'application de bureau bloque tout
accès réseau ; la version web ne télécharge que ses propres fichiers. Ni
statistiques, ni publicité, ni rapports d'erreur, ni vérification
automatique des mises à jour. Détails : [PRIVACY.md](PRIVACY.md).

### Bon à savoir (limites)

- **Une signature visuelle n'est pas une signature numérique.** Placer
  l'image d'une signature ne signe pas le PDF de façon cryptographique. Un
  PDF déjà signé numériquement perd la validité de sa signature dans tout
  fichier exporté (un avertissement s'affiche).
- **Pas encore de protection par mot de passe ni de caviardage** : un
  rectangle noir sur du texte ne le supprime pas, c'est pourquoi PDF Manager
  ne le propose pas comme « caviardage ». Les PDF chiffrés ne peuvent pas
  être modifiés.
- **L'OCR** donne les meilleurs résultats sur du texte imprimé, net et à
  l'endroit ; la confiance est une estimation : vérifiez noms, nombres et
  dates. L'écriture manuscrite n'est pas prise en charge.
- **La conversion Word/Excel est approximative.**
- **Un filigrane** marque un document, il ne le protège pas.
- Les PDF exportés sont reconstruits page par page : les signets et
  balises d'accessibilité de l'original ne sont pas conservés.

## Guide rapide

### Pages
Glissez des PDF dans la fenêtre (ou `Ctrl` + `O`). Sélectionnez des pages
dans la grille, puis faites-les pivoter (`R`), supprimez-les (`Suppr`),
dupliquez-les ou déplacez-les avec **Avancer / Reculer** (sans glisser).
**Extraction** (`Ctrl` + `E`) enregistre des pages dans un nouveau PDF :
saisissez par exemple `1-3, 7`. **Exporter** (`Ctrl` + `S`) télécharge le
document modifié.

### Reconnaissance de texte (OCR)
Onglet **Reconnaître le texte** : choisissez les pages, la langue (français,
anglais ou les deux) et la qualité (rapide 200 ppp, standard 300 ppp,
élevée 400 ppp). Les pages qui contiennent déjà du texte sont ignorées, sauf
si vous cochez l'option. Vous pouvez annuler à tout moment. Ensuite :
corriger et copier le texte, l'enregistrer en `.txt`, **enregistrer un PDF
consultable** (pages identiques, texte invisible sélectionnable), ou créer
un fichier Word ou Excel.

L'application de bureau contient les modèles français et anglais : l'OCR
fonctionne sur un ordinateur qui n'a jamais été connecté. Dans la version
web, le moteur (≈ 4 Mo) et chaque pack de langue (0,7 à 2,9 Mo) sont
téléchargés depuis le site la première fois ; **Hors ligne → Rendre
disponible hors ligne** les conserve.

### Compresser
| Niveau | Effet |
|---|---|
| Sans perte | Réorganise le fichier et fusionne les images en double ; les pages ne changent pas |
| Équilibré (150 ppp) | Réduit aussi les grandes images ; convient à l'écran et à l'impression courante |
| Fort (100 ppp) | Fichiers les plus légers ; les images perdent des détails |

Si un niveau ne réduit pas le fichier, le document n'est pas modifié.

### Outils de page
Pages blanches A4/Letter, images en pages (les informations de l'appareil
photo ne sont pas copiées), numéros de page (`{n}` et `{total}`), filigrane
texte semi-transparent, enregistrement des pages en PNG ou JPEG (plusieurs
pages dans un `.zip`).

### Annoter et remplir
Dans la vue **Document** : **Ajouter du texte**, choisir la police, la
taille, le gras, l'italique et la couleur ; insérer une image de signature,
la redimensionner et **retirer le fond**. Les champs de formulaire
s'affichent en bleu et se remplissent directement sur la page.

### Langue
L'installateur propose le français ou l'anglais ; l'application s'ouvre dans
la langue choisie. Changez à tout moment avec **EN | FR** en haut à droite.

### Raccourcis clavier
Appuyez sur **?** dans l'application pour afficher la liste complète.

## Aide et contribution

- Questions et problèmes : [SUPPORT.md](SUPPORT.md) (les questions en
  français sont bienvenues).
- Failles de sécurité : [SECURITY.md](SECURITY.md) (signalement privé).
- Développement et architecture : [README en anglais](README.md#for-developers),
  [CONTRIBUTING.md](CONTRIBUTING.md).
- Déploiement en organisation : l'installation sans droits d'administrateur
  ne contourne pas les règles de contrôle des applications de votre
  organisation (AppLocker, WDAC, SmartScreen).

## Auteur et licence

Créé et maintenu par **[Dramane Bako](https://github.com/bakodramane)**.
Licence [Apache 2.0](LICENSE). Les composants tiers et leurs licences sont
listés dans `THIRD-PARTY-NOTICES.txt`, fourni avec chaque version.
