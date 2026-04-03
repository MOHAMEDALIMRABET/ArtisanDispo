'use client';

import Link from 'next/link';

export default function ConditionsGeneralesPage() {
  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Header */}
      <div className="bg-[#2C3E50] text-white py-14">
        <div className="container mx-auto px-4 max-w-4xl">
          <nav className="flex items-center gap-2 text-sm mb-4 text-gray-300">
            <Link href="/" className="hover:text-[#FF6B00] transition-colors">
              Accueil
            </Link>
            <span>›</span>
            <span className="text-white">Conditions Générales d'Utilisation</span>
          </nav>
          <h1 className="text-3xl md:text-4xl font-bold">
            Conditions Générales d'Utilisation
          </h1>
          <p className="mt-3 text-gray-300 text-sm">
            Dernière mise à jour : 3 avril 2026 — Version 2.0
          </p>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="container mx-auto px-4 py-12 max-w-4xl">

        {/* Sommaire */}
        <div className="bg-white rounded-xl shadow-sm border border-[#E9ECEF] p-6 mb-8">
          <h2 className="text-lg font-bold text-[#2C3E50] mb-4">Sommaire</h2>
          <ol className="space-y-1 text-sm text-[#6C757D] list-decimal list-inside columns-2">
            <li><a href="#objet" className="hover:text-[#FF6B00] transition-colors">Objet</a></li>
            <li><a href="#inscription" className="hover:text-[#FF6B00] transition-colors">Inscription et comptes</a></li>
            <li><a href="#verification" className="hover:text-[#FF6B00] transition-colors">Vérification des artisans</a></li>
            <li><a href="#demandes-classiques" className="hover:text-[#FF6B00] transition-colors">Demandes classiques (devis)</a></li>
            <li><a href="#demandes-express" className="hover:text-[#FF6B00] transition-colors">Demandes express</a></li>
            <li><a href="#paiements" className="hover:text-[#FF6B00] transition-colors">Paiements et commission</a></li>
            <li><a href="#messagerie" className="hover:text-[#FF6B00] transition-colors">Messagerie et anti-bypass</a></li>
            <li><a href="#wallet" className="hover:text-[#FF6B00] transition-colors">Wallet artisan</a></li>
            <li><a href="#responsabilite" className="hover:text-[#FF6B00] transition-colors">Responsabilités</a></li>
            <li><a href="#rgpd" className="hover:text-[#FF6B00] transition-colors">Données personnelles (RGPD)</a></li>
            <li><a href="#propriete" className="hover:text-[#FF6B00] transition-colors">Propriété intellectuelle</a></li>
            <li><a href="#modifications" className="hover:text-[#FF6B00] transition-colors">Modifications des CGU</a></li>
            <li><a href="#droit" className="hover:text-[#FF6B00] transition-colors">Droit applicable</a></li>
          </ol>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-[#E9ECEF] p-8 md:p-10 space-y-12">

          {/* Section 1 */}
          <section id="objet">
            <h2 className="text-2xl font-bold text-[#2C3E50] mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#FF6B00] text-white text-sm flex items-center justify-center font-bold flex-shrink-0">1</span>
              Objet
            </h2>
            <p className="text-[#6C757D] leading-relaxed">
              Les présentes Conditions Générales d'Utilisation (ci-après « CGU ») régissent l'accès et l'utilisation de la plateforme <strong className="text-[#2C3E50]">ArtisanDispo</strong>, accessible à l'adresse{' '}
              <a href="https://artisandispo.fr" className="text-[#FF6B00] hover:underline">artisandispo.fr</a>, éditée par la société ArtisanDispo SAS.
            </p>
            <p className="text-[#6C757D] leading-relaxed mt-3">
              ArtisanDispo est une <strong className="text-[#2C3E50]">plateforme de mise en relation</strong> entre des particuliers ou professionnels (ci-après « Clients ») et des artisans du bâtiment qualifiés (ci-après « Artisans »). ArtisanDispo n'est pas partie aux contrats conclus entre Clients et Artisans et n'est en aucun cas prestataire de travaux.
            </p>
            <p className="text-[#6C757D] leading-relaxed mt-3">
              L'accès à la plateforme implique l'acceptation pleine et entière des présentes CGU. Toute personne refusant ces conditions doit cesser d'utiliser la plateforme.
            </p>
          </section>

          <hr className="border-[#E9ECEF]" />

          {/* Section 2 */}
          <section id="inscription">
            <h2 className="text-2xl font-bold text-[#2C3E50] mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#FF6B00] text-white text-sm flex items-center justify-center font-bold flex-shrink-0">2</span>
              Inscription et comptes
            </h2>
            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2">2.1 Conditions d'accès</h3>
            <p className="text-[#6C757D] leading-relaxed">
              L'inscription est ouverte à toute personne physique majeure ou personne morale disposant de la pleine capacité juridique. L'utilisation de la plateforme est strictement personnelle et non cessible.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">2.2 Compte Client</h3>
            <p className="text-[#6C757D] leading-relaxed">
              La création d'un compte Client nécessite la fourniture d'une adresse e-mail valide et la définition d'un mot de passe sécurisé. Un e-mail de vérification est envoyé automatiquement : le compte ne devient actif qu'après validation de l'adresse e-mail.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">2.3 Compte Artisan</h3>
            <p className="text-[#6C757D] leading-relaxed">
              Les Artisans doivent, en plus de la vérification e-mail, soumettre leurs documents professionnels pour validation par l'équipe ArtisanDispo. Le profil artisan n'est <strong className="text-[#2C3E50]">visible dans les résultats de recherche</strong> qu'après validation complète (voir section 3).
            </p>
            <p className="text-[#6C757D] leading-relaxed mt-2">
              L'Artisan s'engage à maintenir ses informations à jour (assurances, disponibilités, coordonnées) et à informer ArtisanDispo de tout changement de situation professionnelle.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">2.4 Sécurité du compte</h3>
            <p className="text-[#6C757D] leading-relaxed">
              L'utilisateur est seul responsable de la confidentialité de ses identifiants. Toute utilisation du compte consécutive à la négligence de l'utilisateur sur la sécurité de ses accès engage sa responsabilité.
            </p>
          </section>

          <hr className="border-[#E9ECEF]" />

          {/* Section 3 */}
          <section id="verification">
            <h2 className="text-2xl font-bold text-[#2C3E50] mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#FF6B00] text-white text-sm flex items-center justify-center font-bold flex-shrink-0">3</span>
              Vérification des artisans
            </h2>
            <p className="text-[#6C757D] leading-relaxed">
              ArtisanDispo applique un processus de vérification rigoureux en deux étapes afin de garantir la légitimité et le professionnalisme des artisans inscrits.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">3.1 Documents obligatoires</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              {[
                { icon: '📄', label: 'Extrait KBIS', desc: 'Moins de 3 mois — Vérifié par OCR automatique et validation manuelle' },
                { icon: '🪪', label: "Pièce d'identité", desc: "Carte nationale ou passeport du représentant légal" },
                { icon: '🛡️', label: 'RC Pro', desc: 'Assurance responsabilité civile professionnelle en cours de validité' },
                { icon: '🏗️', label: 'Garantie décennale', desc: 'Obligatoire pour les métiers de construction et rénovation structurelle' },
              ].map((doc) => (
                <div key={doc.label} className="flex gap-3 p-3 bg-[#F8F9FA] rounded-lg border border-[#E9ECEF]">
                  <span className="text-2xl flex-shrink-0">{doc.icon}</span>
                  <div>
                    <p className="font-semibold text-[#2C3E50] text-sm">{doc.label}</p>
                    <p className="text-xs text-[#6C757D] mt-0.5">{doc.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">3.2 Processus de validation</h3>
            <p className="text-[#6C757D] leading-relaxed">
              Les documents sont soumis à une pré-analyse par reconnaissance optique de caractères (OCR) afin d'extraire automatiquement le numéro SIRET, la raison sociale et le représentant légal. La décision finale d'approbation ou de rejet est prise par l'équipe de modération ArtisanDispo.
            </p>
            <p className="text-[#6C757D] leading-relaxed mt-2">
              Le statut de vérification peut être : <span className="font-medium text-yellow-600">en attente</span>, <span className="font-medium text-[#28A745]">approuvé</span> ou <span className="font-medium text-red-600">rejeté</span>. L'Artisan est notifié par e-mail de la décision et peut soumettre de nouveaux documents en cas de rejet.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">3.3 Badge vérifié</h3>
            <p className="text-[#6C757D] leading-relaxed">
              Les artisans approuvés affichent un badge <span className="text-[#28A745] font-semibold">✓ Vérifié ArtisanDispo</span> sur leur profil public. Ce badge atteste uniquement de la vérification des documents fournis au moment de l'inscription et ne constitue pas une garantie de la qualité des travaux.
            </p>
          </section>

          <hr className="border-[#E9ECEF]" />

          {/* Section 4 */}
          <section id="demandes-classiques">
            <h2 className="text-2xl font-bold text-[#2C3E50] mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#FF6B00] text-white text-sm flex items-center justify-center font-bold flex-shrink-0">4</span>
              Demandes classiques (devis)
            </h2>
            <p className="text-[#6C757D] leading-relaxed">
              Le système de demandes classiques permet aux Clients de publier un projet de travaux et de recevoir des devis comparatifs d'artisans qualifiés.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">4.1 Publication d'une demande</h3>
            <p className="text-[#6C757D] leading-relaxed">
              Le Client décrit son projet (métier requis, description des travaux, localisation) et le publie sur la plateforme. La demande est visible par les artisans correspondant aux critères (métier, zone géographique).
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">4.2 Devis artisans</h3>
            <p className="text-[#6C757D] leading-relaxed">
              Les artisans intéressés soumettent un devis détaillé comprenant les prestations, les quantités, les prix unitaires HT et la TVA applicable. Le montant TTC est calculé automatiquement. Le Client peut accepter ou refuser chaque devis reçu. En cas de refus, il doit indiquer un motif.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">4.3 Acceptation et contrat</h3>
            <p className="text-[#6C757D] leading-relaxed">
              L'acceptation d'un devis entraîne la création automatique d'un contrat de mission sur la plateforme et l'envoi d'une notification à l'artisan. Le paiement est effectué via le système de séquestre décrit à la section 6.
            </p>
          </section>

          <hr className="border-[#E9ECEF]" />

          {/* Section 5 */}
          <section id="demandes-express">
            <h2 className="text-2xl font-bold text-[#2C3E50] mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#FF6B00] text-white text-sm flex items-center justify-center font-bold flex-shrink-0">5</span>
              Demandes express
            </h2>
            <p className="text-[#6C757D] leading-relaxed">
              Les demandes express permettent au Client d'obtenir une intervention urgente ou un petit travail à tarif fixe et déterminé à l'avance, sans phase de devis.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
              {/* Dépannage urgence */}
              <div className="border-2 border-red-100 bg-red-50 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">🚨</span>
                  <h3 className="text-lg font-bold text-[#2C3E50]">Dépannage urgence</h3>
                </div>
                <ul className="space-y-2 text-sm text-[#6C757D]">
                  <li className="flex gap-2"><span className="text-[#FF6B00]">•</span> Serrurerie, plomberie, électricité, chauffage, vitrerie</li>
                  <li className="flex gap-2"><span className="text-[#FF6B00]">•</span> <strong>Tarif maximum : 150 € TTC</strong></li>
                  <li className="flex gap-2"><span className="text-[#FF6B00]">•</span> Intervention : 30 min à 1 heure</li>
                  <li className="flex gap-2"><span className="text-[#FF6B00]">•</span> Proposition artisan attendue sous 1 heure</li>
                  <li className="flex gap-2"><span className="text-[#FF6B00]">•</span> Algorithme de matching par distance et disponibilité</li>
                </ul>
              </div>
              {/* Petits travaux */}
              <div className="border-2 border-orange-100 bg-orange-50 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">🛠️</span>
                  <h3 className="text-lg font-bold text-[#2C3E50]">Petits travaux en urgence</h3>
                </div>
                <ul className="space-y-2 text-sm text-[#6C757D]">
                  <li className="flex gap-2"><span className="text-[#FF6B00]">•</span> Petites réparations et maintenance courante</li>
                  <li className="flex gap-2"><span className="text-[#FF6B00]">•</span> <strong>Tarif maximum : 150 € TTC</strong></li>
                  <li className="flex gap-2"><span className="text-[#FF6B00]">•</span> Durée d'intervention estimée : 2 heures</li>
                  <li className="flex gap-2"><span className="text-[#FF6B00]">•</span> Délai de réponse artisan : sous 1 heure</li>
                  <li className="flex gap-2"><span className="text-[#FF6B00]">•</span> Prix fixés par catégorie de prestation</li>
                </ul>
              </div>
            </div>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-6">5.1 Fonctionnement du matching express</h3>
            <p className="text-[#6C757D] leading-relaxed">
              Dès la soumission d'une demande express, l'algorithme de matching ArtisanDispo sélectionne automatiquement les artisans disponibles les plus proches géographiquement et disposant des compétences requises. Les artisans sélectionnés reçoivent une notification et peuvent soumettre une proposition dans le délai imparti.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">5.2 Engagement des parties</h3>
            <p className="text-[#6C757D] leading-relaxed">
              L'acceptation d'une demande express par un artisan constitue un engagement ferme d'intervention dans les délais indiqués. Le Client s'engage à être présent sur les lieux au moment convenu. Toute annulation moins de 30 minutes avant l'intervention peut entraîner des frais.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">5.3 Limite tarifaire</h3>
            <p className="text-[#6C757D] leading-relaxed">
              Le tarif maximum des prestations express est fixé à <strong className="text-[#2C3E50]">150 € TTC</strong>. Toute prestation dépassant ce montant doit être traitée via le système de demandes classiques (devis). Ce plafond inclut le déplacement, la main d'œuvre et les fournitures de base.
            </p>
          </section>

          <hr className="border-[#E9ECEF]" />

          {/* Section 6 */}
          <section id="paiements">
            <h2 className="text-2xl font-bold text-[#2C3E50] mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#FF6B00] text-white text-sm flex items-center justify-center font-bold flex-shrink-0">6</span>
              Paiements, commission et séquestre
            </h2>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2">6.1 Système de séquestre (paiement sécurisé)</h3>
            <p className="text-[#6C757D] leading-relaxed">
              Pour les travaux classiques, le paiement du Client est conservé en <strong className="text-[#2C3E50]">séquestre</strong> par ArtisanDispo jusqu'à la validation de la bonne exécution des travaux. Les fonds sont libérés en faveur de l'Artisan uniquement après confirmation du Client ou expiration du délai de contestation (72 heures après la fin des travaux déclarée).
            </p>
            <p className="text-[#6C757D] leading-relaxed mt-2">
              Pour les demandes <strong className="text-[#2C3E50]">express</strong>, le paiement est débité lors de la confirmation de la demande. Les fonds sont libérés dans le wallet de l'Artisan dès validation de l'intervention par le Client.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">6.2 Commission ArtisanDispo</h3>
            <div className="bg-[#F8F9FA] border border-[#E9ECEF] rounded-xl p-5 mt-3">
              <p className="text-[#6C757D] leading-relaxed">
                ArtisanDispo prélève une commission de{' '}
                <strong className="text-[#FF6B00] text-xl">10 %</strong>{' '}
                sur chaque transaction aboutie entre un Client et un Artisan. Cette commission est automatiquement déduite du montant versé à l'Artisan lors de la libération des fonds.
              </p>
              <p className="text-sm text-[#6C757D] mt-2">
                Exemple : pour une prestation express à 100 € TTC, l'Artisan perçoit 90 €. La commission de 10 € couvre les services de la plateforme (mise en relation, paiement sécurisé, support, assurance).
              </p>
            </div>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">6.3 Prestataire de paiement</h3>
            <p className="text-[#6C757D] leading-relaxed">
              Les paiements sont traités par <strong className="text-[#2C3E50]">Stripe</strong>, prestataire de paiement conforme à la norme PCI DSS. ArtisanDispo ne stocke aucune donnée bancaire sur ses serveurs. Les conditions d'utilisation de Stripe sont accessibles sur{' '}
              <a href="https://stripe.com/fr/legal" target="_blank" rel="noopener noreferrer" className="text-[#FF6B00] hover:underline">stripe.com/fr/legal</a>.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">6.4 Remboursements et litiges</h3>
            <p className="text-[#6C757D] leading-relaxed">
              En cas de litige sur la qualité des travaux, le Client dispose d'un délai de <strong className="text-[#2C3E50]">72 heures</strong> après déclaration de fin de travaux pour contester et ouvrir un dossier de médiation. ArtisanDispo peut, après instruction du dossier, décider de libérer tout ou partie des fonds, ou de procéder à un remboursement partiel ou total.
            </p>
          </section>

          <hr className="border-[#E9ECEF]" />

          {/* Section 7 */}
          <section id="messagerie">
            <h2 className="text-2xl font-bold text-[#2C3E50] mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#FF6B00] text-white text-sm flex items-center justify-center font-bold flex-shrink-0">7</span>
              Messagerie et interdiction de contournement
            </h2>
            <p className="text-[#6C757D] leading-relaxed">
              La plateforme ArtisanDispo met à disposition un système de messagerie sécurisée entre Clients et Artisans. L'utilisation de cette messagerie est soumise aux règles suivantes.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">7.1 Contenu interdit dans les messages</h3>
            <p className="text-[#6C757D] leading-relaxed">
              Dans le cadre de la messagerie, il est strictement interdit de communiquer :
            </p>
            <ul className="list-none space-y-2 mt-3 text-[#6C757D]">
              {[
                'Numéros de téléphone (fixe ou mobile, sous toute forme : standard, fragmentée, avec espaces, avec séparateurs, avec substitutions de caractères)',
                'Adresses e-mail (formats standards ou transformés : « arobase », espaces, etc.)',
                'Adresses postales, codes postaux isolés, numéros de rue',
                'Identifiants ou liens vers réseaux sociaux (Facebook, Instagram, WhatsApp, Telegram, LinkedIn, etc.)',
                'Coordonnées bancaires (IBAN, BIC, RIB, numéros de carte)',
                'Tout lien ou redirection vers un site externe permettant d\'échanger des coordonnées',
              ].map((item) => (
                <li key={item} className="flex gap-2 text-sm">
                  <span className="text-red-500 flex-shrink-0 mt-0.5">✕</span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-[#6C757D] leading-relaxed mt-3">
              Ces restrictions s'appliquent également aux formes déguisées ou contournées (ex. : substitution de chiffres par des lettres, numéros collés à d'autres mots, encodages alternatifs). Les messages sont analysés automatiquement et bloqués en cas de détection.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">7.2 Raison de ces restrictions</h3>
            <p className="text-[#6C757D] leading-relaxed">
              Ces restrictions visent à prévenir le contournement des paiements via la plateforme, qui assure la protection financière des deux parties (séquestre, médiation). Tout contournement prive les parties des garanties offertes par ArtisanDispo et peut entraîner la suspension du compte.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">7.3 Sanctions</h3>
            <p className="text-[#6C757D] leading-relaxed">
              Tout utilisateur tentant de contourner le système de paiement s'expose à la suspension immédiate de son compte, sans préavis ni remboursement des sommes en cours.
            </p>
          </section>

          <hr className="border-[#E9ECEF]" />

          {/* Section 8 */}
          <section id="wallet">
            <h2 className="text-2xl font-bold text-[#2C3E50] mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#FF6B00] text-white text-sm flex items-center justify-center font-bold flex-shrink-0">8</span>
              Wallet artisan
            </h2>
            <p className="text-[#6C757D] leading-relaxed">
              Chaque Artisan dispose d'un <strong className="text-[#2C3E50]">portefeuille virtuel (wallet)</strong> au sein de la plateforme, qui accumule les fonds issus des prestations validées, après déduction de la commission ArtisanDispo.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">8.1 Alimentation du wallet</h3>
            <p className="text-[#6C757D] leading-relaxed">
              Le solde du wallet est crédité automatiquement dès validation d'une prestation par le Client ou expiration du délai de contestation. Les fonds sont disponibles immédiatement pour virement.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">8.2 Virements</h3>
            <p className="text-[#6C757D] leading-relaxed">
              L'Artisan peut demander un virement de son solde disponible vers son compte bancaire. ArtisanDispo traite les demandes de virement dans un délai de <strong className="text-[#2C3E50]">3 à 5 jours ouvrés</strong>. Un montant minimum de virement peut s'appliquer.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">8.3 Blocage de fonds</h3>
            <p className="text-[#6C757D] leading-relaxed">
              En cas d'ouverture d'un litige ou de suspension de compte, les fonds présents dans le wallet peuvent être temporairement bloqués dans l'attente de la résolution de la situation.
            </p>
          </section>

          <hr className="border-[#E9ECEF]" />

          {/* Section 9 */}
          <section id="responsabilite">
            <h2 className="text-2xl font-bold text-[#2C3E50] mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#FF6B00] text-white text-sm flex items-center justify-center font-bold flex-shrink-0">9</span>
              Responsabilités
            </h2>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2">9.1 Rôle d'intermédiaire</h3>
            <p className="text-[#6C757D] leading-relaxed">
              ArtisanDispo agit exclusivement en qualité d'intermédiaire technique. La plateforme ne saurait être tenue responsable de la qualité des prestations réalisées, des malfaçons, retards ou dommages causés par un Artisan. Les contrats de travaux sont conclus directement entre le Client et l'Artisan.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">9.2 Responsabilité de l'Artisan</h3>
            <p className="text-[#6C757D] leading-relaxed">
              L'Artisan est seul responsable de la bonne exécution des travaux, du respect des normes réglementaires (DTU, NF, RT...) et de la validité de ses assurances professionnelles. L'Artisan s'engage à déclarer tout sinistre à son assurance RC Pro ou décennale, selon la nature des dommages.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">9.3 Responsabilité d'ArtisanDispo</h3>
            <p className="text-[#6C757D] leading-relaxed">
              ArtisanDispo s'engage à mettre tout en œuvre pour assurer la disponibilité et la sécurité de la plateforme, mais ne peut garantir une disponibilité sans interruption. La responsabilité d'ArtisanDispo est limitée au montant des commissions perçues sur la transaction concernée.
            </p>
          </section>

          <hr className="border-[#E9ECEF]" />

          {/* Section 10 */}
          <section id="rgpd">
            <h2 className="text-2xl font-bold text-[#2C3E50] mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#FF6B00] text-white text-sm flex items-center justify-center font-bold flex-shrink-0">10</span>
              Données personnelles (RGPD)
            </h2>
            <p className="text-[#6C757D] leading-relaxed">
              ArtisanDispo respecte le Règlement Général sur la Protection des Données (RGPD — Règlement UE 2016/679) et la loi Informatique et Libertés modifiée.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">10.1 Données collectées</h3>
            <p className="text-[#6C757D] leading-relaxed">
              Nous collectons uniquement les données nécessaires au fonctionnement de la plateforme : identité, coordonnées, informations professionnelles (pour les artisans), données de paiement (traitées par Stripe) et données de navigation.
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">10.2 Droits des utilisateurs</h3>
            <p className="text-[#6C757D] leading-relaxed">
              Conformément au RGPD, vous disposez des droits suivants sur vos données :
            </p>
            <ul className="list-disc list-inside text-[#6C757D] space-y-1 mt-2 ml-4 text-sm">
              <li>Droit d'accès et de rectification</li>
              <li>Droit à l'effacement (« droit à l'oubli »)</li>
              <li>Droit à la portabilité</li>
              <li>Droit d'opposition au traitement</li>
              <li>Droit à la limitation du traitement</li>
            </ul>
            <p className="text-[#6C757D] leading-relaxed mt-3">
              Pour exercer ces droits, contactez : <a href="mailto:privacy@artisandispo.fr" className="text-[#FF6B00] hover:underline">privacy@artisandispo.fr</a>
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">10.3 Suppression de compte et rétention</h3>
            <p className="text-[#6C757D] leading-relaxed">
              Lors d'une demande de suppression de compte, les données sont d'abord marquées comme supprimées (désactivation du compte) et conservées pendant une période de <strong className="text-[#2C3E50]">30 jours</strong> permettant la récupération en cas d'erreur. À l'issue de ce délai, les données sont <strong className="text-[#2C3E50]">supprimées définitivement et irrémédiablement</strong> de nos systèmes, conformément au Règlement (UE) 2016/679.
            </p>
            <p className="text-[#6C757D] leading-relaxed mt-2">
              Certaines données peuvent être conservées au-delà de ce délai pour des obligations légales (comptabilité, litiges en cours).
            </p>

            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2 mt-5">10.4 Sous-traitants</h3>
            <p className="text-[#6C757D] leading-relaxed">
              ArtisanDispo utilise les sous-traitants suivants, qui traitent des données personnelles dans le cadre de la fourniture du service :
            </p>
            <ul className="list-disc list-inside text-[#6C757D] space-y-1 mt-2 ml-4 text-sm">
              <li><strong>Google Firebase</strong> — Authentification, base de données, stockage</li>
              <li><strong>Stripe</strong> — Traitement des paiements</li>
            </ul>
          </section>

          <hr className="border-[#E9ECEF]" />

          {/* Section 11 */}
          <section id="propriete">
            <h2 className="text-2xl font-bold text-[#2C3E50] mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#FF6B00] text-white text-sm flex items-center justify-center font-bold flex-shrink-0">11</span>
              Propriété intellectuelle
            </h2>
            <p className="text-[#6C757D] leading-relaxed">
              L'ensemble des éléments de la plateforme ArtisanDispo (logo, interface, textes, algorithmes, base de données, code source, marque) est protégé par le droit de la propriété intellectuelle et appartient exclusivement à ArtisanDispo SAS ou à ses concédants de licence.
            </p>
            <p className="text-[#6C757D] leading-relaxed mt-2">
              Toute reproduction, extraction, représentation, modification ou exploitation sans autorisation écrite préalable est strictement interdite et constitue une contrefaçon passible de sanctions civiles et pénales.
            </p>
          </section>

          <hr className="border-[#E9ECEF]" />

          {/* Section 12 */}
          <section id="modifications">
            <h2 className="text-2xl font-bold text-[#2C3E50] mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#FF6B00] text-white text-sm flex items-center justify-center font-bold flex-shrink-0">12</span>
              Modifications des CGU
            </h2>
            <p className="text-[#6C757D] leading-relaxed">
              ArtisanDispo se réserve le droit de modifier les présentes CGU à tout moment. Les utilisateurs seront informés de toute modification substantielle par e-mail et par une notification sur la plateforme.
            </p>
            <p className="text-[#6C757D] leading-relaxed mt-2">
              La poursuite de l'utilisation de la plateforme après modification vaut acceptation des nouvelles CGU. En cas de refus, l'utilisateur doit cesser d'utiliser la plateforme et peut demander la suppression de son compte.
            </p>
          </section>

          <hr className="border-[#E9ECEF]" />

          {/* Section 13 */}
          <section id="droit">
            <h2 className="text-2xl font-bold text-[#2C3E50] mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#FF6B00] text-white text-sm flex items-center justify-center font-bold flex-shrink-0">13</span>
              Droit applicable et juridiction
            </h2>
            <p className="text-[#6C757D] leading-relaxed">
              Les présentes CGU sont régies par le <strong className="text-[#2C3E50]">droit français</strong>. En cas de litige relatif à l'interprétation ou à l'exécution des présentes, les parties s'efforceront de trouver un règlement amiable. À défaut, les tribunaux compétents du ressort du siège social d'ArtisanDispo SAS seront seuls compétents.
            </p>
            <p className="text-[#6C757D] leading-relaxed mt-2">
              Pour les consommateurs résidant dans l'Union Européenne, la Commission Européenne met à disposition une plateforme de résolution des litiges en ligne :{' '}
              <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-[#FF6B00] hover:underline">
                ec.europa.eu/consumers/odr
              </a>.
            </p>
          </section>

          {/* Contact */}
          <div className="bg-[#F8F9FA] rounded-xl p-6 border border-[#E9ECEF]">
            <h3 className="font-bold text-[#2C3E50] mb-3">Contact</h3>
            <p className="text-[#6C757D] text-sm mb-3">Pour toute question relative aux présentes CGU :</p>
            <div className="space-y-1 text-sm text-[#6C757D]">
              <p><strong>ArtisanDispo SAS</strong></p>
              <p>E-mail : <a href="mailto:contact@artisandispo.fr" className="text-[#FF6B00] hover:underline">contact@artisandispo.fr</a></p>
              <p>Données personnelles : <a href="mailto:privacy@artisandispo.fr" className="text-[#FF6B00] hover:underline">privacy@artisandispo.fr</a></p>
            </div>
          </div>

          {/* Date mise à jour */}
          <div className="pt-4 border-t border-[#E9ECEF] text-sm text-[#6C757D] flex justify-between items-center">
            <p>Dernière mise à jour : 3 avril 2026 — Version 2.0</p>
            <p>© 2026 ArtisanDispo SAS</p>
          </div>
        </div>

        {/* Navigation */}
        <div className="mt-8 flex flex-wrap gap-4 justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[#2C3E50] hover:text-[#FF6B00] font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour à l'accueil
          </Link>
          <Link
            href="/confiance/conditions-generales"
            className="inline-flex items-center gap-2 text-[#6C757D] hover:text-[#FF6B00] font-medium transition-colors text-sm"
          >
            Version simplifiée
          </Link>
        </div>
      </div>
    </div>
  );
}
