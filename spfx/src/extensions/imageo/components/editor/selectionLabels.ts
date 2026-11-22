const english = {
  colour: 'Select by colour', colourHint: 'Click a colour to highlight its connected area. Click again to add another area.',
  select: 'Select object', add: 'Add brush', erase: 'Erase brush', clear: 'Clear selection', brush: 'Brush size',
  crop: 'Crop size', moveCrop: 'Drag to frame the crop.', pick: 'Sample a colour from the image', swatch: 'Colour',
  hex: 'Hex colour', keyboard: 'Use arrow keys to move and Enter to apply the active tool.',
  hint: 'Click an object. Diagonal stripes mark the selected area. Click another part to add it.',
  tools: 'Selection tools', addHint: 'Paint to add the pixels under the brush to the selection.',
  eraseHint: 'Paint to remove pixels from the selection. The picture stays intact.',
  clearHint: 'Clear all selection marks from the picture.', resizeHint: 'Set the pixel dimensions of the copy you save.',
  width: 'Width (px)', height: 'Height (px)', proportions: 'Keep proportions', applySize: 'Apply size', cancelSize: 'Cancel',
   sample: 'Click a pixel to use its colour as the new colour. Your target selection stays the same.',
  image: 'Image editing area', unavailable: 'The image could not be opened for editing.',
  empty: 'Select a visible part of the image.', emptyHex: 'Enter a six-digit hex colour.',
};
type Labels = typeof english;
const german: Labels = {
  colour: 'Nach Farbe auswählen', colourHint: 'Eine Farbe anklicken, um den zusammenhängenden Bereich zu markieren. Weitere Bereiche durch Anklicken hinzufügen.',
  select: 'Objekt auswählen', add: 'Pinsel hinzufügen', erase: 'Radieren', clear: 'Auswahl löschen', brush: 'Pinselgrösse',
  crop: 'Ausschnittgrösse', moveCrop: 'Den Ausschnitt durch Ziehen positionieren.', pick: 'Farbe aus dem Bild aufnehmen', swatch: 'Farbe',
  hex: 'Hex-Farbe', keyboard: 'Mit den Pfeiltasten bewegen und mit der Eingabetaste anwenden.',
  hint: 'Auf ein Objekt klicken. Diagonale Streifen markieren die Auswahl. Weitere Teile durch Anklicken hinzufügen.',
  tools: 'Auswahlwerkzeuge', addHint: 'Mit dem Pinsel Bildteile zur Auswahl hinzufügen.',
  eraseHint: 'Mit dem Pinsel Bildteile aus der Auswahl entfernen. Das Bild bleibt erhalten.',
  clearHint: 'Alle Auswahlmarkierungen entfernen.', resizeHint: 'Die Pixelmasse der zu speichernden Kopie festlegen.',
  width: 'Breite (px)', height: 'Höhe (px)', proportions: 'Seitenverhältnis beibehalten', applySize: 'Grösse übernehmen', cancelSize: 'Abbrechen',
   sample: 'Ein Pixel anklicken, um seine Farbe als neue Farbe zu übernehmen. Die Auswahl bleibt erhalten.',
  image: 'Bildbearbeitung', unavailable: 'Das Bild konnte nicht zur Bearbeitung geöffnet werden.',
  empty: 'Einen sichtbaren Bildteil auswählen.', emptyHex: 'Eine sechsstellige Hex-Farbe eingeben.',
};
const french: Labels = {
  colour: 'Sélection par couleur', colourHint: 'Cliquez sur une couleur pour sélectionner sa zone contiguë. Cliquez ailleurs pour étendre la sélection.',
  select: 'Sélectionner un objet', add: 'Ajouter au pinceau', erase: 'Effacer au pinceau', clear: 'Effacer la sélection', brush: 'Taille du pinceau',
  crop: 'Taille du cadrage', moveCrop: 'Faites glisser pour cadrer.', pick: 'Prélever une couleur dans l’image', swatch: 'Couleur',
  hex: 'Couleur hexadécimale', keyboard: 'Utilisez les flèches pour vous déplacer et Entrée pour appliquer l’outil actif.',
  hint: 'Cliquez sur un objet. Des hachures diagonales indiquent la zone sélectionnée. Cliquez sur une autre partie pour l’ajouter.',
  tools: 'Outils de sélection', addHint: 'Passez le pinceau sur les pixels à ajouter à la sélection.',
  eraseHint: 'Passez le pinceau sur les pixels à retirer de la sélection. L’image reste intacte.',
  clearHint: 'Effacez toutes les marques de sélection.', resizeHint: 'Définissez les dimensions en pixels de la copie à enregistrer.',
  width: 'Largeur (px)', height: 'Hauteur (px)', proportions: 'Conserver les proportions', applySize: 'Appliquer la taille', cancelSize: 'Annuler',
   sample: 'Cliquez sur un pixel pour utiliser sa couleur comme nouvelle couleur. La sélection reste en place.',
  image: 'Zone de retouche', unavailable: 'Impossible d’ouvrir cette image pour la retoucher.',
  empty: 'Sélectionnez une partie visible de l’image.', emptyHex: 'Saisissez une couleur hexadécimale à six chiffres.',
};
const italian: Labels = {
  colour: 'Seleziona per colore', colourHint: 'Fai clic su un colore per selezionare la zona contigua. Fai clic su altre zone per aggiungerle.',
  select: 'Seleziona oggetto', add: 'Aggiungi con pennello', erase: 'Gomma', clear: 'Cancella selezione', brush: 'Dimensione pennello',
  crop: 'Dimensione ritaglio', moveCrop: 'Trascina per posizionare il ritaglio.', pick: 'Campiona un colore dall’immagine', swatch: 'Colore',
  hex: 'Colore esadecimale', keyboard: 'Usa le frecce per spostarti e Invio per applicare lo strumento.',
  hint: 'Fai clic su un oggetto. Le strisce diagonali indicano l’area selezionata. Fai clic su un’altra parte per aggiungerla.',
  tools: 'Strumenti di selezione', addHint: 'Passa il pennello sui pixel da aggiungere alla selezione.',
  eraseHint: 'Passa il pennello sui pixel da togliere dalla selezione. L’immagine resta intatta.',
  clearHint: 'Cancella tutti i segni della selezione.', resizeHint: 'Imposta le dimensioni in pixel della copia da salvare.',
  width: 'Larghezza (px)', height: 'Altezza (px)', proportions: 'Mantieni le proporzioni', applySize: 'Applica dimensioni', cancelSize: 'Annulla',
   sample: 'Fai clic su un pixel per usarne il colore come nuovo colore. La selezione resta invariata.',
  image: 'Area di modifica', unavailable: 'Impossibile aprire l’immagine per la modifica.',
  empty: 'Seleziona una parte visibile dell’immagine.', emptyHex: 'Inserisci un colore esadecimale a sei cifre.',
};

export function selectionLabels(locale?: string): Labels {
  switch ((locale || 'en').slice(0, 2).toLowerCase()) {
    case 'de': return german;
    case 'fr': return french;
    case 'it': return italian;
    default: return english;
  }
}
