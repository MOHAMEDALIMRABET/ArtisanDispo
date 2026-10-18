'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';

// Données des guides de prix
const guidesParCategorie = {
  plomberie: {
    titre: 'Plomberie',
    icone: '🔧',
    couleur: '#3498db',
    guides: [
      {
        titre: 'Remplacer un chauffe-eau',
        prixMin: 300,
        prixMax: 1500,
        duree: '2-4h',
        description: 'Installation d\'un chauffe-eau électrique ou à gaz',
        details: [
          'Dépose ancien chauffe-eau',
          'Installation nouveau chauffe-eau',
          'Raccordement eau et électricité/gaz',
          'Mise en service et vérifications'
        ]
      },
      {
        titre: 'Débouchage canalisation',
        prixMin: 80,
        prixMax: 300,
        duree: '1-2h',
        description: 'Débouchage WC, évier, douche ou baignoire',
        details: [
          'Diagnostic de la panne',
          'Débouchage mécanique ou chimique',
          'Nettoyage des canalisations',
          'Vérification de l\'écoulement'
        ]
      },
      {
        titre: 'Installation robinetterie',
        prixMin: 150,
        prixMax: 500,
        duree: '2-3h',
        description: 'Pose de robinet, mitigeur ou mélangeur',
        details: [
          'Démontage ancien robinet',
          'Installation nouvelle robinetterie',
          'Raccordement et étanchéité',
          'Tests de fonctionnement'
        ]
      },
      {
        titre: 'Rénovation salle de bain',
        prixMin: 3000,
        prixMax: 15000,
        duree: '1-3 semaines',
        description: 'Rénovation complète de salle de bain',
        details: [
          'Dépose équipements existants',
          'Plomberie et évacuations',
          'Carrelage murs et sol',
          'Installation sanitaires et douche/baignoire'
        ]
      }
    ]
  },
  electricite: {
    titre: 'Électricité',
    icone: '💡',
    couleur: '#f39c12',
    guides: [
      {
        titre: 'Refaire tableau électrique',
        prixMin: 800,
        prixMax: 2500,
        duree: '1 journée',
        description: 'Remplacement complet du tableau électrique aux normes',
        details: [
          'Dépose ancien tableau',
          'Installation nouveau tableau (disjoncteurs, différentiels)',
          'Raccordement circuits',
          'Mise en conformité NF C 15-100'
        ]
      },
      {
        titre: 'Installation prises & interrupteurs',
        prixMin: 50,
        prixMax: 150,
        duree: '1-2h',
        description: 'Pose de prises électriques ou interrupteurs',
        details: [
          'Saignées et passage de câbles',
          'Installation boîtiers d\'encastrement',
          'Raccordement électrique',
          'Pose des finitions'
        ]
      },
      {
        titre: 'Installation luminaires',
        prixMin: 80,
        prixMax: 300,
        duree: '1-2h',
        description: 'Pose de luminaires, plafonniers ou spots',
        details: [
          'Câblage électrique',
          'Installation des supports',
          'Raccordement des luminaires',
          'Tests de fonctionnement'
        ]
      },
      {
        titre: 'Mise aux normes complète',
        prixMin: 3000,
        prixMax: 8000,
        duree: '3-7 jours',
        description: 'Remise aux normes électrique d\'un logement',
        details: [
          'Diagnostic électrique',
          'Remplacement tableau',
          'Mise à la terre',
          'Conformité NF C 15-100'
        ]
      }
    ]
  },
  menuiserie: {
    titre: 'Menuiserie',
    icone: '🪚',
    couleur: '#8b4513',
    guides: [
      {
        titre: 'Pose fenêtre PVC',
        prixMin: 500,
        prixMax: 1500,
        duree: '2-4h',
        description: 'Installation d\'une fenêtre PVC double vitrage',
        details: [
          'Dépose ancienne fenêtre',
          'Installation nouvelle fenêtre',
          'Isolation et étanchéité',
          'Finitions intérieur/extérieur'
        ]
      },
      {
        titre: 'Pose porte d\'entrée',
        prixMin: 800,
        prixMax: 3000,
        duree: '3-5h',
        description: 'Installation porte d\'entrée blindée ou standard',
        details: [
          'Dépose ancienne porte',
          'Préparation de l\'ouverture',
          'Installation porte et serrure',
          'Réglages et finitions'
        ]
      },
      {
        titre: 'Parquet flottant',
        prixMin: 25,
        prixMax: 60,
        duree: '1-2 jours',
        description: 'Pose de parquet flottant (prix au m²)',
        details: [
          'Préparation du sol',
          'Pose sous-couche',
          'Installation lames de parquet',
          'Plinthes et finitions'
        ]
      },
      {
        titre: 'Placard sur-mesure',
        prixMin: 500,
        prixMax: 2500,
        duree: '1-2 jours',
        description: 'Création et installation de placard personnalisé',
        details: [
          'Prise de mesures',
          'Fabrication sur-mesure',
          'Installation structure',
          'Portes et aménagements'
        ]
      }
    ]
  },
  maconnerie: {
    titre: 'Maçonnerie',
    icone: '🧱',
    couleur: '#95a5a6',
    guides: [
      {
        titre: 'Construction mur de clôture',
        prixMin: 80,
        prixMax: 200,
        duree: '2-5 jours',
        description: 'Édification d\'un mur de clôture (prix au m²)',
        details: [
          'Fondations',
          'Montage du mur',
          'Joints et finitions',
          'Chaperon de protection'
        ]
      },
      {
        titre: 'Rénovation façade',
        prixMin: 50,
        prixMax: 150,
        duree: '1-2 semaines',
        description: 'Ravalement de façade (prix au m²)',
        details: [
          'Nettoyage haute pression',
          'Réparation fissures',
          'Enduit de façade',
          'Peinture de finition'
        ]
      },
      {
        titre: 'Dalle béton',
        prixMin: 60,
        prixMax: 120,
        duree: '1-3 jours',
        description: 'Coulage dalle béton (prix au m²)',
        details: [
          'Décaissement et terrassement',
          'Coffrage et ferraillage',
          'Coulage du béton',
          'Lissage et finitions'
        ]
      },
      {
        titre: 'Extension maison',
        prixMin: 1500,
        prixMax: 3000,
        duree: '2-6 mois',
        description: 'Agrandissement de maison (prix au m²)',
        details: [
          'Fondations et soubassement',
          'Élévation des murs',
          'Charpente et toiture',
          'Second œuvre (plomberie, électricité)'
        ]
      }
    ]
  },
  peinture: {
    titre: 'Peinture',
    icone: '🎨',
    couleur: '#e74c3c',
    guides: [
      {
        titre: 'Peinture murs et plafonds',
        prixMin: 20,
        prixMax: 45,
        duree: '1-3 jours',
        description: 'Peinture intérieure murs et plafonds (prix au m²)',
        details: [
          'Préparation des surfaces',
          'Application sous-couche',
          'Deux couches de peinture',
          'Protection et nettoyage'
        ]
      },
      {
        titre: 'Pose papier peint',
        prixMin: 25,
        prixMax: 60,
        duree: '1-2 jours',
        description: 'Pose de papier peint ou tapisserie (prix au m²)',
        details: [
          'Préparation des murs',
          'Encollage',
          'Pose du papier peint',
          'Découpes et finitions'
        ]
      },
      {
        titre: 'Peinture façade extérieure',
        prixMin: 30,
        prixMax: 80,
        duree: '3-7 jours',
        description: 'Peinture ravalement façade (prix au m²)',
        details: [
          'Nettoyage haute pression',
          'Traitement anti-mousse',
          'Application peinture spéciale façade',
          'Finitions et retouches'
        ]
      },
      {
        titre: 'Peinture volets et menuiseries',
        prixMin: 100,
        prixMax: 300,
        duree: '1-2 jours',
        description: 'Remise en peinture volets et menuiseries bois',
        details: [
          'Décapage ou ponçage',
          'Application sous-couche bois',
          'Deux couches de peinture',
          'Vernis de protection'
        ]
      }
    ]
  },
  toiture: {
    titre: 'Toiture',
    icone: '🏠',
    couleur: '#34495e',
    guides: [
      {
        titre: 'Réfection toiture complète',
        prixMin: 100,
        prixMax: 250,
        duree: '1-3 semaines',
        description: 'Rénovation complète de toiture (prix au m²)',
        details: [
          'Dépose ancienne couverture',
          'Vérification charpente',
          'Pose nouvelle couverture (tuiles/ardoises)',
          'Isolation et évacuation des eaux'
        ]
      },
      {
        titre: 'Nettoyage et démoussage toiture',
        prixMin: 15,
        prixMax: 35,
        duree: '1-2 jours',
        description: 'Nettoyage professionnel toiture (prix au m²)',
        details: [
          'Nettoyage haute pression',
          'Traitement anti-mousse',
          'Application hydrofuge',
          'Inspection couverture'
        ]
      },
      {
        titre: 'Installation gouttières',
        prixMin: 30,
        prixMax: 80,
        duree: '1-2 jours',
        description: 'Pose de gouttières et descentes (prix au mètre linéaire)',
        details: [
          'Dépose anciennes gouttières',
          'Installation nouvelles gouttières PVC/zinc',
          'Raccordement descentes',
          'Évacuation eaux pluviales'
        ]
      },
      {
        titre: 'Réparation fuite toiture',
        prixMin: 200,
        prixMax: 800,
        duree: '2-5h',
        description: 'Recherche et réparation de fuite sur toiture',
        details: [
          'Diagnostic et localisation fuite',
          'Remplacement tuiles/ardoises',
          'Réparation zinguerie',
          'Test d\'étanchéité'
        ]
      }
    ]
  },
  chauffage: {
    titre: 'Chauffage',
    icone: '🔥',
    couleur: '#e67e22',
    guides: [
      {
        titre: 'Installation chaudière gaz',
        prixMin: 2500,
        prixMax: 6000,
        duree: '1-2 jours',
        description: 'Pose chaudière à condensation gaz',
        details: [
          'Dépose ancienne chaudière',
          'Installation nouvelle chaudière',
          'Raccordement gaz et eau',
          'Mise en service et réglages'
        ]
      },
      {
        titre: 'Pose radiateurs',
        prixMin: 200,
        prixMax: 600,
        duree: '2-4h',
        description: 'Installation radiateur eau chaude ou électrique',
        details: [
          'Fixation murale',
          'Raccordement hydraulique ou électrique',
          'Purge et essais',
          'Thermostat si électrique'
        ]
      },
      {
        titre: 'Pompe à chaleur air/eau',
        prixMin: 8000,
        prixMax: 16000,
        duree: '2-4 jours',
        description: 'Installation complète PAC air/eau',
        details: [
          'Installation unité extérieure',
          'Installation ballon tampon',
          'Raccordements hydrauliques',
          'Programmation et mise en service'
        ]
      },
      {
        titre: 'Entretien chaudière',
        prixMin: 80,
        prixMax: 150,
        duree: '1-2h',
        description: 'Révision annuelle obligatoire chaudière',
        details: [
          'Nettoyage brûleur et corps de chauffe',
          'Vérification sécurités',
          'Contrôle combustion',
          'Attestation d\'entretien'
        ]
      }
    ]
  },
  climatisation: {
    titre: 'Climatisation',
    icone: '❄️',
    couleur: '#3498db',
    guides: [
      {
        titre: 'Climatisation mono-split',
        prixMin: 1200,
        prixMax: 2500,
        duree: '4-6h',
        description: 'Installation climatiseur mono-split (1 pièce)',
        details: [
          'Installation unité extérieure',
          'Installation unité intérieure',
          'Liaisons frigorifiques',
          'Mise en service et réglages'
        ]
      },
      {
        titre: 'Climatisation multi-split',
        prixMin: 3500,
        prixMax: 7000,
        duree: '1-2 jours',
        description: 'Installation clim multi-split (2-4 pièces)',
        details: [
          'Installation 1 unité extérieure',
          'Installation 2-4 unités intérieures',
          'Liaisons frigorifiques',
          'Programmation et mise en service'
        ]
      },
      {
        titre: 'Climatisation réversible',
        prixMin: 1500,
        prixMax: 3000,
        duree: '4-6h',
        description: 'Installation clim réversible (chaud/froid)',
        details: [
          'Pose unités intérieure/extérieure',
          'Raccordements électriques',
          'Mise en service mode chaud et froid',
          'Formation utilisation'
        ]
      },
      {
        titre: 'Entretien climatisation',
        prixMin: 100,
        prixMax: 200,
        duree: '1h',
        description: 'Maintenance annuelle climatiseur',
        details: [
          'Nettoyage filtres',
          'Vérification fluide frigorigène',
          'Contrôle performances',
          'Désinfection unité intérieure'
        ]
      }
    ]
  },
  carrelage: {
    titre: 'Carrelage',
    icone: '🏺',
    couleur: '#d35400',
    guides: [
      {
        titre: 'Carrelage sol',
        prixMin: 35,
        prixMax: 80,
        duree: '2-4 jours',
        description: 'Pose carrelage au sol (prix au m²)',
        details: [
          'Préparation support',
          'Traçage et calepinage',
          'Pose carreaux avec colle',
          'Jointoiement'
        ]
      },
      {
        titre: 'Faïence murs salle de bain',
        prixMin: 40,
        prixMax: 90,
        duree: '2-3 jours',
        description: 'Pose faïence murale salle de bain (prix au m²)',
        details: [
          'Préparation murs',
          'Pose carreaux muraux',
          'Découpes robinetterie',
          'Joints silicone'
        ]
      },
      {
        titre: 'Terrasse carrelage extérieur',
        prixMin: 50,
        prixMax: 120,
        duree: '3-7 jours',
        description: 'Carrelage terrasse extérieure (prix au m²)',
        details: [
          'Préparation dalle béton',
          'Pose carrelage extérieur antidérapant',
          'Joints large',
          'Évacuation eaux'
        ]
      },
      {
        titre: 'Mosaïque décor',
        prixMin: 60,
        prixMax: 150,
        duree: '1-2 jours',
        description: 'Pose mosaïque décorative (prix au m²)',
        details: [
          'Préparation support',
          'Pose plaques mosaïque',
          'Découpes précises',
          'Jointoiement fin'
        ]
      }
    ]
  },
  charpente: {
    titre: 'Charpente',
    icone: '🪵',
    couleur: '#8b4513',
    guides: [
      {
        titre: 'Charpente traditionnelle',
        prixMin: 80,
        prixMax: 150,
        duree: '1-3 semaines',
        description: 'Création charpente bois traditionnelle (prix au m²)',
        details: [
          'Fabrication sur-mesure',
          'Levage et assemblage',
          'Contreventement',
          'Traitement insecticide et fongicide'
        ]
      },
      {
        titre: 'Charpente fermettes',
        prixMin: 50,
        prixMax: 90,
        duree: '1-2 semaines',
        description: 'Pose fermettes industrielles (prix au m²)',
        details: [
          'Livraison fermettes',
          'Levage et pose',
          'Contreventement métallique',
          'Anti-flambement'
        ]
      },
      {
        titre: 'Traitement charpente',
        prixMin: 25,
        prixMax: 50,
        duree: '1-2 jours',
        description: 'Traitement curatif/préventif charpente (prix au m²)',
        details: [
          'Brossage et dépoussiérage',
          'Application produit insecticide',
          'Application fongicide',
          'Garantie décennale traitement'
        ]
      },
      {
        titre: 'Aménagement combles',
        prixMin: 800,
        prixMax: 1500,
        duree: '2-6 semaines',
        description: 'Aménagement complet combles (prix au m²)',
        details: [
          'Renforcement charpente',
          'Création plancher',
          'Isolation et cloisonnement',
          'Fenêtres de toit'
        ]
      }
    ]
  },
  serrurerie: {
    titre: 'Serrurerie',
    icone: '🔐',
    couleur: '#7f8c8d',
    guides: [
      {
        titre: 'Changement serrure',
        prixMin: 100,
        prixMax: 300,
        duree: '1-2h',
        description: 'Remplacement serrure simple ou multipoint',
        details: [
          'Dépose ancienne serrure',
          'Installation nouvelle serrure',
          'Réglages et ajustements',
          'Remise de clés (3-5 exemplaires)'
        ]
      },
      {
        titre: 'Blindage porte',
        prixMin: 800,
        prixMax: 2000,
        duree: '4-6h',
        description: 'Blindage de porte existante avec serrure 3 points',
        details: [
          'Pose tôle blindage',
          'Installation serrure 3 points A2P',
          'Cornières anti-pince',
          'Certification assurance'
        ]
      },
      {
        titre: 'Ouverture porte claquée',
        prixMin: 80,
        prixMax: 150,
        duree: '15-30 min',
        description: 'Intervention urgence porte claquée (non blindée)',
        details: [
          'Diagnostic rapide',
          'Ouverture sans casse',
          'Vérification serrure',
          'Conseils prévention'
        ]
      },
      {
        titre: 'Porte blindée complète',
        prixMin: 1500,
        prixMax: 4000,
        duree: '4-8h',
        description: 'Installation porte blindée certifiée A2P',
        details: [
          'Dépose ancienne porte',
          'Installation bloc-porte blindé',
          'Serrure multipoint A2P BP1/BP2/BP3',
          'Certification assurance'
        ]
      }
    ]
  }
};

