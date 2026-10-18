/**
 * Page : Devis 100% gratuits
 * Explique le système de devis gratuits sans engagement
 */

import Link from 'next/link';

export default function DevisGratuitsPage() {
  return (
    <div className="min-h-screen bg-white ">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-6xl">💰</span>
          </div>
          <h1 className="text-5xl font-bold mb-6">Devis 100% gratuits</h1>
          <p className="text-xl text-slate-500 max-w-3xl mx-auto">
            Comparez plusieurs devis d'artisans qualifiés sans aucun engagement ni frais cachés
          </p>
        </div>

        {/* Section principale */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12 mb-12 max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-navy-800 mb-8 text-center">
            Comment ça marche ?
          </h2>

          <div className="space-y-8">
            {/* Étape 1 */}
            <div className="flex items-start gap-6 bg-slate-50 rounded-xl p-6">
              <div className="w-12 h-12 bg-brand-700 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                1
              </div>
              <div>
                <h3 className="text-xl font-bold text-navy-800 mb-3">
                  Décrivez votre projet
                </h3>
                <p className="text-slate-500">
                  Remplissez un formulaire simple en quelques clics : type de travaux, lieu, délais souhaités. 
                  C'est rapide et gratuit.
                </p>
              </div>
            </div>

            {/* Étape 2 */}
            <div className="flex items-start gap-6 bg-slate-50 rounded-xl p-6">
              <div className="w-12 h-12 bg-brand-700 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                2
              </div>
              <div>
                <h3 className="text-xl font-bold text-navy-800 mb-3">
                  Recevez plusieurs devis
                </h3>
                <p className="text-slate-500">
                  Les artisans qualifiés de votre région vous envoient leurs devis détaillés. 
                  Recevez jusqu'à 5 propositions pour comparer.
                </p>
              </div>
            </div>

            {/* Étape 3 */}
            <div className="flex items-start gap-6 bg-slate-50 rounded-xl p-6">
              <div className="w-12 h-12 bg-brand-700 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                3
              </div>
              <div>
                <h3 className="text-xl font-bold text-navy-800 mb-3">
                  Comparez et choisissez
                </h3>
                <p className="text-slate-500">
                  Analysez les prix, les disponibilités et les avis clients. 
                  Sélectionnez l'artisan qui correspond le mieux à vos besoins.
                </p>
              </div>
            </div>

            {/* Étape 4 */}
            <div className="flex items-start gap-6 bg-slate-50 rounded-xl p-6">
              <div className="w-12 h-12 bg-green-700 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                ✓
              </div>
              <div>
                <h3 className="text-xl font-bold text-navy-800 mb-3">
                  Démarrez vos travaux sereinement
                </h3>
                <p className="text-slate-500">
                  Acceptez le devis qui vous convient. Aucune obligation, même après réception des propositions.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Avantages */}
        <div className=" bg-brand-600 rounded-2xl shadow-md p-8 md:p-12 mb-12 text-white max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold mb-8 text-center">
            Pourquoi nos devis sont-ils vraiment gratuits ?
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🚫</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Zéro frais cachés</h3>
              <p className="text-white/90">
                Pas de frais de mise en relation, pas d'abonnement, pas de commission sur les devis.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🔓</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Sans engagement</h3>
              <p className="text-white/90">
                Vous êtes libre de refuser tous les devis. Aucune obligation d'achat ou de signature.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">⏱️</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Rapide et simple</h3>
              <p className="text-white/90">
                Recevez vos premiers devis en moins de 24h. Interface intuitive, zéro paperasse.
              </p>
            </div>
          </div>
        </div>

        {/* Ce qui est inclus */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12 mb-12 max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-navy-800 mb-8 text-center">
            Ce qui est inclus dans chaque devis
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex items-start gap-4">
              <span className="text-green-700 text-2xl mt-1">✓</span>
              <div>
                <h3 className="font-bold text-navy-800 mb-2">Détail des prestations</h3>
                <p className="text-slate-500">
                  Chaque ligne de travaux clairement décrite avec quantité et prix unitaire
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <span className="text-green-700 text-2xl mt-1">✓</span>
              <div>
                <h3 className="font-bold text-navy-800 mb-2">Tarifs transparents</h3>
                <p className="text-slate-500">
                  Prix HT et TTC affichés, taux de TVA précisé selon les travaux
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <span className="text-green-700 text-2xl mt-1">✓</span>
              <div>
                <h3 className="font-bold text-navy-800 mb-2">Délais de réalisation</h3>
                <p className="text-slate-500">
                  Date de début et durée estimée des travaux mentionnées
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <span className="text-green-700 text-2xl mt-1">✓</span>
              <div>
                <h3 className="font-bold text-navy-800 mb-2">Coordonnées artisan</h3>
                <p className="text-slate-500">
                  Contact direct avec l'artisan pour poser vos questions
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <span className="text-green-700 text-2xl mt-1">✓</span>
              <div>
                <h3 className="font-bold text-navy-800 mb-2">Documents officiels</h3>
                <p className="text-slate-500">
                  KBIS, assurance décennale et garanties de l'artisan accessibles
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <span className="text-green-700 text-2xl mt-1">✓</span>
              <div>
                <h3 className="font-bold text-navy-800 mb-2">Avis clients</h3>
                <p className="text-slate-500">
                  Notation et retours d'expérience des précédents clients
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ Rapide */}
        <div className="bg-slate-50 rounded-2xl p-8 md:p-12 mb-12 max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-navy-800 mb-8 text-center">
            Questions fréquentes
          </h2>

          <div className="space-y-6">
            <div>
              <h3 className="font-bold text-navy-800 mb-2 text-lg">
                💡 Combien de devis puis-je recevoir ?
              </h3>
              <p className="text-slate-500 pl-6">
                Vous pouvez recevoir jusqu'à 5 devis par demande. Plus vous comparez, meilleures sont vos chances de trouver le meilleur rapport qualité/prix.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-navy-800 mb-2 text-lg">
                💡 En combien de temps puis-je obtenir des devis ?
              </h3>
              <p className="text-slate-500 pl-6">
                Les premiers devis arrivent généralement sous 24h. Comptez 2-3 jours pour recevoir plusieurs propositions et comparer.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-navy-800 mb-2 text-lg">
                💡 Dois-je obligatoirement accepter un devis ?
              </h3>
              <p className="text-slate-500 pl-6">
                Non, absolument pas ! Vous êtes libre de refuser tous les devis reçus. Aucune obligation, aucun frais, aucune pénalité.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-navy-800 mb-2 text-lg">
                💡 Les artisans sont-ils vraiment vérifiés ?
              </h3>
              <p className="text-slate-500 pl-6">
                Oui ! Tous les artisans sur ArtisanDispo ont fourni leur KBIS, leur assurance décennale et ont passé nos vérifications d'identité et de qualifications.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Final */}
        <div className="text-center bg-navy-800 rounded-2xl shadow-md p-8 md:p-12 text-white max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold mb-4">
            Prêt à recevoir vos devis gratuits ?
          </h2>
          <p className="text-lg mb-6 text-white/90">
            Décrivez votre projet en 2 minutes et commencez à comparer les offres
          </p>
          <Link href="/demande/nouvelle">
            <button className="bg-brand-700 hover:bg-brand-800 text-white px-8 py-4 rounded-lg font-bold text-lg transition-all duration-200 shadow-lg hover:shadow-md transform hover:scale-105">
              Demander mes devis gratuits →
            </button>
          </Link>
          <p className="text-sm text-white/70 mt-4">
            ✓ Sans engagement • ✓ 100% gratuit • ✓ Réponse sous 24h
          </p>
        </div>

        {/* Retour */}
        <div className="text-center mt-12">
          <Link href="/" className="text-brand-700 hover:underline font-medium">
            ← Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
