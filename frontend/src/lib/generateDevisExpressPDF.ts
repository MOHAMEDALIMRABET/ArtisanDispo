/**
 * ══════════════════════════════════════════════════════════════════
 * UTILITAIRE : Génération PDF pour les devis express (> 150€)
 * ══════════════════════════════════════════════════════════════════
 *
 * Génère un PDF professionnel du devis joint à une proposition express.
 * Utilisé côté client et côté artisan pour télécharger le document signé.
 *
 * Dépendances : jspdf + jspdf-autotable
 */

import type { DevisExpressJoint } from '@/types/firestore';

interface DevisExpressPDFOptions {
  devis: DevisExpressJoint;
  /** Numéro ou identifiant court de la proposition (ex: "6k6q3ZZw") */
  propositionId: string;
  /** Nom/prénom ou raison sociale de l'artisan */
  artisanNom: string;
  /** Nom/prénom du client */
  clientNom: string;
  /** Catégorie de la demande (ex: "Serrurerie") */
  categorie: string;
  /** Ville de l'intervention */
  ville: string;
}

export async function generateDevisExpressPDF(opts: DevisExpressPDFOptions): Promise<void> {
  // Import dynamique pour éviter le chargement côté serveur (SSR)
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const { devis, propositionId, artisanNom, clientNom, categorie, ville } = opts;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const orange = [255, 107, 0] as [number, number, number];
  const bleu = [44, 62, 80] as [number, number, number];
  const gris = [108, 117, 125] as [number, number, number];
  const grisClair = [233, 236, 239] as [number, number, number];

  const marginX = 15;
  const pageW = 210;

  // ── En-tête ──────────────────────────────────────────────────────
  doc.setFillColor(...bleu);
  doc.rect(0, 0, pageW, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('ArtisanSafe', marginX, 13);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Plateforme de mise en relation artisans-clients', marginX, 20);

  doc.setTextColor(...orange);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('DEVIS EXPRESS', pageW - marginX, 11, { align: 'right' });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Réf : ${propositionId.slice(0, 8).toUpperCase()}`, pageW - marginX, 18, { align: 'right' });
  doc.text(`Émis le : ${new Date().toLocaleDateString('fr-FR')}`, pageW - marginX, 24, { align: 'right' });

  let y = 36;

  // ── Parties ───────────────────────────────────────────────────────
  doc.setTextColor(...bleu);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('PRESTATAIRE', marginX, y);
  doc.text('CLIENT', pageW / 2 + 5, y);

  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(50, 50, 50);
  doc.setFontSize(9);
  doc.text(artisanNom, marginX, y);
  doc.text(clientNom, pageW / 2 + 5, y);

  y += 4;
  doc.setTextColor(...gris);
  doc.text(`Catégorie : ${categorie}`, marginX, y);
  doc.text(`Lieu d'intervention : ${ville}`, pageW / 2 + 5, y);

  y += 10;

  // Ligne séparatrice
  doc.setDrawColor(...grisClair);
  doc.setLineWidth(0.3);
  doc.line(marginX, y, pageW - marginX, y);
  y += 6;

  // ── Lignes de prestation ──────────────────────────────────────────
  doc.setTextColor(...bleu);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('PRESTATIONS', marginX, y);
  y += 4;

  const prestationRows = devis.lignes.map((l) => [
    l.description || '—',
    `${l.quantite} ${l.unite}`,
    `${l.prixUnitaireHT.toFixed(2)} €`,
    `${l.tauxTVA} %`,
    `${l.totalHT.toFixed(2)} €`,
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Description', 'Qté / Unité', 'PU HT', 'TVA', 'Total HT']],
    body: prestationRows,
    theme: 'striped',
    headStyles: { fillColor: bleu, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: [50, 50, 50] },
    columnStyles: {
      0: { cellWidth: 75 },
      1: { cellWidth: 30, halign: 'center' },
      2: { cellWidth: 25, halign: 'right' },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 25, halign: 'right' },
    },
    margin: { left: marginX, right: marginX },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // ── Main d'œuvre (si présente) ────────────────────────────────────
  if (devis.mainOeuvre && devis.mainOeuvre.prixHT > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Main d'œuvre", 'Qté / Unité', 'PU HT', 'TVA', 'Total HT']],
      body: [[
        "Main d'œuvre",
        `${devis.mainOeuvre.quantite} ${devis.mainOeuvre.unite}`,
        `${devis.mainOeuvre.prixHT.toFixed(2)} €`,
        `${devis.mainOeuvre.tauxTVA} %`,
        `${(devis.mainOeuvre.quantite * devis.mainOeuvre.prixHT).toFixed(2)} €`,
      ]],
      theme: 'striped',
      headStyles: { fillColor: [70, 90, 110], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: [50, 50, 50] },
      columnStyles: {
        0: { cellWidth: 75 },
        1: { cellWidth: 30, halign: 'center' },
        2: { cellWidth: 25, halign: 'right' },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 25, halign: 'right' },
      },
      margin: { left: marginX, right: marginX },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  // ── Matières premières (si présentes) ─────────────────────────────
  if (devis.matierePremiere) {
    autoTable(doc, {
      startY: y,
      head: [['Matières premières', 'Qté / Unité', 'PU HT', 'TVA', 'Total HT']],
      body: [[
        'Matières premières',
        `${devis.matierePremiere.quantite} ${devis.matierePremiere.unite}`,
        `${devis.matierePremiere.prixHT.toFixed(2)} €`,
        `${devis.matierePremiere.tauxTVA} %`,
        `${(devis.matierePremiere.quantite * devis.matierePremiere.prixHT).toFixed(2)} €`,
      ]],
      theme: 'striped',
      headStyles: { fillColor: [80, 100, 50], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: [50, 50, 50] },
      columnStyles: {
        0: { cellWidth: 75 },
        1: { cellWidth: 30, halign: 'center' },
        2: { cellWidth: 25, halign: 'right' },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 25, halign: 'right' },
      },
      margin: { left: marginX, right: marginX },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  y += 2;

  // ── Totaux ────────────────────────────────────────────────────────
  const totauxX = pageW - marginX - 70;
  doc.setFillColor(248, 249, 250);
  doc.roundedRect(totauxX - 5, y - 2, 75, 22, 2, 2, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...gris);
  doc.text('Total HT :', totauxX, y + 4);
  doc.text(`${devis.totaux.totalHT.toFixed(2)} €`, pageW - marginX, y + 4, { align: 'right' });

  doc.text('TVA :', totauxX, y + 10);
  doc.text(`${devis.totaux.totalTVAGlobal.toFixed(2)} €`, pageW - marginX, y + 10, { align: 'right' });

  // Total TTC en orange et gras
  doc.setFillColor(...orange);
  doc.rect(totauxX - 5, y + 13, 75, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL TTC :', totauxX, y + 19);
  doc.text(`${devis.totaux.totalTTC.toFixed(2)} €`, pageW - marginX, y + 19, { align: 'right' });

  y += 30;

  // ── Conditions d'exécution ────────────────────────────────────────
  if (devis.delaiRealisation || devis.dateDebutPrevue || devis.conditions) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...bleu);
    doc.text("CONDITIONS D'EXÉCUTION", marginX, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(50, 50, 50);

    if (devis.delaiRealisation) {
      doc.text(`Délai de réalisation : ${devis.delaiRealisation}`, marginX, y);
      y += 5;
    }
    if (devis.dateDebutPrevue) {
      doc.text(`Date de début prévue : ${devis.dateDebutPrevue}`, marginX, y);
      y += 5;
    }
    if (devis.conditions) {
      const lines = doc.splitTextToSize(`Conditions particulières : ${devis.conditions}`, pageW - 2 * marginX);
      doc.text(lines, marginX, y);
      y += lines.length * 5;
    }
    y += 4;
  }

  // ── Zone signatures ───────────────────────────────────────────────
  // Vérifier si on a assez de place, sinon nouvelle page
  if (y + 55 > 280) {
    doc.addPage();
    y = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...bleu);
  doc.text('SIGNATURES', marginX, y);
  y += 5;

  const sigW = 80;
  const sigH = 35;

  // Cadre artisan
  doc.setDrawColor(...grisClair);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, y, sigW, sigH + 12, 2, 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...bleu);
  doc.text("Signature de l'artisan", marginX + 2, y + 6);

  if (devis.signatureArtisan?.dataURL) {
    try {
      doc.addImage(devis.signatureArtisan.dataURL, 'PNG', marginX + 2, y + 8, sigW - 4, sigH - 4);
    } catch {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(...gris);
      doc.text('Signature numérique apposée', marginX + 2, y + 25);
    }
  }

  // Cadre client (si signé)
  if (devis.signatureClient?.dataURL) {
    const clientSigX = pageW - marginX - sigW;
    doc.roundedRect(clientSigX, y, sigW, sigH + 12, 2, 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...bleu);
    doc.text('Signature du client', clientSigX + 2, y + 6);

    try {
      doc.addImage(devis.signatureClient.dataURL, 'PNG', clientSigX + 2, y + 8, sigW - 4, sigH - 4);
    } catch {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(...gris);
      doc.text('Signature numérique apposée', clientSigX + 2, y + 25);
    }
  }

  y += sigH + 18;

  // ── Pied de page ──────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(...bleu);
    doc.rect(0, 287, pageW, 10, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(
      'ArtisanSafe — Plateforme de mise en relation artisans-clients — Document généré électroniquement',
      pageW / 2,
      293,
      { align: 'center' }
    );
    doc.text(`Page ${i}/${pageCount}`, pageW - marginX, 293, { align: 'right' });
  }

  // ── Téléchargement ────────────────────────────────────────────────
  const fileName = `devis-express-${propositionId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}
