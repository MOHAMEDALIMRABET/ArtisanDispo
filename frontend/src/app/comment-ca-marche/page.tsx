'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { Card } from '@/components/ui/Card';

export default function CommentCaMarchePage() {
  const router = useRouter();
  const [stats, setStats] = useState({ artisans: 0, devis: 0, projets: 0 });

  // Animation des chiffres
  useEffect(() => {
    const targetStats = { artisans: 247, devis: 1892, projets: 734 };
    const duration = 2000;
    const steps = 50;
    const interval = duration / steps;

    let currentStep = 0;
    const timer = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      
      setStats({
        artisans: Math.floor(targetStats.artisans * progress),
        devis: Math.floor(targetStats.devis * progress),
        projets: Math.floor(targetStats.projets * progress),
      });

      if (currentStep >= steps) {
        clearInterval(timer);
        setStats(targetStats);
      }
    }, interval);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-white ">
      {/* Hero Section Modernisée */}
      <div className="relative bg-navy-800 text-white overflow-hidden">
        {/* Pattern de fond */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }}></div>
        </div>

        <div className="container mx-auto px-4 py-20 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-block bg-brand-700 px-4 py-2 rounded-full text-sm font-semibold mb-6 animate-pulse">
              🚀 La plateforme #1 des artisans disponibles
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold mb-6 leading-tight">
              Comment engager<br />
              <span className="text-brand-400">le bon artisan ?</span>
            </h1>
            <p className="text-xl md:text-2xl text-slate-300 mb-10 max-w-3xl mx-auto leading-relaxed">
              Publiez votre projet gratuitement et soyez mis en relation avec des artisans vérifiés qui réaliseront vos travaux.
            </p>

            {/* Stats en temps réel */}
            <div className="grid md:grid-cols-3 gap-6 mb-10">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/20 transition-all">
                <div className="text-4xl font-bold text-brand-400 mb-2">{stats.artisans}+</div>
                <div className="text-sm text-slate-300">Artisans disponibles</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/20 transition-all">
                <div className="text-4xl font-bold text-brand-400 mb-2">{stats.devis}</div>
                <div className="text-sm text-slate-300">Devis envoyés ce mois</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/20 transition-all">
                <div className="text-4xl font-bold text-brand-400 mb-2">{stats.projets}</div>
                <div className="text-sm text-slate-300">Projets réalisés</div>
              </div>
            </div>

            {/* CTA Principal */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={() => router.push('/inscription?role=client')}
                className="!bg-brand-700 hover:!bg-brand-800 !text-white text-lg px-10 py-4 shadow-md hover:shadow-lg transform hover:scale-105 transition-all"
              >
                Publiez votre projet gratuitement
              </Button>
              <Button
                onClick={() => router.push('/inscription?role=artisan')}
                className="!bg-white !text-navy-800 hover:!bg-slate-100 text-lg px-10 py-4 shadow-md transform hover:scale-105 transition-all"
              >
                Professionnels, inscrivez-vous gratuitement
              </Button>
            </div>
          </div>
        </div>

        {/* Vague décorative */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0,64L80,69.3C160,75,320,85,480,80C640,75,800,53,960,48C1120,43,1280,53,1360,58.7L1440,64L1440,120L1360,120C1280,120,1120,120,960,120C800,120,640,120,480,120C320,120,160,120,80,120L0,120Z" fill="#F8F9FA"/>
          </svg>
        </div>
      </div>

      <main className="container mx-auto px-4 py-16">
        {/* Section Différenciateurs */}
        <section className="mb-24">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-navy-800 mb-4">
              Pourquoi ArtisanDispo est <span className="text-brand-700">la solution fiable</span>
            </h2>
            <p className="text-xl text-slate-500 max-w-2xl mx-auto">
              Maison ou jardin, petits ou grands travaux : publiez votre projet et soyez mis en relation avec des artisans vérifiés.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <div className="relative group">
              <div className="absolute inset-0 bg-brand-600 rounded-2xl blur-sm opacity-25 group-hover:opacity-50 transition-opacity"></div>
              <Card className="relative p-8 text-center hover:shadow-lg transition-all transform group-hover:-translate-y-2">
                <div className="text-6xl mb-4">💰</div>
                <h3 className="text-2xl font-bold text-navy-800 mb-3">
                  Commission dès 8%
                </h3>
                <p className="text-slate-500 mb-4">
                  La commission la plus basse du marché. Pas d'abonnement caché.<br/>
                  <span className="text-sm">8% sur devis classiques · 10% sur express</span>
                </p>
                <div className="text-sm text-green-700 font-semibold">
                  vs 15% chez les concurrents
                </div>
              </Card>
            </div>

            <div className="relative group">
              <div className="absolute inset-0 bg-navy-800 rounded-2xl blur-sm opacity-25 group-hover:opacity-50 transition-opacity"></div>
              <Card className="relative p-8 text-center hover:shadow-lg transition-all transform group-hover:-translate-y-2">
                <div className="text-6xl mb-4">📅</div>
                <h3 className="text-2xl font-bold text-navy-800 mb-3">
                  Matching par disponibilité
                </h3>
                <p className="text-slate-500 mb-4">
                  Algorithme intelligent basé sur l'agenda réel des artisans
                </p>
                <div className="text-sm text-sky-700 font-semibold">
                  Artisans disponibles = moins d'attente
                </div>
              </Card>
            </div>

            <div className="relative group">
              <div className="absolute inset-0 bg-green-700 rounded-2xl blur-sm opacity-25 group-hover:opacity-50 transition-opacity"></div>
              <Card className="relative p-8 text-center hover:shadow-lg transition-all transform group-hover:-translate-y-2">
                <div className="text-6xl mb-4">✅</div>
                <h3 className="text-2xl font-bold text-navy-800 mb-3">
                  Vérification OCR automatique
                </h3>
                <p className="text-slate-500 mb-4">
                  Extraction automatique KBIS + validation admin manuelle
                </p>
                <div className="text-sm text-green-700 font-semibold">
                  Double sécurité maximale
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* Pour les Particuliers - Design moderne */}
        <section className="mb-24">
          <div className="bg-brand-600 rounded-2xl p-12 text-white mb-12">
            <div className="text-center max-w-3xl mx-auto">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                Comment engager le bon artisan
              </h2>
              <p className="text-xl opacity-90">
                Publiez gratuitement et recevez des propositions d'artisans disponibles
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto relative">
            {/* Ligne de connexion entre les étapes */}
            <div className="hidden md:block absolute top-16 left-1/6 right-1/6 h-1 bg-brand-600 opacity-30"></div>

            {/* Étape 1 */}
            <div className="relative">
              <Card className="p-8 text-center hover:shadow-lg transition-all border-2 border-transparent hover:border-brand-500">
                <div className="relative inline-block mb-6">
                  <div className="absolute inset-0 bg-brand-700 rounded-full blur-lg opacity-30 animate-pulse"></div>
                  <div className="relative bg-brand-600 text-white rounded-full w-24 h-24 flex items-center justify-center text-4xl font-bold shadow-md">
                    1
                  </div>
                </div>
                <div className="inline-block bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-bold mb-4">
                  ÉTAPE 1
                </div>
                <h3 className="text-2xl font-bold text-navy-800 mb-4">
                  Publiez votre projet gratuitement
                </h3>
                <p className="text-slate-500 mb-6 leading-relaxed">
                  Type de travaux, localisation, dates souhaitées et budget indicatif
                </p>
                <div className="bg-brand-50 border-l-4 border-brand-500 p-4 rounded-lg text-left">
                  <p className="text-sm font-semibold text-brand-700 mb-2">💡 Exemple</p>
                  <p className="text-sm text-slate-500">
                    "Rénovation cuisine 15m², Paris 18e, flexible ±5 jours, budget 8000€"
                  </p>
                </div>
              </Card>
            </div>

            {/* Étape 2 */}
            <div className="relative">
              <Card className="p-8 text-center hover:shadow-lg transition-all border-2 border-transparent hover:border-brand-500">
                <div className="relative inline-block mb-6">
                  <div className="absolute inset-0 bg-brand-700 rounded-full blur-lg opacity-30 animate-pulse"></div>
                  <div className="relative bg-brand-600 text-white rounded-full w-24 h-24 flex items-center justify-center text-4xl font-bold shadow-md">
                    2
                  </div>
                </div>
                <div className="inline-block bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-bold mb-4">
                  ÉTAPE 2
                </div>
                <h3 className="text-2xl font-bold text-navy-800 mb-4">
                  Les artisans vous répondent
                </h3>
                <p className="text-slate-500 mb-6 leading-relaxed">
                  Consultez les profils des artisans, leurs avis clients et parcourez les photos de leurs réalisations.
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm bg-green-50 p-3 rounded-lg">
                    <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-green-700 font-medium">KBIS + Assurances vérifiées</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm bg-blue-50 p-3 rounded-lg">
                    <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="text-sky-700 font-medium">Avis clients authentiques</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm bg-orange-50 p-3 rounded-lg">
                    <svg className="w-5 h-5 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                    <span className="text-brand-700 font-medium">Disponibilité confirmée</span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Étape 3 */}
            <div className="relative">
              <Card className="p-8 text-center hover:shadow-lg transition-all border-2 border-transparent hover:border-brand-500">
                <div className="relative inline-block mb-6">
                  <div className="absolute inset-0 bg-brand-700 rounded-full blur-lg opacity-30 animate-pulse"></div>
                  <div className="relative bg-brand-600 text-white rounded-full w-24 h-24 flex items-center justify-center text-4xl font-bold shadow-md">
                    3
                  </div>
                </div>
                <div className="inline-block bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-bold mb-4">
                  ÉTAPE 3
                </div>
                <h3 className="text-2xl font-bold text-navy-800 mb-4">
                  Engagez en toute confiance
                </h3>
                <p className="text-slate-500 mb-6 leading-relaxed">
                  ArtisanDispo vérifie les informations des artisans lors de leur inscription. Vous pouvez ainsi engager un artisan en toute confiance.
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-left">
                    <span className="text-2xl">🔒</span>
                    <span className="text-slate-500"><strong>Paiement sécurisé</strong> Stripe</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-left">
                    <span className="text-2xl">💬</span>
                    <span className="text-slate-500"><strong>Messagerie</strong> intégrée</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-left">
                    <span className="text-2xl">📸</span>
                    <span className="text-slate-500"><strong>Photos</strong> avant/après</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-left">
                    <span className="text-2xl">⭐</span>
                    <span className="text-slate-500"><strong>Avis</strong> après travaux</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          <div className="text-center mt-12">
            <Button
              onClick={() => router.push('/inscription?role=client')}
              className="!bg-brand-600 hover:!bg-brand-700 !text-white text-xl px-12 py-5 shadow-lg transform hover:scale-105 transition-all"
            >
              Publiez votre projet
            </Button>
            <p className="text-sm text-slate-500 mt-4">
              Sans engagement • Gratuit • Réponse en 24h
            </p>
          </div>
        </section>

        {/* Séparateur élégant */}
        <div className="my-24">
          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent"></div>
        </div>

        {/* Pour les Artisans */}
        <section className="mb-24">
          <div className="bg-navy-800 rounded-2xl p-12 text-white mb-12">
            <div className="text-center max-w-3xl mx-auto">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                Vous cherchez des chantiers ?
              </h2>
              <p className="text-xl opacity-90">
                Développez votre activité avec ArtisanDispo
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Étape 1 Artisan */}
            <Card className="p-8 hover:shadow-lg transition-all border-2 border-transparent hover:border-navy-800">
              <div className="bg-navy-800 text-white rounded-full w-20 h-20 flex items-center justify-center text-3xl font-bold mx-auto mb-6 shadow-md">
                1
              </div>
              <h3 className="text-2xl font-bold text-navy-800 mb-4 text-center">
                Inscrivez-vous gratuitement
              </h3>
              <ul className="space-y-3 text-slate-500">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1 flex-shrink-0">✓</span>
                  <span>Ajoutez vos métiers et zones d'intervention</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1 flex-shrink-0">✓</span>
                  <span>Uploadez vos documents (KBIS, assurances)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1 flex-shrink-0">✓</span>
                  <span>Présentez vos réalisations (photos)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1 flex-shrink-0">✓</span>
                  <span>Définissez vos disponibilités</span>
                </li>
              </ul>
              <div className="mt-6 bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-sky-700 font-semibold">
                  ⚡ Validation en 24-48h
                </p>
              </div>
            </Card>

            {/* Étape 2 Artisan */}
            <Card className="p-8 hover:shadow-lg transition-all border-2 border-transparent hover:border-navy-800">
              <div className="bg-navy-800 text-white rounded-full w-20 h-20 flex items-center justify-center text-3xl font-bold mx-auto mb-6 shadow-md">
                2
              </div>
              <h3 className="text-2xl font-bold text-navy-800 mb-4 text-center">
                Recevez des demandes
              </h3>
              <div className="space-y-4">
                <div className="bg-orange-50 border-l-4 border-brand-500 p-4 rounded-lg">
                  <p className="text-sm font-semibold text-brand-700 mb-2">
                    🎯 Matching intelligent
                  </p>
                  <p className="text-sm text-slate-500">
                    Notre algorithme ne vous envoie QUE les demandes qui correspondent 
                    à vos compétences, disponibilités et zone géographique
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-lg">✅</span>
                    <span className="text-slate-500">Pas de spam</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-lg">✅</span>
                    <span className="text-slate-500">Notifications instantanées</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-lg">✅</span>
                    <span className="text-slate-500">Clients sérieux et vérifiés</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Étape 3 Artisan */}
            <Card className="p-8 hover:shadow-lg transition-all border-2 border-transparent hover:border-navy-800">
              <div className="bg-navy-800 text-white rounded-full w-20 h-20 flex items-center justify-center text-3xl font-bold mx-auto mb-6 shadow-md">
                3
              </div>
              <h3 className="text-2xl font-bold text-navy-800 mb-4 text-center">
                Envoyez vos devis
              </h3>
              <div className="space-y-4">
                <ul className="space-y-3 text-slate-500">
                  <li className="flex items-start gap-2">
                    <span className="text-brand-700 text-lg flex-shrink-0">📄</span>
                    <span>Outil de création de devis intégré</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-brand-700 text-lg flex-shrink-0">📅</span>
                    <span>Calendrier de gestion de planning</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-brand-700 text-lg flex-shrink-0">💰</span>
                    <span>Paiement sécurisé et rapide</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-brand-700 text-lg flex-shrink-0">⚖️</span>
                    <span>Médiation en cas de litige</span>
                  </li>
                </ul>
                <div className="mt-6 bg-green-50 p-4 rounded-lg">
                  <p className="text-sm font-semibold text-green-700 mb-1">
                    💰 Commission dès 8%
                  </p>
                  <p className="text-xs text-slate-500">
                    8% devis classiques · 10% express • La plus basse du marché
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <div className="text-center mt-12">
            <Button
              onClick={() => router.push('/inscription?role=artisan')}
              className="!bg-navy-800 hover:!bg-navy-900 !text-white text-xl px-12 py-5 shadow-lg transform hover:scale-105 transition-all"
            >
              Professionnels, inscrivez-vous gratuitement
            </Button>
            <p className="text-sm text-slate-500 mt-4">
              Gratuit • Sans abonnement • Commission dès 8%
            </p>
          </div>
        </section>

        {/* Section Sécurité & Confiance */}
        <section className="mb-24">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12">
            <h2 className="text-4xl font-bold text-center text-navy-800 mb-12">
              Pourquoi choisir ArtisanDispo ?
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="text-center group">
                <div className="bg-green-100 w-24 h-24 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform shadow-lg">
                  <span className="text-5xl">✓</span>
                </div>
                <h3 className="font-bold text-navy-800 mb-2 text-lg">Artisans vérifiés</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  SIRET, assurances, RC Pro et garantie décennale validés par nos équipes
                </p>
              </div>
              <div className="text-center group">
                <div className="bg-blue-100 w-24 h-24 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform shadow-lg">
                  <span className="text-5xl">🔒</span>
                </div>
                <h3 className="font-bold text-navy-800 mb-2 text-lg">Paiement sécurisé</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Stripe avec système de séquestre - argent libéré après validation travaux
                </p>
              </div>
              <div className="text-center group">
                <div className="bg-purple-100 w-24 h-24 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform shadow-lg">
                  <span className="text-5xl">⚖️</span>
                </div>
                <h3 className="font-bold text-navy-800 mb-2 text-lg">Médiation gratuite</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Service de médiation pour résoudre les litiges de manière équitable
                </p>
              </div>
              <div className="text-center group">
                <div className="bg-yellow-100 w-24 h-24 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform shadow-lg">
                  <span className="text-5xl">⭐</span>
                </div>
                <h3 className="font-bold text-navy-800 mb-2 text-lg">Avis certifiés</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Uniquement des avis de clients ayant réalisé des travaux sur la plateforme
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Revisitée */}
        <section className="mb-24">
          <h2 className="text-4xl font-bold text-center text-navy-800 mb-12">
            Questions fréquentes
          </h2>
          <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
            <Card className="p-6 hover:shadow-md transition-all border-l-4 border-brand-500">
              <h3 className="font-bold text-navy-800 mb-3 text-lg flex items-center gap-2">
                <span className="text-2xl">💰</span>
                Combien ça coûte ?
              </h3>
              <p className="text-slate-500">
                <strong className="text-green-700">Particuliers : 0€</strong> - Mise en relation gratuite<br/>
                <strong className="text-brand-700">Artisans : dès 8%</strong> - 8% sur devis classiques, 10% sur demandes express
              </p>
            </Card>

            <Card className="p-6 hover:shadow-md transition-all border-l-4 border-navy-800">
              <h3 className="font-bold text-navy-800 mb-3 text-lg flex items-center gap-2">
                <span className="text-2xl">⏱️</span>
                Combien de temps ça prend ?
              </h3>
              <p className="text-slate-500">
                Publication en <strong>2 min</strong> • Premiers devis sous <strong>24h</strong> • 
                Matching instantané avec artisans disponibles
              </p>
            </Card>

            <Card className="p-6 hover:shadow-md transition-all border-l-4 border-green-600">
              <h3 className="font-bold text-navy-800 mb-3 text-lg flex items-center gap-2">
                <span className="text-2xl">✅</span>
                Comment sont vérifiés les artisans ?
              </h3>
              <p className="text-slate-500">
                OCR automatique du KBIS + validation manuelle admin. Vérification SIRET, 
                assurances RC Pro et décennale avant approbation
              </p>
            </Card>

            <Card className="p-6 hover:shadow-md transition-all border-l-4 border-sky-600">
              <h3 className="font-bold text-navy-800 mb-3 text-lg flex items-center gap-2">
                <span className="text-2xl">🔒</span>
                Le paiement est-il sécurisé ?
              </h3>
              <p className="text-slate-500">
                Paiement via Stripe (leader mondial). Argent en séquestre, 
                libéré uniquement après validation des travaux terminés
              </p>
            </Card>
          </div>
        </section>

        {/* CTA Final Premium */}
        <section className="text-center">
          <div className="bg-brand-600 rounded-2xl p-12 md:p-16 text-white shadow-lg relative overflow-hidden">
            {/* Pattern de fond */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute inset-0" style={{
                backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
                backgroundSize: '30px 30px'
              }}></div>
            </div>

            <div className="relative z-10">
              <div className="inline-block bg-white/20 backdrop-blur-sm px-6 py-2 rounded-full text-sm font-semibold mb-6">
                Lancez-vous maintenant
              </div>
              <h2 className="text-4xl md:text-5xl font-extrabold mb-6">
                Prêt à engager un artisan ?
              </h2>
              <p className="text-xl md:text-2xl mb-10 opacity-90 max-w-3xl mx-auto leading-relaxed">
                Publiez votre projet gratuitement et recevez des devis d'artisans vérifiés
              </p>
              <div className="flex flex-col sm:flex-row gap-6 justify-center">
                <Button
                  onClick={() => router.push('/inscription?role=client')}
                  className="!bg-white !text-brand-700 hover:!bg-slate-100 hover:!scale-105 text-xl px-12 py-5 shadow-lg transform transition-all font-bold"
                >
                  Publiez votre projet
                </Button>
                <Button
                  onClick={() => router.push('/inscription?role=artisan')}
                  className="!border-2 !border-white !bg-transparent !text-white hover:!bg-white hover:!text-brand-700 hover:!scale-105 text-xl px-12 py-5 shadow-lg transform transition-all font-bold"
                >
                  Je suis professionnel
                </Button>
              </div>
              <p className="mt-8 text-sm opacity-75">
                Inscription gratuite • Sans engagement • Satisfaction garantie
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Minimaliste */}
      <footer className="bg-navy-800 text-white py-12 mt-24">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <p className="text-slate-400 mb-4">
              © 2026 ArtisanDispo - La plateforme #1 des artisans disponibles
            </p>
            <div className="flex flex-wrap justify-center gap-6 text-sm">
              <Link href="/cgu" className="text-slate-400 hover:text-white transition-colors">
                CGU
              </Link>
              <Link href="/mentions-legales" className="text-slate-400 hover:text-white transition-colors">
                Mentions légales
              </Link>
              <Link href="/confidentialite" className="text-slate-400 hover:text-white transition-colors">
                Confidentialité
              </Link>
              <Link href="/confiance/verification-artisans" className="text-slate-400 hover:text-white transition-colors">
                Vérification artisans
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
