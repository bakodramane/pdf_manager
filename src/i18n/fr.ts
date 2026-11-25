import type { Messages } from "./en";

/** Chaînes de l'interface en français. Mêmes clés que `en.ts`. */
export const fr: Messages = {
  // Coque de l'application
  "app.name": "PDF Manager",
  "app.tagline": "Modifiez, organisez et convertissez vos PDF en toute confidentialité",
  "app.badge": "100 % local",
  "app.reset": "Fermer le document",
  "app.language": "Langue",
  "app.authorLinkTitle": "Voir la page GitHub de l'auteur",
  "app.privacyNote": "Vos fichiers ne quittent jamais cet appareil",
  "app.undo": "Annuler",
  "app.redo": "Rétablir",

  // Navigation
  "nav.pages": "Pages",
  "nav.merge": "Fusion et découpe",
  "nav.annotate": "Annoter",
  "nav.compress": "Compresser",
  "nav.convert": "Convertir",
  "nav.export": "Exporter",
  "nav.credits": "Crédits",
  "nav.shortcuts": "Raccourcis clavier",

  // Boîtes de dialogue
  "dialog.close": "Fermer",
  "credits.title": "Crédits",
  "credits.version": "Version {version}",
  "credits.createdBy": "Créé par",
  "credits.github": "Voir le profil GitHub",
  "credits.builtWith": "Conçu avec React, pdf-lib, PDF.js, docx, ExcelJS et Electron.",
  "credits.licence": "Publié sous licence Apache 2.0.",
  "shortcuts.title": "Raccourcis clavier",
  "shortcuts.open": "Ouvrir ou ajouter un PDF",
  "shortcuts.undo": "Annuler la dernière modification",
  "shortcuts.redo": "Rétablir la modification annulée",
  "shortcuts.selectAll": "Sélectionner toutes les pages",
  "shortcuts.clear": "Effacer la sélection",
  "shortcuts.rotateRight": "Faire pivoter la sélection à droite",
  "shortcuts.rotateLeft": "Faire pivoter la sélection à gauche",
  "shortcuts.delete": "Supprimer les pages sélectionnées",
  "shortcuts.extract": "Extraction (plage de pages ou sélection)",
  "shortcuts.export": "Télécharger le PDF modifié",
  "shortcuts.help": "Afficher cette liste",
  "shortcuts.zoomIn": "Zoom avant (vue document)",
  "shortcuts.zoomOut": "Zoom arrière (vue document)",
  "shortcuts.zoomReset": "Taille réelle (vue document)",
  "shortcuts.hint": "Appuyez sur ? pour afficher les raccourcis clavier",

  // Accueil (aucun document)
  "home.title": "Votre boîte à outils PDF, directement sur votre ordinateur",
  "home.subtitle":
    "Lisez, annotez, signez et remplissez vos PDF ; fusionnez-les, découpez-les, extrayez des pages, faites-les pivoter, compressez-les et convertissez-les en Word ou Excel. Rien n'est envoyé en ligne : tout se passe sur cet appareil.",
  "home.drop": "Déposez vos fichiers PDF ici",
  "home.dropHint": "ou cliquez pour parcourir",
  "home.feature.organise": "Organiser les pages",
  "home.feature.organiseText":
    "Réordonnez, faites pivoter, supprimez et extrayez des pages en un clic.",
  "home.feature.merge": "Fusion et découpe",
  "home.feature.mergeText": "Assemblez plusieurs documents ou découpez-les en parties.",
  "home.feature.convert": "Conversion",
  "home.feature.convertText": "Transformez vos PDF en fichiers Word et Excel modifiables.",
  "home.feature.private": "Confidentiel par conception",
  "home.feature.privateText": "Aucun envoi, aucun suivi, aucun compte.",

  // Barre d'outils au-dessus de la grille
  "toolbar.pages": "{count} pages",
  "toolbar.page": "1 page",
  "toolbar.selected": "{count} sélectionnée(s)",
  "toolbar.selectAll": "Tout sélectionner",
  "toolbar.clear": "Effacer la sélection",
  "toolbar.hint": "Cliquez pour sélectionner · faites glisser pour réordonner",

  // Choix de la vue et visionneuse
  "view.label": "Vue",
  "view.grid": "Grille des pages",
  "view.document": "Document",
  "viewer.prevPage": "Page précédente",
  "viewer.nextPage": "Page suivante",
  "viewer.pageNumber": "Numéro de page",
  "viewer.zoom": "Zoom",
  "viewer.zoomIn": "Zoom avant (Ctrl +)",
  "viewer.zoomOut": "Zoom arrière (Ctrl −)",
  "viewer.fitWidth": "Pleine largeur",
  "viewer.fitPage": "Page entière",
  "viewer.select": "Sélectionner et déplacer",
  "viewer.addText": "Ajouter du texte",
  "viewer.addImage": "Ajouter une signature ou une image",
  "viewer.hint":
    "Ctrl + molette pour zoomer · sélectionnez du texte pour le copier · double-cliquez sur un texte ajouté pour le modifier",
  "viewer.hintText": "Cliquez sur la page à l'endroit voulu (Échap pour annuler).",
  "viewer.formatText": "Texte",
  "viewer.formatImage": "Signature / image",
  "thumb.annotations": "{count} annotation(s)",
  "thumb.open": "Double-cliquez pour ouvrir dans la vue document",

  // Panneau Pages
  "pages.title": "Pages",
  "pages.description": "Sélectionnez des pages dans la grille, puis choisissez une action.",
  "pages.add": "Ajouter des pages",
  "pages.addDrop": "Ajouter un PDF",
  "pages.addHint": "Les nouveaux fichiers sont ajoutés à la fin.",
  "pages.selection": "Sélection",
  "pages.selectAll": "Tout sélectionner",
  "pages.clear": "Effacer",
  "pages.edit": "Modifier les pages sélectionnées",
  "pages.rotateLeft": "Pivoter à gauche",
  "pages.rotateRight": "Pivoter à droite",
  "pages.extraction": "Extraction",
  "pages.extractionHint":
    "Saisissez des pages ou des plages (1-3, 7, 10-), ou laissez le champ vide pour utiliser les pages sélectionnées dans la grille. Un nouveau PDF est enregistré ; le document en cours reste inchangé.",
  "pages.rangeLabel": "Pages à extraire",
  "pages.rangePlaceholder": "ex. 1-3, 7",
  "pages.rangeSelect": "Sélectionner",
  "pages.rangeSelectTitle": "Sélectionner ces pages dans la grille",
  "pages.keepOnly": "Ne garder que la sélection",
  "pages.delete": "Supprimer",
  "pages.reorderHint": "Réordonnez les pages en les faisant glisser dans la grille.",

  // Panneau Fusion et découpe
  "merge.title": "Fusion et découpe",
  "merge.description": "Assemblez plusieurs PDF ou découpez-en un en parties.",
  "merge.merge": "Fusionner",
  "merge.drop": "Ajouter des PDF à fusionner",
  "merge.hint":
    "Les fichiers ajoutés sont placés à la suite du document. Utilisez Exporter pour enregistrer le résultat.",
  "merge.split": "Découper",
  "merge.splitLabel": "Découper après les pages n° (séparées par des virgules)",
  "merge.splitPlaceholder": "ex. 3, 7",
  "merge.splitButton": "Découper et télécharger",
  "merge.splitHint": "Chaque partie est téléchargée dans un PDF distinct.",
  "merge.insert": "Insérer les pages d'un autre PDF",
  "merge.insertAfter": "Insérer après la page n°",
  "merge.insertDrop": "Choisir un PDF à insérer",
  "merge.insertHint": "Indiquez 0 pour insérer tout au début.",

  // Panneau Annoter
  "annotate.title": "Annoter",
  "annotate.description":
    "Ajoutez du texte et des signatures, remplissez les formulaires et lisez le document à tout niveau de zoom.",
  "annotate.add": "Ajouter sur la page",
  "annotate.addTextButton": "Ajouter du texte",
  "annotate.addTextHint": "Cliquez ensuite sur la page à l'endroit voulu.",
  "annotate.imageDrop": "Ajouter une signature ou une image",
  "annotate.imageHint": "PNG, JPG, WebP, GIF ou BMP. Elle apparaît au milieu de la page en cours.",
  "annotate.howTo": "Modifier sur la page",
  "annotate.tipMove": "Faites glisser un texte ou une signature pour le déplacer.",
  "annotate.tipEdit": "Double-cliquez sur un texte pour le modifier.",
  "annotate.tipFormat": "Sélectionnez un texte pour changer sa police, sa taille, son style et sa couleur dans la barre au-dessus de la page.",
  "annotate.tipResize": "Faites glisser les coins d'une signature pour la redimensionner, ou ses bords pour la remodeler.",
  "annotate.tipBackground":
    "Sélectionnez une signature et choisissez Supprimer le fond pour rendre le papier transparent, même sur une photo avec des ombres.",
  "annotate.tipDelete": "Appuyez sur Suppr pour retirer l'élément sélectionné ; les flèches le déplacent finement.",
  "annotate.forms": "Formulaires",
  "annotate.formsHint":
    "Les champs à remplir sont surlignés en bleu sur la page : saisissez du texte, cochez les cases et choisissez les options. Les saisies sont enregistrées dans les champs à l'export.",
  "annotate.flattenNote":
    "Les annotations restent modifiables jusqu'à l'export, la compression ou la conversion du document.",
  "annotate.defaultText": "Texte",
  "annotate.font": "Police",
  "annotate.fontSize": "Taille de police (pt)",
  "annotate.smaller": "Réduire le texte",
  "annotate.larger": "Agrandir le texte",
  "annotate.bold": "Gras",
  "annotate.italic": "Italique",
  "annotate.colour": "Couleur du texte",
  "annotate.editText": "Modifier le texte",
  "annotate.keepRatio": "Conserver les proportions",
  "annotate.resizeHint": "Coins : redimensionner · bords : remodeler · Maj inverse les proportions",
  "annotate.removeBackground": "Supprimer le fond",
  "annotate.removingBackground": "Suppression du fond…",
  "annotate.strength": "Intensité",
  "annotate.strengthHint": "Augmentez-la s'il reste des traces de papier ; baissez-la si le trait s'efface.",
  "annotate.restoreOriginal": "Rétablir l'original",
  "annotate.remove": "Supprimer (Suppr)",
  "annotate.imageTitle": "Glisser pour déplacer · poignées pour redimensionner",
  "annotate.textTitle": "Glisser pour déplacer · double-clic pour modifier",

  // Panneau Compresser
  "compress.title": "Compresser",
  "compress.description": "Allégez le document pour le partager.",
  "compress.profile": "Niveau de compression",
  "compress.profile.lossless": "Sans perte",
  "compress.profile.losslessHint": "Réorganise la structure du fichier et fusionne les images en double. Rien ne change sur les pages.",
  "compress.profile.balanced": "Équilibré (150 ppp)",
  "compress.profile.balancedHint": "Réduit aussi les grandes images. Convient à la lecture à l'écran et à l'impression courante.",
  "compress.profile.strong": "Fort (100 ppp)",
  "compress.profile.strongHint": "Fichiers les plus légers, pour l'envoi par e-mail ou les connexions lentes. Les images perdent des détails visibles.",
  "compress.lossyWarning":
    "Ce niveau réencode les images (avec perte) : photos et numérisations perdent un peu de détail. Le texte, les dessins, les formulaires et les liens sont conservés. Le fichier d'origine sur votre disque n'est pas modifié.",
  "compress.progress": "Optimisation des images… {done} sur {total}",
  "compress.noGain":
    "Aucune réduction possible à ce niveau ({before} → {after}) ; le document n'a pas été modifié.",
  "compress.imagesResult": "{count} image(s) optimisée(s), {skipped} laissée(s) telle(s) quelle(s).",
  "compress.button": "Compresser le document",
  "compress.result": "{pct} % gagnés ({before} → {after}). Utilisez Exporter pour télécharger.",
  "compress.hint":
    "Le résultat dépend du document : les numérisations et photos se réduisent le plus, les fichiers de texte seul très peu. Le résultat remplace le document ouvert (Annuler rétablit l'original) — utilisez Exporter pour l'enregistrer.",

  // Panneau Convertir
  "convert.title": "Convertir",
  "convert.description": "Transformez le document en fichier Office.",
  "convert.word": "PDF → Word",
  "convert.excel": "PDF → Excel",
  "convert.hint":
    "Conserve les titres, polices, tableaux et images. Excel reçoit une feuille par page, avec de vrais nombres. Les PDF numérisés ne sont pas reconnus (pas d'OCR).",

  // Panneau Exporter
  "export.title": "Exporter",
  "export.description": "Enregistrez votre travail dans un nouveau PDF.",
  "export.button": "Télécharger le PDF modifié",
  "export.hint":
    "Applique l'ordre des pages, les rotations et les suppressions, et enregistre vos annotations et saisies de formulaire dans les pages.",

  // Vignettes
  "thumb.rendering": "Rendu…",
  "thumb.failed": "Aperçu indisponible",
  "thumb.alt": "Page {n}",

  // Messages d'attente
  "busy.loading": "Chargement du PDF…",
  "busy.splitting": "Découpe…",
  "busy.inserting": "Insertion…",
  "busy.extracting": "Extraction des pages…",
  "busy.compressing": "Compression…",
  "busy.toWord": "Conversion en Word…",
  "busy.toWordPage": "Conversion en Word… page {done} sur {total}",
  "busy.toExcel": "Conversion en Excel…",
  "busy.toExcelPage": "Conversion en Excel… page {done} sur {total}",
  "busy.exporting": "Exportation…",

  // Confirmations
  "notice.extracted": "{count} page(s) extraite(s) dans {file}",
  "notice.exported": "{file} enregistré",
  "notice.split": "{count} parties téléchargées",
  "notice.dismiss": "Fermer",

  // Avertissements sur le contenu d'un PDF chargé
  "warning.file": "« {name} » :",
  "warning.signed":
    "Il porte une signature numérique. Tout fichier exporté par PDF Manager est un nouveau fichier dans lequel cette signature n'est plus valide.",
  "warning.scripts":
    "Il contient des scripts ou des actions. PDF Manager ne les exécute jamais, mais les pages exportées peuvent encore les contenir.",
  "warning.attachments": "Il contient des fichiers joints. PDF Manager ne les ouvre pas.",
  "warning.xfa": "Il utilise un formulaire XFA, que PDF Manager ne peut ni afficher ni remplir.",

  // Outils de page
  "nav.tools": "Outils de page",
  "pages.duplicate": "Dupliquer",
  "pages.moveEarlier": "Avancer",
  "pages.moveLater": "Reculer",
  "tools.title": "Outils de page",
  "tools.description": "Ajoutez des pages, numérotez-les, marquez-les ou enregistrez-les en images.",
  "tools.blank": "Page blanche",
  "tools.pageSize": "Format de page",
  "tools.blankButton": "Insérer une page blanche",
  "tools.insertHint": "Les nouvelles pages sont placées après la dernière page sélectionnée, ou à la fin.",
  "tools.blankAdded": "Page blanche insérée en page {page}.",
  "tools.images": "Images en pages",
  "tools.imageSize": "Même taille que l'image",
  "tools.imagesDrop": "Ajouter des images (JPG, PNG…) comme pages",
  "tools.imagesHint":
    "Chaque image devient une page, dans l'ordre choisi. Les informations de l'appareil photo (EXIF, position) ne sont pas copiées dans le PDF.",
  "tools.imagesAdded": "{count} image(s) ajoutée(s) comme pages.",
  "tools.numbers": "Numéros de page",
  "tools.position": "Position",
  "tools.position.bottom-center": "En bas au centre",
  "tools.position.bottom-right": "En bas à droite",
  "tools.position.top-right": "En haut à droite",
  "tools.template": "Texte",
  "tools.templateHint": "{n} est remplacé par le numéro de page et {total} par le nombre de pages. Annuler retire les numéros.",
  "tools.start": "Premier numéro",
  "tools.numbersButton": "Ajouter les numéros de page",
  "tools.numbersAdded": "Numéros de page ajoutés.",
  "tools.watermark": "Filigrane",
  "tools.watermarkText": "Texte",
  "tools.watermarkPlaceholder": "ex. BROUILLON, CONFIDENTIEL",
  "tools.opacity": "Opacité ({value} %)",
  "tools.angle": "Angle",
  "tools.watermarkButton": "Ajouter le filigrane",
  "tools.watermarkAdded": "Filigrane ajouté.",
  "tools.watermarkEmpty": "Saisissez d'abord le texte du filigrane.",
  "tools.watermarkHint":
    "Un filigrane est dessiné sur la page comme tout autre contenu. Il marque un document ; il ne le protège pas et peut être retiré avec un éditeur.",
  "tools.exportImages": "Enregistrer les pages en images",
  "tools.format": "Format",
  "tools.resolution": "Résolution",
  "tools.exportImagesButton": "Enregistrer en images",
  "tools.exportImagesHint": "Une page donne une image ; plusieurs pages sont enregistrées ensemble dans un fichier .zip.",
  "tools.exporting": "Création des images…",
  "tools.exportProgress": "Création des images… {done} sur {total}",

  // OCR
  "nav.ocr": "Reconnaître le texte",
  "busy.cancel": "Annuler",
  "busy.cancelling": "Annulation…",
  "ocr.title": "Reconnaissance de texte (OCR)",
  "ocr.description":
    "Transformez des pages numérisées en texte sélectionnable et consultable — sur cet appareil, en anglais et en français.",
  "ocr.settings": "Réglages",
  "ocr.scope": "Pages",
  "ocr.scope.all": "Toutes les pages",
  "ocr.scope.selected": "Pages sélectionnées",
  "ocr.scope.range": "Plage de pages",
  "ocr.language": "Langue du document",
  "ocr.lang.both": "Anglais et français",
  "ocr.lang.eng": "Anglais",
  "ocr.lang.fra": "Français",
  "ocr.quality": "Qualité",
  "ocr.quality.fast": "Rapide (200 ppp) — texte net et assez grand",
  "ocr.quality.standard": "Standard (300 ppp) — recommandé",
  "ocr.quality.high": "Élevée (400 ppp) — petits caractères ; plus lent, plus de mémoire",
  "ocr.includeText": "Reconnaître aussi les pages qui contiennent déjà du texte",
  "ocr.includeTextWarning":
    "Les pages qui ont déjà du texte recevront une seconde couche de texte OCR : les recherches et copies pourront afficher le texte en double.",
  "ocr.button": "Reconnaître le texte",
  "ocr.offlineDesktop":
    "Fonctionne hors ligne : le moteur de reconnaissance et les modèles anglais et français sont inclus dans l'application.",
  "ocr.offlineWeb":
    "Le moteur de reconnaissance et le modèle de langue ({size}) sont chargés depuis ce site la première fois, puis le traitement se fait dans votre navigateur. Rien n'est envoyé.",
  "ocr.busy.starting": "Préparation de la reconnaissance de texte…",
  "ocr.busy.page": "Reconnaissance de la page {page} ({done} sur {total})…",
  "ocr.busy.building": "Création du fichier…",
  "ocr.done": "Texte reconnu sur {count} page(s).",
  "ocr.cancelled": "Reconnaissance annulée. Résultats conservés pour {count} page(s) (partiels).",
  "ocr.someFailed": "La reconnaissance a échoué sur la ou les pages {pages}. Vous pouvez réessayer.",
  "ocr.results": "Résultats",
  "ocr.stale":
    "Le document a changé depuis la reconnaissance. Relancez-la avant d'enregistrer un PDF consultable ou de convertir.",
  "ocr.summary": "{done} page(s) reconnue(s), {skipped} ignorée(s) (déjà du texte), {failed} en échec.",
  "ocr.skippedText": "Ignorées car elles contiennent déjà du texte : page(s) {pages}.",
  "ocr.lowConfidence":
    "Confiance de reconnaissance faible sur la ou les pages {pages}. Vérifiez attentivement le texte ; une numérisation plus nette ou de meilleure résolution peut aider.",
  "ocr.retryFailed": "Réessayer les pages en échec",
  "ocr.saveSearchable": "Enregistrer le PDF consultable",
  "ocr.copy": "Copier le texte",
  "ocr.saveText": "Enregistrer en .txt",
  "ocr.toWord": "Word (depuis l'OCR)",
  "ocr.toExcel": "Excel (depuis l'OCR)",
  "ocr.convertHint":
    "Les fichiers Word et Excel créés à partir du texte reconnu sont approximatifs : vérifiez les noms, nombres et dates avant de vous y fier.",
  "ocr.copied": "Texte copié dans le presse-papiers.",
  "ocr.copyFailed": "Le texte n'a pas pu être copié. Utilisez plutôt « Enregistrer en .txt ».",
  "ocr.pageLabel": "Page {page}",
  "ocr.pageText": "Texte reconnu de la page {page}",
  "ocr.confidence": "confiance {value} %",
  "ocr.low": "à vérifier",
  "ocr.editHint":
    "Vous pouvez corriger le texte ci-dessus ; les corrections servent à « Copier le texte » et « Enregistrer en .txt ». Le PDF consultable utilise les mots reconnus et leurs positions.",
  "ocr.limitsTitle": "Bon à savoir",
  "ocr.limit.confidence":
    "La confiance est une estimation du moteur, pas une garantie. Ne considérez jamais des chiffres juridiques, financiers ou officiels reconnus comme vérifiés.",
  "ocr.limit.orientation":
    "Les pages doivent être à l'endroit : faites d'abord pivoter les pages couchées ou à l'envers (onglet Pages).",
  "ocr.limit.layout":
    "Le PDF consultable conserve chaque page à l'identique ; seul du texte invisible est ajouté. Les signatures numériques existantes ne seront plus valides.",

  // Erreurs
  "error.splitPoints":
    "Indiquez au moins un point de découpe valide (ex. 3, 7) dans la plage de pages.",
  "error.imageType": "Cette image est illisible. Utilisez une image PNG, JPG, WebP, GIF ou BMP.",
  "error.noSignature":
    "Aucune signature n'a été trouvée dans l'image. Essayez une photo avec un trait plus foncé.",
  "error.loadFirst": "Chargez d'abord un PDF.",
  "error.noSelection": "Sélectionnez d'abord au moins une page.",
  "error.unsupportedChars":
    "Le texte d'une annotation contient des caractères que les polices fournies ne permettent pas d'écrire dans le PDF : {chars}. Supprimez-les ou remplacez-les, puis exportez à nouveau.",
  "error.noFile": "Aucun fichier fourni.",
  "error.notPdf": "« {name} » n'est pas un fichier PDF.",
  "error.empty": "« {name} » est vide.",
  "error.tooLarge": "« {name} » est trop volumineux (maximum {max} Mo).",
  "error.invalid": "« {name} » ne semble pas être un PDF valide.",
  "error.encrypted":
    "« {name} » est chiffré (protégé par un mot de passe). La modification des PDF chiffrés n'est pas prise en charge : ouvrez-le dans le logiciel qui l'a créé, enregistrez une copie non protégée si vous en avez le droit, puis réessayez.",
  "error.totalTooLarge":
    "Ouvrir « {name} » utiliserait plus de {max} Mo de mémoire pour les documents. Fermez le document en cours (ou certains fichiers) et réessayez.",
  "error.tooManyPages":
    "Ouvrir « {name} » porterait le total à plus de {max} pages. Fermez le document en cours et réessayez.",
  "error.tooManyFiles": "Trop de fichiers à la fois (maximum {max}). Ajoutez-les par petits groupes.",
  "error.imageTooLarge":
    "Cette image est trop grande (maximum {max} mégapixels). Utilisez une image plus petite.",
  "error.corrupted": "« {name} » est illisible : il est peut-être endommagé.",
  "error.noPages": "« {name} » ne contient aucune page.",
  "error.nothingToExport": "Rien à exporter : le document ne contient aucune page.",
  "error.missingSource": "Un PDF source est introuvable.",
  "error.invalidRange":
    "« {range} » n'est pas une plage de pages valide. Utilisez des numéros et des plages comme 1-3, 7.",
  "error.rangeOutOfBounds": "La page {page} n'existe pas : le document compte {max} pages.",
};