export default function GuidesPrixPage() {
  const [categorieActive, setCategorieActive] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero Section */}
      <div className=" bg-navy-800 text-white py-16">
        <div className="container mx-auto px-4">
          <h1 className="text-5xl font-bold mb-4 text-center">Guides des prix</h1>
          <p className="text-xl text-slate-200 max-w-3xl mx-auto text-center">
            Seriez-vous intéressé par des informations sur le prix concernant vos travaux ? Consultez nos guides détaillés.
          </p>
        </div>
      </div>

      {/* Navigation catégories */}
      <div className="bg-white shadow-md py-6 sticky top-16 z-40">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap justify-center gap-4">
            {Object.entries(guidesParCategorie).map(([key, categorie]) => (
              <button
                key={key}
                onClick={() => setCategorieActive(categorieActive === key ? null : key)}
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  categorieActive === key
                    ? 'bg-brand-700 text-white shadow-lg scale-105'
                    : 'bg-slate-100 text-navy-800 hover:bg-slate-200'
                }`}
              >
                <span className="mr-2 text-xl">{categorie.icone}</span>
                {categorie.titre}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Guides de prix */}
      <main className="container mx-auto px-4 py-12">
        {categorieActive ? (
          // Vue détaillée d'une catégorie
          <div>
            <div className="mb-8 text-center">
              <h2 className="text-4xl font-bold text-navy-800 mb-2">
                {guidesParCategorie[categorieActive as keyof typeof guidesParCategorie].icone}{' '}
                {guidesParCategorie[categorieActive as keyof typeof guidesParCategorie].titre}
              </h2>
              <p className="text-slate-500">
                {guidesParCategorie[categorieActive as keyof typeof guidesParCategorie].guides.length} guides disponibles
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {guidesParCategorie[categorieActive as keyof typeof guidesParCategorie].guides.map((guide, index) => (
                <Card key={index} className="p-6 hover:shadow-md transition-shadow">
                  <h3 className="text-2xl font-bold text-navy-800 mb-4">{guide.titre}</h3>
                  
                  {/* Prix */}
                  <div className=" bg-brand-600 text-white p-4 rounded-lg mb-4">
                    <p className="text-sm opacity-90 mb-1">Prix estimé</p>
                    <p className="text-3xl font-bold">
                      {guide.prixMin}€ - {guide.prixMax}€
                    </p>
                    <p className="text-sm opacity-90 mt-1">Durée: {guide.duree}</p>
                  </div>

                  {/* Description */}
                  <p className="text-slate-500 mb-4">{guide.description}</p>

                  {/* Détails */}
                  <div className="space-y-2">
                    <p className="font-semibold text-navy-800">Inclus dans la prestation :</p>
                    {guide.details.map((detail, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-green-500 mt-1">✓</span>
                        <span className="text-sm text-slate-500">{detail}</span>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <Link
                      href="/inscription?role=client"
                      className="block w-full text-center bg-brand-700 text-white py-3 rounded-lg hover:bg-brand-800 transition-colors font-medium"
                    >
                      Demander des devis gratuitement
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          // Vue globale de toutes les catégories
          <div className="space-y-12">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-navy-800 mb-4">
                Sélectionnez votre type de travaux
              </h2>
              <p className="text-slate-500 max-w-2xl mx-auto">
                Cliquez sur une catégorie pour consulter les guides de prix détaillés
              </p>
            </div>

            {/* Aperçu de chaque catégorie */}
            {Object.entries(guidesParCategorie).map(([key, categorie]) => (
              <div key={key} className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-3xl font-bold text-navy-800">
                    <span className="mr-3 text-4xl">{categorie.icone}</span>
                    {categorie.titre}
                  </h3>
                  <button
                    onClick={() => setCategorieActive(key)}
                    className="bg-brand-700 text-white px-6 py-2 rounded-lg hover:bg-brand-800 transition-colors font-medium"
                  >
                    Voir tous les guides
                  </button>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {categorie.guides.map((guide, index) => (
                    <div
                      key={index}
                      className="border border-slate-200 rounded-lg p-4 hover:border-brand-500 hover:shadow-md transition-all cursor-pointer"
                      onClick={() => setCategorieActive(key)}
                    >
                      <p className="font-semibold text-navy-800 mb-2 text-sm">{guide.titre}</p>
                      <p className="text-2xl font-bold text-brand-700">
                        {guide.prixMin}€ - {guide.prixMax}€
                      </p>
                      <p className="text-xs text-slate-500 mt-1">{guide.duree}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Section informative */}
      <div className="bg-white py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-navy-800 mb-8 text-center">
              💡 Bon à savoir
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-6">
                <h3 className="text-xl font-bold text-navy-800 mb-3">
                  📊 Prix indicatifs
                </h3>
                <p className="text-slate-500 text-sm">
                  Les prix affichés sont des estimations moyennes en France. Le coût réel peut varier
                  selon votre localisation, la complexité du projet et les finitions choisies.
                </p>
              </Card>

              <Card className="p-6">
                <h3 className="text-xl font-bold text-navy-800 mb-3">
                  ✅ Artisans vérifiés
                </h3>
                <p className="text-slate-500 text-sm">
                  Tous nos artisans sont vérifiés (KBIS, assurances). Ils vous fourniront
                  des devis détaillés et personnalisés pour votre projet.
                </p>
              </Card>

              <Card className="p-6">
                <h3 className="text-xl font-bold text-navy-800 mb-3">
                  💰 Commission transparente
                </h3>
                <p className="text-slate-500 text-sm">
                  ArtisanDispo prend 8% de commission sur les devis classiques et 10% sur les demandes express (la plus basse du marché).
                  Les prix ne sont jamais gonflés - vous payez le juste prix.
                </p>
              </Card>

              <Card className="p-6">
                <h3 className="text-xl font-bold text-navy-800 mb-3">
                  📅 Devis gratuits
                </h3>
                <p className="text-slate-500 text-sm">
                  Recevez plusieurs devis gratuits et sans engagement. Comparez et choisissez
                  l'artisan qui correspond le mieux à vos besoins.
                </p>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Bottom */}
      <div className=" bg-brand-600 text-white py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-4">Prêt à lancer vos travaux ?</h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto">
            Publiez votre projet gratuitement et recevez des devis d'artisans vérifiés
          </p>
          <Link
            href="/inscription?role=client"
            className="inline-block bg-white text-brand-700 px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-100 transition-colors shadow-sm border border-slate-200"
          >
            Demander des devis gratuitement
          </Link>
        </div>
      </div>
    </div>
  );
}
