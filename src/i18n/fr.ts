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
  "compress.button": "Compresser le document",
  "compress.result": "{pct} % gagnés ({before} → {after}). Utilisez Exporter pour télécharger.",
  "compress.hint":
    "Réorganise la structure du PDF en flux d'objets. Les images intégrées ne sont pas recompressées : le gain varie.",

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

  // Erreurs
  "error.splitPoints":
    "Indiquez au moins un point de découpe valide (ex. 3, 7) dans la plage de pages.",
  "error.imageType": "Cette image est illisible. Utilisez une image PNG, JPG, WebP, GIF ou BMP.",
  "error.noSignature":
    "Aucune signature n'a été trouvée dans l'image. Essayez une photo avec un trait plus foncé.",
  "error.loadFirst": "Chargez d'abord un PDF.",
  "error.noSelection": "Sélectionnez d'abord au moins une page.",
  "error.noFile": "Aucun fichier fourni.",
  "error.notPdf": "« {name} » n'est pas un fichier PDF.",
  "error.empty": "« {name} » est vide.",
  "error.tooLarge": "« {name} » est trop volumineux (maximum {max} Mo).",
  "error.invalid": "« {name} » ne semble pas être un PDF valide.",
  "error.encrypted":
    "« {name} » est protégé par un mot de passe. Retirez le mot de passe et réessayez.",
  "error.corrupted": "« {name} » est illisible : il est peut-être endommagé.",
  "error.noPages": "« {name} » ne contient aucune page.",
  "error.nothingToExport": "Rien à exporter : le document ne contient aucune page.",
  "error.missingSource": "Un PDF source est introuvable.",
  "error.invalidRange":
    "« {range} » n'est pas une plage de pages valide. Utilisez des numéros et des plages comme 1-3, 7.",
  "error.rangeOutOfBounds": "La page {page} n'existe pas : le document compte {max} pages.",
};
