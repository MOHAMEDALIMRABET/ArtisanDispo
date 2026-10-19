'use client';

import Link from 'next/link';

export default function ConditionsGeneralesPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-navy-800 text-white py-12">
        <div className="container mx-auto px-4">
          <nav className="flex items-center gap-2 text-sm mb-4">
            <Link href="/" className="hover:text-brand-700 transition-colors">
              Accueil
            </Link>
            <span>&gt;</span>
            <span>Conditions générales d'utilisation</span>
          </nav>
          <h1 className="text-3xl md:text-4xl font-bold">
            Conditions Générales d'Utilisation
          </h1>
        </div>
      </div>

      {/* Contenu */}
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-8">
          
          {/* Section 1 */}
          <section>
            <h2 className="text-2xl font-bold text-navy-800 mb-4">1. Objet</h2>
            <p className="text-slate-700 leading-relaxed">
              Les présentes conditions générales d'utilisation (ci-après « CGU ») ont pour objet de définir les modalités et conditions d'utilisation de la plateforme ArtisanDispo, ainsi que de définir les droits et obligations des parties dans ce cadre.
            </p>
            <p className="text-slate-700 leading-relaxed mt-2">
              ArtisanDispo est une plateforme de mise en relation entre particuliers (ci-après « Clients ») et professionnels du bâtiment qualifiés (ci-après « Artisans »).
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-2xl font-bold text-navy-800 mb-4">2. Accès et Inscription</h2>
            <h3 className="text-lg font-semibold text-navy-800 mb-2">2.1 Conditions d'accès</h3>
            <p className="text-slate-700 leading-relaxed">
              L'accès à la plateforme ArtisanDispo est ouvert à toute personne physique ou morale disposant de la pleine capacité juridique pour s'engager au titre des présentes CGU.
            </p>
            
            <h3 className="text-lg font-semibold text-navy-800 mb-2 mt-4">2.2 Inscription</h3>
            <p className="text-slate-700 leading-relaxed">
              L'utilisation de certaines fonctionnalités de la plateforme nécessite la création d'un compte utilisateur. Vous vous engagez à fournir des informations exactes, complètes et à jour.
            </p>
            <p className="text-slate-700 leading-relaxed mt-2">
              Pour les artisans, la vérification de l'identité et des qualifications professionnelles (KBIS, assurances, etc.) est obligatoire avant l'activation complète du compte.
            </p>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-2xl font-bold text-navy-800 mb-4">3. Services proposés</h2>
            <h3 className="text-lg font-semibold text-navy-800 mb-2">3.1 Pour les Clients</h3>
            <ul className="list-disc list-inside text-slate-700 space-y-2 ml-4">
              <li>Publication de demandes de travaux</li>
              <li>Réception de devis de la part d'artisans qualifiés</li>
              <li>Comparaison et sélection des offres</li>
              <li>Messagerie sécurisée avec les artisans</li>
              <li>Paiement sécurisé avec système de séquestre</li>
            </ul>

            <h3 className="text-lg font-semibold text-navy-800 mb-2 mt-4">3.2 Pour les Artisans</h3>
            <ul className="list-disc list-inside text-slate-700 space-y-2 ml-4">
              <li>Création d'un profil professionnel vérifié</li>
              <li>Accès aux demandes de travaux correspondant à leurs compétences</li>
              <li>Envoi de devis personnalisés</li>
              <li>Gestion de leur planning et disponibilités</li>
              <li>Réception sécurisée des paiements</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-2xl font-bold text-navy-800 mb-4">4. Protection des données personnelles</h2>
            <p className="text-slate-700 leading-relaxed">
              Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez d'un droit d'accès, de rectification, de suppression et de portabilité de vos données personnelles.
            </p>
            <p className="text-slate-700 leading-relaxed mt-2">
              Les données collectées sont utilisées exclusivement pour :
            </p>
            <ul className="list-disc list-inside text-slate-700 space-y-2 ml-4 mt-2">
              <li>La mise en relation entre clients et artisans</li>
              <li>Le traitement des demandes de devis</li>
              <li>L'amélioration de nos services</li>
              <li>La communication d'informations relatives à votre utilisation de la plateforme</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-2xl font-bold text-navy-800 mb-4">5. Opposition au démarchage téléphonique</h2>
            <p className="text-slate-700 leading-relaxed">
              Vous disposez du droit de vous inscrire sur la liste d'opposition au démarchage téléphonique Bloctel :
            </p>
            <p className="mt-2">
              <a 
                href="https://www.bloctel.gouv.fr" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-brand-700 hover:underline font-medium"
              >
                https://www.bloctel.gouv.fr
              </a>
            </p>
            <p className="text-slate-700 leading-relaxed mt-2">
              Cette inscription ne fait pas obstacle aux contacts se rapportant à l'exécution d'un contrat en cours et à la prospection commerciale réalisée à la suite d'une demande d'information.
            </p>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-2xl font-bold text-navy-800 mb-4">6. Responsabilité</h2>
            <p className="text-slate-700 leading-relaxed">
              ArtisanDispo agit en qualité d'intermédiaire technique entre clients et artisans. La plateforme ne saurait être tenue responsable :
            </p>
            <ul className="list-disc list-inside text-slate-700 space-y-2 ml-4 mt-2">
              <li>De la qualité des travaux réalisés par les artisans</li>
              <li>Des litiges pouvant survenir entre clients et artisans</li>
              <li>Du non-respect des engagements contractuels entre les parties</li>
            </ul>
            <p className="text-slate-700 leading-relaxed mt-2">
              Toutefois, ArtisanDispo met en place un processus de vérification des artisans et un système de médiation en cas de litige.
            </p>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-2xl font-bold text-navy-800 mb-4">7. Propriété intellectuelle</h2>
            <p className="text-slate-700 leading-relaxed">
              L'ensemble des éléments de la plateforme ArtisanDispo (logos, textes, images, vidéos, etc.) sont protégés par le droit de la propriété intellectuelle. Toute reproduction ou représentation, totale ou partielle, est interdite sans autorisation préalable.
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-2xl font-bold text-navy-800 mb-4">8. Droit applicable et litiges</h2>
            <p className="text-slate-700 leading-relaxed">
              Les présentes CGU sont soumises au droit français. En cas de litige, les parties s'efforceront de trouver une solution amiable. À défaut, le litige sera porté devant les tribunaux français compétents.
            </p>
          </section>

          {/* Section 9 */}
          <section>
            <h2 className="text-2xl font-bold text-navy-800 mb-4">9. Contact</h2>
            <p className="text-slate-700 leading-relaxed">
              Pour toute question concernant les présentes CGU, vous pouvez nous contacter à :
            </p>
            <div className="mt-4 p-4 bg-slate-50 rounded-lg">
              <p className="text-slate-700"><strong>Email :</strong> contact@artisandispo.fr</p>
              <p className="text-slate-700 mt-2"><strong>Adresse :</strong> ArtisanDispo - 123 Avenue de la République, 75011 Paris</p>
            </div>
          </section>

          {/* Date de mise à jour */}
          <div className="pt-6 border-t border-slate-200 text-sm text-slate-500">
            <p>Dernière mise à jour : 16 février 2026</p>
          </div>
        </div>

        {/* Bouton retour */}
        <div className="mt-8 text-center">
          <Link 
            href="/"
            className="inline-flex items-center gap-2 text-navy-800 hover:text-brand-700 font-medium transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
