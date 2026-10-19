'use client';

/**
 * Page de modification de devis brouillon
 * Permet de modifier un devis en brouillon et de l'envoyer au client
 */

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { getDevisById, updateDevis } from '@/lib/firebase/devis-service';
import type { Devis, LigneDevis, TVARate, calculerLigne, calculerTotaux } from '@/types/devis';
import { Timestamp } from 'firebase/firestore';

export default function EditDevisPage() {
  const router = useRouter();
  const params = useParams();
  const devisId = params.id as string;
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();

  // États
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [devis, setDevis] = useState<Devis | null>(null);

  // Formulaire
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [lignes, setLignes] = useState<LigneDevis[]>([]);
  const [delaiRealisation, setDelaiRealisation] = useState('');
  const [dateDebutPrevue, setDateDebutPrevue] = useState('');
  const [dateValidite, setDateValidite] = useState(30); // Jours
  const [conditions, setConditions] = useState('');

  /**
   * Charger le devis existant
   */
  useEffect(() => {
    async function loadDevis() {
      if (!devisId || !user) return;

      try {
        setLoading(true);
        const devisData = await getDevisById(devisId);
        
        if (!devisData) {
          alert(t('alerts.devis.notFound'));
          router.push('/artisan/devis');
          return;
        }

        // Vérifier que c'est bien un devis généré
        if (devisData.statut !== 'genere') {
          alert(t('alerts.devis.onlyDraftEditable'));
          router.push('/artisan/devis');
          return;
        }

        // Vérifier que c'est bien le devis de l'artisan connecté
        if (devisData.artisanId !== user.uid) {
          alert(t('alerts.devis.unauthorized'));
          router.push('/artisan/devis');
          return;
        }

        setDevis(devisData);
        
        // Pré-remplir le formulaire
        setTitre(devisData.titre || '');
        setDescription(devisData.description || '');
        setLignes(devisData.lignes || []);
        setDelaiRealisation(devisData.delaiRealisation || '');
        
        if (devisData.dateDebutPrevue) {
          const date = devisData.dateDebutPrevue.toDate();
          setDateDebutPrevue(date.toISOString().split('T')[0]);
        }
        
        // Calculer les jours de validité restants
        if (devisData.dateValidite) {
          const maintenant = new Date();
          const validite = devisData.dateValidite.toDate();
          const joursRestants = Math.max(0, Math.ceil((validite.getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24)));
          setDateValidite(joursRestants);
        }
        
        setConditions(devisData.conditions || '');
        
        // Si aucune ligne, ajouter une ligne vide
        if (!devisData.lignes || devisData.lignes.length === 0) {
          ajouterLigne();
        }

      } catch (error) {
        console.error('Erreur chargement devis:', error);
        alert(t('alerts.devis.loadError'));
        router.push('/artisan/devis');
      } finally {
        setLoading(false);
      }
    }

    loadDevis();
  }, [devisId, user, router]);

  /**
   * Calculer les totaux d'une ligne
   */
  const calculerLigneDevis = (ligne: Omit<LigneDevis, 'totalHT' | 'totalTVA' | 'totalTTC'>): LigneDevis => {
    const totalHT = ligne.quantite * ligne.prixUnitaireHT;
    const totalTVA = totalHT * (ligne.tauxTVA / 100);
    const totalTTC = totalHT + totalTVA;
    
    return {
      ...ligne,
      totalHT: Math.round(totalHT * 100) / 100,
      totalTVA: Math.round(totalTVA * 100) / 100,
      totalTTC: Math.round(totalTTC * 100) / 100,
    };
  };

  /**
   * Calculer les totaux globaux
   */
  const calculerTotauxGlobaux = () => {
    let totalHT = 0;
    const totalTVA: { [key in TVARate]?: number } = {};
    
    lignes.forEach(ligne => {
      totalHT += ligne.totalHT;
      if (!totalTVA[ligne.tauxTVA]) {
        totalTVA[ligne.tauxTVA] = 0;
      }
      totalTVA[ligne.tauxTVA]! += ligne.totalTVA;
    });
    
    const totalTVAGlobal = Object.values(totalTVA).reduce((sum, val) => sum + (val || 0), 0);
    const totalTTC = totalHT + totalTVAGlobal;
    
    return {
      totalHT: Math.round(totalHT * 100) / 100,
      totalTVA,
      totalTVAGlobal: Math.round(totalTVAGlobal * 100) / 100,
      totalTTC: Math.round(totalTTC * 100) / 100,
    };
  };

  /**
   * Ajouter une nouvelle ligne
   */
  const ajouterLigne = () => {
    const nouvelleLigne: LigneDevis = {
      id: `ligne-${Date.now()}-${Math.random()}`,
      description: '',
      quantite: 1,
      unite: 'h',
      prixUnitaireHT: 0,
      tauxTVA: 20,
      totalHT: 0,
      totalTVA: 0,
      totalTTC: 0,
    };
    setLignes([...lignes, nouvelleLigne]);
  };

  /**
   * Modifier une ligne
   */
  const modifierLigne = (index: number, champ: keyof LigneDevis, valeur: any) => {
    const nouvellesLignes = [...lignes];
    (nouvellesLignes[index] as any)[champ] = valeur;
    
    // Recalculer les totaux de cette ligne
    nouvellesLignes[index] = calculerLigneDevis(nouvellesLignes[index]);
    
    setLignes(nouvellesLignes);
  };

  /**
   * Supprimer une ligne
   */
  const supprimerLigne = (index: number) => {
    if (lignes.length === 1) {
      alert(t('alerts.validation.minOneLine'));
      return;
    }
    const nouvellesLignes = lignes.filter((_, i) => i !== index);
    setLignes(nouvellesLignes);
  };

  /**
   * Sauvegarder les modifications (garder en brouillon)
   */
  const sauvegarderBrouillon = async () => {
    if (!devis || !devisId) return;

    setSaving(true);
    try {
      await updateDevis(devisId, {
        titre,
        description,
        lignes,
        totaux: calculerTotauxGlobaux(),
        delaiRealisation,
        ...(dateDebutPrevue && { dateDebutPrevue: Timestamp.fromDate(new Date(dateDebutPrevue)) }),
        dateValidite: Timestamp.fromDate(
          new Date(Date.now() + dateValidite * 24 * 60 * 60 * 1000)
        ),
        conditions,
      });
      
      alert(t('alerts.devis.saveSuccess'));
      router.push('/artisan/devis');
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      alert(t('alerts.devis.saveError'));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Envoyer le devis au client (passe de brouillon à envoyé)
   */
  const envoyerDevis = async () => {
    if (!devis || !devisId) return;
    
    // Validation
    if (!titre.trim()) {
      alert(t('alerts.validation.enterTitle'));
      return;
    }
    if (!dateDebutPrevue) {
      alert(t('alerts.validation.enterDate'));
      return;
    }
    if (lignes.length === 0) {
      alert(t('alerts.validation.addPrestation'));
      return;
    }
    if (lignes.some(l => !l.description.trim() || l.prixUnitaireHT <= 0)) {
      alert(t('alerts.validation.completeLines'));
      return;
    }

    const confirmer = confirm('Êtes-vous sûr de vouloir envoyer ce devis au client ?');
    if (!confirmer) return;

    setSaving(true);
    try {
      await updateDevis(devisId, {
        titre,
        description,
        lignes,
        totaux: calculerTotauxGlobaux(),
        delaiRealisation,
        dateDebutPrevue: Timestamp.fromDate(new Date(dateDebutPrevue)),
        dateValidite: Timestamp.fromDate(
          new Date(Date.now() + dateValidite * 24 * 60 * 60 * 1000)
        ),
        conditions,
        statut: 'envoye', // Changement de statut !
      });
      
      alert(t('alerts.devis.sendSuccess'));
      router.push('/artisan/devis');
    } catch (error) {
      console.error('Erreur envoi:', error);
      alert(t('alerts.devis.sendError'));
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto"></div>
          <p className="mt-4 text-slate-500">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user || !devis) {
    return null;
  }

  const totaux = calculerTotauxGlobaux();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-navy-800 text-white py-8">
        <div className="container mx-auto px-4">
          <button
            onClick={() => router.push('/artisan/devis')}
            className="text-brand-700 hover:underline mb-4"
          >
            ← Retour aux devis
          </button>
          <h1 className="text-3xl font-bold text-navy-800">Modifier le devis {devis.numeroDevis}</h1>
          <p className="text-slate-500 mt-2">
            Client: {devis.client.prenom} {devis.client.nom}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          {/* Titre */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Titre du devis *
            </label>
            <input
              type="text"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              placeholder="Ex: Rénovation salle de bain"
            />
          </div>

          {/* Description */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Description (optionnelle)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              placeholder="Détails complémentaires..."
            />
          </div>

          {/* Lignes de prestation */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Prestations</h3>
              <button
                onClick={ajouterLigne}
                className="bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-800"
              >
                + Ajouter une ligne
              </button>
            </div>

            <div className="space-y-4">
              {lignes.map((ligne, index) => (
                <div key={ligne.id} className="border border-slate-200 rounded-lg p-4">
                  <div className="grid grid-cols-12 gap-4">
                    {/* Description */}
                    <div className="col-span-12 md:col-span-6">
                      <label className="block text-xs text-slate-600 mb-1">Description *</label>
                      <input
                        type="text"
                        value={ligne.description}
                        onChange={(e) => modifierLigne(index, 'description', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                        placeholder="Ex: Remplacement WC"
                      />
                    </div>

                    {/* Quantité */}
                    <div className="col-span-4 md:col-span-2">
                      <label className="block text-xs text-slate-600 mb-1">Quantité</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={ligne.quantite}
                        onChange={(e) => modifierLigne(index, 'quantite', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                      />
                    </div>

                    {/* Unité */}
                    <div className="col-span-4 md:col-span-2">
                      <label className="block text-xs text-slate-600 mb-1">Unité</label>
                      <select
                        value={ligne.unite}
                        onChange={(e) => modifierLigne(index, 'unite', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                      >
                        <option value="h">heure</option>
                        <option value="j">jour</option>
                        <option value="m²">m²</option>
                        <option value="ml">ml</option>
                        <option value="unité">unité</option>
                        <option value="forfait">forfait</option>
                      </select>
                    </div>

                    {/* Prix unitaire HT */}
                    <div className="col-span-4 md:col-span-2">
                      <label className="block text-xs text-slate-600 mb-1">Prix HT (€)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={ligne.prixUnitaireHT}
                        onChange={(e) => modifierLigne(index, 'prixUnitaireHT', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-4 mt-3">
                    {/* TVA */}
                    <div className="col-span-4 md:col-span-2">
                      <label className="block text-xs text-slate-600 mb-1">TVA (%)</label>
                      <select
                        value={ligne.tauxTVA}
                        onChange={(e) => modifierLigne(index, 'tauxTVA', parseFloat(e.target.value) as TVARate)}
                        className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                      >
                        <option value={20}>20%</option>
                        <option value={10}>10%</option>
                        <option value={5.5}>5.5%</option>
                        <option value={0}>0%</option>
                      </select>
                    </div>

                    {/* Total TTC */}
                    <div className="col-span-4 md:col-span-3">
                      <label className="block text-xs text-slate-600 mb-1">Total TTC</label>
                      <div className="px-3 py-2 bg-slate-50 rounded text-sm font-semibold text-slate-800">
                        {ligne.totalTTC.toFixed(2)} €
                      </div>
                    </div>

                    {/* Bouton supprimer */}
                    <div className="col-span-4 md:col-span-2 flex items-end">
                      <button
                        onClick={() => supprimerLigne(index)}
                        className="w-full px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                      >
                        🗑️ Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totaux */}
          <div className="bg-slate-50 rounded-lg p-6 mb-6">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-700">Total HT</span>
                <span className="font-semibold">{totaux.totalHT.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-700">Total TVA</span>
                <span className="font-semibold">{totaux.totalTVAGlobal.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-brand-700 border-t pt-2">
                <span>Total TTC</span>
                <span>{totaux.totalTTC.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          {/* Date de début et délai */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Date de début prévue *
              </label>
              <input
                type="date"
                value={dateDebutPrevue}
                onChange={(e) => setDateDebutPrevue(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Délai de réalisation
              </label>
              <input
                type="text"
                value={delaiRealisation}
                onChange={(e) => setDelaiRealisation(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                placeholder="Ex: 2 semaines"
              />
            </div>
          </div>

          {/* Validité */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Validité du devis (jours)
            </label>
            <input
              type="number"
              min="1"
              value={dateValidite}
              onChange={(e) => setDateValidite(parseInt(e.target.value) || 30)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          {/* Conditions */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Conditions particulières
            </label>
            <textarea
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg"
              placeholder="Acompte, modalités de paiement..."
            />
          </div>

          {/* Boutons d'action */}
          <div className="flex gap-4 justify-end pt-6 border-t">
            <button
              onClick={() => router.push('/artisan/devis')}
              className="px-6 py-3 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
              disabled={saving}
            >
              Annuler
            </button>
            <button
              onClick={sauvegarderBrouillon}
              className="px-6 py-3 bg-slate-500 text-white rounded-lg hover:bg-slate-600"
              disabled={saving}
            >
              {saving ? 'Sauvegarde...' : '💾 Sauvegarder le brouillon'}
            </button>
            <button
              onClick={envoyerDevis}
              className="px-6 py-3 bg-brand-700 text-white rounded-lg hover:bg-brand-800"
              disabled={saving}
            >
              {saving ? 'Envoi...' : '📤 Envoyer au client'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
