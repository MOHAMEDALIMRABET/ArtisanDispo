'use client';

/**
 * Page Contact Support - Artisan
 * Permet aux artisans de créer des tickets de support
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  createSupportTicket,
  getUserSupportTickets,
  getCategorieLabel,
  getStatutColor,
  type SupportTicket,
  type SupportTicketCategorie,
} from '@/lib/firebase/support-ticket-service';

export default function ContactSupportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();

  // Formulaire
  const [categorie, setCategorie] = useState<SupportTicketCategorie>('autre');
  const [sujet, setSujet] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Historique tickets
  const [mesTickets, setMesTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);

  // Pré-remplir catégorie si passée en URL
  useEffect(() => {
    const categorieParam = searchParams.get('sujet') as SupportTicketCategorie;
    const categories: SupportTicketCategorie[] = [
      'modification_iban',
      'compte_restreint',
      'verification_documents',
      'probleme_technique',
      'question_generale',
      'autre',
    ];

    if (categorieParam && categories.includes(categorieParam)) {
      setCategorie(categorieParam);

      // Pré-remplir sujet selon catégorie
      const sujets: Record<string, string> = {
        modification_iban: 'Modification de mon IBAN',
        compte_restreint: 'Mon compte Stripe est restreint',
        verification_documents: 'Question sur la vérification de mes documents',
      };

      setSujet(sujets[categorieParam] || '');
    }
  }, [searchParams]);

  // Charger tickets existants
  useEffect(() => {
    if (!user) return;

    const loadTickets = async () => {
      try {
        const tickets = await getUserSupportTickets(user.uid);
        setMesTickets(tickets);
      } catch (error) {
        console.error('Erreur chargement tickets:', error);
      } finally {
        setLoadingTickets(false);
      }
    };

    loadTickets();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      alert('❌ Vous devez être connecté');
      return;
    }

    if (!sujet.trim() || !message.trim()) {
      alert('❌ Veuillez remplir tous les champs');
      return;
    }

    setSubmitting(true);

    try {
      // Récupérer nom utilisateur
      const userDoc = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/${user.uid}`);
      const userData = await userDoc.json();
      const userNom = `${userData.prenom || ''} ${userData.nom || ''}`.trim() || user.email || 'Artisan';

      await createSupportTicket({
        userId: user.uid,
        userEmail: user.email || '',
        userNom,
        userRole: 'artisan',
        categorie,
        sujet,
        message,
        priorite: categorie === 'compte_restreint' ? 'haute' : 'normale',
      });

      // Success
      setShowSuccess(true);
      setSujet('');
      setMessage('');

      // Recharger tickets
      const tickets = await getUserSupportTickets(user.uid);
      setMesTickets(tickets);

      // Auto-dismiss après 5 secondes
      setTimeout(() => setShowSuccess(false), 5000);
    } catch (error) {
      console.error('Erreur création ticket:', error);
      alert('❌ Erreur lors de l\'envoi. Veuillez réessayer ou contacter support@artisandispo.fr');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto mb-4"></div>
          <p className="text-slate-500">{t('artisanSupport.loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    router.push('/connexion');
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-slate-500 hover:text-navy-800 mb-4 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('artisanSupport.backButton')}
          </button>

          <h1 className="text-3xl font-bold text-navy-800 mb-2">
            {t('artisanSupport.pageTitle')}
          </h1>
          <p className="text-slate-500" dangerouslySetInnerHTML={{ __html: t('artisanSupport.pageSubtitle') }} />
        </div>

        {/* Message succès */}
        {showSuccess && (
          <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-6 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-green-800 font-semibold mb-1">{t('artisanSupport.success.title')}</h3>
                <p className="text-green-700 text-sm">
                  {t('artisanSupport.success.description')}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          {/* Formulaire (2/3) */}
          <div className="md:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-xl font-semibold text-navy-800 mb-4">
                {t('artisanSupport.form.title')}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Catégorie */}
                <div>
                  <label className="block text-sm font-medium text-navy-800 mb-2">
                    {t('artisanSupport.form.categoryLabel')} <span className="text-red-500">{t('artisanSupport.form.required')}</span>
                  </label>
                  <select
                    value={categorie}
                    onChange={(e) => setCategorie(e.target.value as SupportTicketCategorie)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    required
                  >
                    <option value="modification_iban">{t('artisanSupport.form.categories.modification_iban')}</option>
                    <option value="compte_restreint">{t('artisanSupport.form.categories.compte_restreint')}</option>
                    <option value="verification_documents">{t('artisanSupport.form.categories.verification_documents')}</option>
                    <option value="probleme_technique">{t('artisanSupport.form.categories.probleme_technique')}</option>
                    <option value="question_generale">{t('artisanSupport.form.categories.question_generale')}</option>
                    <option value="autre">{t('artisanSupport.form.categories.autre')}</option>
                  </select>
                </div>

                {/* Sujet */}
                <div>
                  <label className="block text-sm font-medium text-navy-800 mb-2">
                    {t('artisanSupport.form.subjectLabel')} <span className="text-red-500">{t('artisanSupport.form.required')}</span>
                  </label>
                  <input
                    type="text"
                    value={sujet}
                    onChange={(e) => setSujet(e.target.value)}
                    placeholder={t('artisanSupport.form.subjectPlaceholder')}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    maxLength={150}
                    required
                  />
                  <p className="text-xs text-slate-500 mt-1">{t('artisanSupport.form.subjectCounter').replace('{count}', String(sujet.length))}</p>
                </div>

                {/* Message */}
                <div>
                  <label className="block text-sm font-medium text-navy-800 mb-2">
                    {t('artisanSupport.form.messageLabel')} <span className="text-red-500">{t('artisanSupport.form.required')}</span>
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t('artisanSupport.form.messagePlaceholder')}
                    rows={8}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                    maxLength={2000}
                    required
                  />
                  <p className="text-xs text-slate-500 mt-1">{t('artisanSupport.form.messageCounter').replace('{count}', String(message.length))}</p>
                </div>

                {/* Info importante */}
                {categorie === 'modification_iban' && (
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                    <p className="text-blue-800 text-sm" dangerouslySetInnerHTML={{ __html: t('artisanSupport.form.ibanInfo') }} />
                  </div>
                )}

                {/* Boutons */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={submitting || !sujet.trim() || !message.trim()}
                    className="flex-1 bg-brand-700 text-white px-6 py-3 rounded-lg font-semibold hover:bg-brand-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
                  >
                    {submitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {t('artisanSupport.form.submitting')}
                      </span>
                    ) : (
                      t('artisanSupport.form.submitButton')
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="px-6 py-3 border-2 border-slate-300 text-slate-500 rounded-lg font-semibold hover:bg-slate-50 transition"
                  >
                    {t('artisanSupport.form.cancelButton')}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Mes tickets (1/3) */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-navy-800 mb-4">
                {t('artisanSupport.myTickets.title')}
              </h2>

              {loadingTickets ? (
                <p className="text-slate-500 text-sm text-center py-4">{t('artisanSupport.myTickets.loading')}</p>
              ) : mesTickets.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">
                  {t('artisanSupport.myTickets.empty')}
                </p>
              ) : (
                <div className="space-y-3">
                  {mesTickets.slice(0, 5).map((ticket) => (
                    <div
                      key={ticket.id}
                      className="border border-slate-200 rounded-lg p-3 hover:border-brand-500 transition cursor-pointer"
                      onClick={() => router.push(`/artisan/contact-support/${ticket.id}`)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-xs font-mono text-slate-500">{ticket.numero}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${getStatutColor(ticket.statut)}`}>
                          {ticket.statut}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-navy-800 mb-1 line-clamp-1">
                        {ticket.sujet}
                      </p>
                      <p className="text-xs text-slate-500">
                        {getCategorieLabel(ticket.categorie)}
                      </p>
                      {ticket.nonLuParUser && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-brand-700 font-semibold">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                          </svg>
                          {t('artisanSupport.myTickets.newResponse')}
                        </div>
                      )}
                    </div>
                  ))}

                  {mesTickets.length > 5 && (
                    <button
                      onClick={() => router.push('/artisan/mes-tickets')}
                      className="w-full text-brand-700 hover:underline text-sm font-medium py-2"
                    >
                      {t('artisanSupport.myTickets.viewAll').replace('{count}', String(mesTickets.length))}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Info utile */}
            <div className="bg-blue-50 rounded-lg p-4 mt-4">
              <h3 className="font-semibold text-navy-800 mb-2 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                {t('artisanSupport.info.title')}
              </h3>
              <ul className="text-sm text-slate-500 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-green-600 flex-shrink-0">✓</span>
                  <span>{t('artisanSupport.info.response')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 flex-shrink-0">✓</span>
                  <span>{t('artisanSupport.info.notification')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 flex-shrink-0">✓</span>
                  <span>{t('artisanSupport.info.tracking')}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
