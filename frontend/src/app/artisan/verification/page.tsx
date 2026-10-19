'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/auth-service';
import { useLanguage } from '@/contexts/LanguageContext';
import { getArtisanByUserId, updateArtisan } from '@/lib/firebase/artisan-service';
import { verifySiret, updateSiretVerification } from '@/lib/firebase/verification-service';
import { artisanDoitDecennale } from '@/lib/decennale-helper';
import type { Artisan } from '@/types/firestore';

export default function VerificationPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false); // Changé à false pour affichage immédiat
  const [artisan, setArtisan] = useState<Artisan | null>(null);
  
  // États pour la vérification SIRET
  const [siretStatus, setSiretStatus] = useState<'pending' | 'verifying' | 'success' | 'error'>('pending');
  const [siretError, setSiretError] = useState('');
  const [sireneData, setSireneData] = useState<{
    raisonSociale?: string;
    adresse?: string;
    activite?: string;
    siret?: string;
  } | null>(null);

  // ✅ Protection contre appels multiples
  const isLoadingRef = useRef(false);

  useEffect(() => {
    // ✅ Protection contre double chargement
    if (!isLoadingRef.current) {
      isLoadingRef.current = true;
      loadArtisan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Exécuter une seule fois au montage

  const loadArtisan = async () => {
    try {
      const user = authService.getCurrentUser();
      if (!user) {
        router.push('/connexion');
        isLoadingRef.current = false;
        return;
      }

      // Charger depuis le cache d'abord pour affichage IMMÉDIAT
      const cachedData = localStorage.getItem(`artisan_${user.uid}`);
      if (cachedData) {
        try {
          const cached = JSON.parse(cachedData);
          setArtisan(cached);
          // Ne pas mettre setLoading(false) ici car déjà à false par défaut
        } catch (e) {
          console.warn('Cache invalide, rechargement depuis Firestore');
        }
      }

      // Si pas de cache, on affiche quand même la page avec un skeleton
      if (!cachedData) {
        setLoading(true); // Seulement si pas de cache
      }

      // Puis recharger depuis Firestore en arrière-plan avec timeout
      const timeoutPromise = new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 10000) // Timeout de 10s
      );
      
      try {
        const artisanData = await Promise.race([
          getArtisanByUserId(user.uid),
          timeoutPromise
        ]);

        if (!artisanData) {
          router.push('/artisan/profil');
          isLoadingRef.current = false;
          return;
        }

        setArtisan(artisanData);
        // Mettre à jour le cache
        localStorage.setItem(`artisan_${user.uid}`, JSON.stringify(artisanData));
      } catch (error: any) {
        if (error.message === 'Timeout') {
          console.warn('Timeout chargement Firestore, utilisation du cache');
          // Si timeout et pas de cache, afficher un message d'erreur
          if (!cachedData) {
            setSiretError('Erreur de chargement. Veuillez rafraîchir la page.');
          }
        } else {
          console.error('Erreur chargement artisan:', error);
        }
      } finally {
        setLoading(false);
        isLoadingRef.current = false;
      }
    } catch (error) {
      console.error('Erreur critique:', error);
      setLoading(false);
      isLoadingRef.current = false;
    }
  };

  const handleVerifySiret = async () => {
    if (!artisan) return;
    
    // Vérifier que la raison sociale est présente
    if (!artisan.raisonSociale || artisan.raisonSociale.trim().length < 2) {
      setSiretStatus('error');
      setSiretError('Raison sociale manquante dans votre profil. Veuillez compléter votre profil.');
      return;
    }
    
    console.log('🔍 [Page] Lancement vérification SIRET:', {
      siret: artisan.siret,
      raisonSociale: artisan.raisonSociale,
      userId: artisan.userId
    });
    
    setSiretStatus('verifying');
    setSiretError('');
    
    try {
      // Vérification complète : SIRET + Raison sociale
      const result = await verifySiret(artisan.siret, artisan.raisonSociale);
      
      console.log('📊 [Page] Résultat vérification:', result);
      
      if (result.valid) {
        console.log('✅ [Page] Mise à jour Firestore avec:', {
          companyName: result.companyName,
          legalForm: result.legalForm
        });
        
        // Stocker les données SIRENE pour affichage
        setSireneData({
          raisonSociale: result.companyName,
          adresse: result.adresse,
          activite: result.legalForm,
          siret: artisan.siret
        });
        
        await updateSiretVerification(artisan.userId, true, {
          companyName: result.companyName || '',
          legalForm: result.legalForm || ''
        });
        // Invalider le cache après mise à jour
        const user = authService.getCurrentUser();
        if (user) {
          localStorage.removeItem(`artisan_${user.uid}`);
        }
        setSiretStatus('success');
        // Mise à jour locale de l'état sans recharger Firestore
        setArtisan(prev => prev ? {
          ...prev,
          siretVerified: true,
          raisonSociale: result.companyName || prev.raisonSociale,
          // formeJuridique est de type FormeJuridique, on doit caster
          formeJuridique: (result.legalForm || prev.formeJuridique) as any
        } as Artisan : null);
      } else {
        console.error('❌ [Page] Vérification échouée:', result.error);
        setSiretStatus('error');
        setSiretError(result.error || 'SIRET invalide');
      }
    } catch (error) {
      console.error('❌ [Page] Erreur vérification SIRET:', error);
      setSiretStatus('error');
      setSiretError('Erreur technique');
    }
  };

  // Afficher un skeleton si chargement ET pas de données en cache
  if (loading && !artisan) {
    return (
      <div className="min-h-screen bg-slate-50 py-8">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="mb-8 animate-pulse">
            <div className="h-8 bg-slate-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-slate-200 rounded w-2/3"></div>
          </div>
          <div className="space-y-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-pulse">
                <div className="h-6 bg-slate-200 rounded w-1/4 mb-4"></div>
                <div className="h-4 bg-slate-200 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Si pas de données après chargement, rediriger ou afficher erreur
  if (!artisan && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600 mb-4">{t('artisanVerification.loadingError')}</p>
          <button
            onClick={() => router.back()}
            className="bg-brand-700 text-white px-6 py-2 rounded-lg hover:bg-brand-800"
          >
            {t('artisanVerification.backToDashboard')}
          </button>
        </div>
      </div>
    );
  }

  const siretVerified = artisan?.siretVerified === true;

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-slate-600 hover:text-brand-700 flex items-center gap-2 mb-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('artisanVerification.backToDashboard')}
          </button>
          
          <h1 className="text-3xl font-bold text-slate-900">{t('artisanVerification.pageTitle')}</h1>
          <p className="text-slate-600 mt-2">
            {t('artisanVerification.pageDescription')}
          </p>
        </div>

        {/* Étapes */}
        <div className="space-y-6">
          
          {/* 1. SIRET */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  siretVerified ? 'bg-green-100' : 'bg-orange-100'
                }`}>
                  {siretVerified ? (
                    <span className="text-2xl">✅</span>
                  ) : (
                    <span className="text-2xl">📋</span>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-lg">{t('artisanVerification.siret.title')}</h3>
                  <p className="text-sm text-slate-600">{t('artisanVerification.siret.description')}</p>
                </div>
              </div>
              
              {siretVerified && (
                <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-semibold">
                  {t('artisanVerification.badges.verified')}
                </span>
              )}
            </div>

            {!siretVerified && artisan && (
              <div>
                <div className="bg-orange-50 border-l-4 border-brand-500 p-4 mb-4">
                  <label className="block text-sm text-navy-800 mb-2 font-semibold">
                    <strong>{t('artisanVerification.siret.currentLabel')}</strong>
                  </label>
                  <input
                    type="text"
                    value={artisan.siret}
                    onChange={async (e) => {
                      // Accepter uniquement les chiffres
                      const value = e.target.value.replace(/\D/g, '');
                      // Limiter à 14 chiffres maximum
                      const newSiret = value.slice(0, 14);
                      setArtisan({ ...artisan, siret: newSiret });
                      setSiretStatus('pending');
                      setSiretError('');
                    }}
                    className="w-full border border-slate-300 rounded px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    maxLength={14}
                    disabled={siretStatus === 'verifying'}
                  />
                  <button
                    onClick={async () => {
                      if (!artisan.siret || artisan.siret.length !== 14 || !/^\d{14}$/.test(artisan.siret)) {
                        setSiretError('Vérifiez que votre SIRET est correct et que votre entreprise est active.');
                        return;
                      }
                      setSiretStatus('verifying');
                      setSiretError('');
                      try {
                        // Mettre à jour le SIRET dans Firestore
                        await updateArtisan(artisan.userId, { siret: artisan.siret });
                        setSiretStatus('pending');
                        setSiretError('SIRET mis à jour. Cliquez sur "Vérifier le SIRET" pour valider.');
                      } catch (err: any) {
                        setSiretError('Erreur lors de la mise à jour du SIRET.');
                      }
                    }}
                    className="bg-navy-800 text-white px-4 py-2 rounded mb-2 hover:bg-navy-900 disabled:opacity-50"
                    disabled={siretStatus === 'verifying'}
                  >
                    {t('artisanVerification.siret.updateButton')}
                  </button>
                  <p className="text-xs text-navy-800 mb-3">
                    <strong>{t('artisanVerification.siret.companyNameLabel')}</strong> {artisan.raisonSociale}
                  </p>
                  <p className="text-sm text-navy-800 font-semibold mb-2">
                    {t('artisanVerification.siret.checksTitle')}
                  </p>
                  <ul className="text-sm text-navy-800 list-disc list-inside ml-2 space-y-1">
                    <li>{t('artisanVerification.siret.checks.format')}</li>
                    <li>{t('artisanVerification.siret.checks.status')}</li>
                    <li>{t('artisanVerification.siret.checks.legalInfo')}</li>
                    <li>{t('artisanVerification.siret.checks.matching')}</li>
                  </ul>
                </div>

                {siretError && (
                  <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
                    <p className="text-sm text-red-700 font-semibold">❌ {siretError}</p>
                  </div>
                )}

                {siretStatus === 'success' && (
                  <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-4">
                    <p className="text-sm text-green-700 font-semibold mb-3">✅ {t('artisanVerification.siret.successTitle')}</p>
                    <p className="text-xs text-green-600 mb-3">
                      {t('artisanVerification.siret.successDescription')}
                    </p>
                    {sireneData && (
                      <div className="mt-3 pt-3 border-t border-green-200">
                        <p className="text-xs font-semibold text-green-800 mb-2">📊 {t('artisanVerification.siret.sireneDataTitle')}</p>
                        <div className="space-y-1">
                          <p className="text-xs text-green-700">
                            <strong>{t('artisanVerification.siret.sireneLabels.siret')}</strong> {sireneData.siret}
                          </p>
                          <p className="text-xs text-green-700">
                            <strong>{t('artisanVerification.siret.sireneLabels.companyName')}</strong> {sireneData.raisonSociale || t('artisanVerification.siret.notSpecified')}
                          </p>
                          <p className="text-xs text-green-700">
                            <strong>{t('artisanVerification.siret.sireneLabels.address')}</strong> {sireneData.adresse || t('artisanVerification.siret.notSpecified')}
                          </p>
                          <p className="text-xs text-green-700">
                            <strong>{t('artisanVerification.siret.sireneLabels.activity')}</strong> {sireneData.activite || t('artisanVerification.siret.notSpecified')}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handleVerifySiret}
                  disabled={siretStatus === 'verifying'}
                  className="w-full bg-brand-700 text-white py-3 rounded-lg font-semibold hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {siretStatus === 'verifying' ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {t('artisanVerification.siret.verifying')}
                    </span>
                  ) : t('artisanVerification.siret.verifyButton')}
                </button>
              </div>
            )}
          </div>

          {/* 2. TÉLÉPHONE */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-green-100">
                  <span className="text-2xl">✅</span>
                </div>
                <div>
                  <h3 className="font-bold text-lg">{t('artisanVerification.phone.title')}</h3>
                  <p className="text-sm text-slate-600">{t('artisanVerification.phone.description')}</p>
                </div>
              </div>
              
              <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-semibold">
                {t('artisanVerification.badges.verified')}
              </span>
            </div>
          </div>

          {/* 3. KBIS */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  artisan?.verificationDocuments?.kbis?.verified 
                    ? 'bg-green-100' 
                    : artisan?.verificationDocuments?.kbis?.rejected 
                      ? 'bg-red-100'
                      : artisan?.verificationDocuments?.kbis?.url 
                        ? 'bg-purple-100' 
                        : 'bg-orange-100'
                }`}>
                  <span className="text-2xl">
                    {artisan?.verificationDocuments?.kbis?.verified 
                      ? '✅' 
                      : artisan?.verificationDocuments?.kbis?.rejected 
                        ? '❌'
                        : artisan?.verificationDocuments?.kbis?.url 
                          ? '⏳' 
                          : '📄'}
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-lg">{t('artisanVerification.kbis.title')}</h3>
                  <p className="text-sm text-slate-600">
                    {artisan?.verificationDocuments?.kbis?.verified 
                      ? t('artisanVerification.kbis.verified')
                      : artisan?.verificationDocuments?.kbis?.rejected 
                        ? t('artisanVerification.kbis.rejected')
                        : artisan?.verificationDocuments?.kbis?.url 
                          ? t('artisanVerification.kbis.pending')
                          : t('artisanVerification.kbis.notUploaded')}
                  </p>
                </div>
              </div>
              
              {artisan?.verificationDocuments?.kbis?.verified && (
                <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-semibold">
                  {t('artisanVerification.badges.verified')}
                </span>
              )}
              {artisan?.verificationDocuments?.kbis?.rejected && (
                <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-semibold">
                  {t('artisanVerification.badges.rejected')}
                </span>
              )}
              {artisan?.verificationDocuments?.kbis?.url && !artisan?.verificationDocuments?.kbis?.verified && !artisan?.verificationDocuments?.kbis?.rejected && (
                <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-semibold">
                  {t('artisanVerification.badges.pending')}
                </span>
              )}
            </div>
            
            {artisan?.verificationDocuments?.kbis?.rejected && (
              <div className="bg-red-50 border-l-4 border-red-400 p-3 mb-4">
                <p className="text-sm text-red-700">
                  <strong>{t('artisanVerification.kbis.rejectionReason')}</strong> {artisan.verificationDocuments.kbis.rejectionReason || t('artisanVerification.siret.notSpecified')}
                </p>
              </div>
            )}
            
            {!artisan?.verificationDocuments?.kbis?.url && (
              <button
                onClick={() => router.push('/artisan/documents')}
                className="mt-2 w-full bg-brand-700 text-white py-2 rounded-lg hover:bg-brand-800 font-semibold"
              >
                {t('artisanVerification.kbis.uploadButton')}
              </button>
            )}
            {artisan?.verificationDocuments?.kbis?.rejected && (
              <button
                onClick={() => router.push('/artisan/documents')}
                className="w-full bg-brand-700 text-white py-2 rounded-lg hover:bg-brand-800 font-semibold"
              >
                {t('artisanVerification.kbis.reuploadButton')}
              </button>
            )}
          </div>

          {/* 4. Pièce d'identité */}
                    {/* 5. Garantie Responsabilité Civile Professionnelle */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            artisan?.verificationDocuments?.rcPro?.verified 
                              ? 'bg-green-100' 
                              : artisan?.verificationDocuments?.rcPro?.rejected 
                                ? 'bg-red-100'
                                : artisan?.verificationDocuments?.rcPro?.url 
                                  ? 'bg-purple-100' 
                                  : 'bg-orange-100'
                          }`}>
                            <span className="text-2xl">
                              {artisan?.verificationDocuments?.rcPro?.verified 
                                ? '✅' 
                                : artisan?.verificationDocuments?.rcPro?.rejected 
                                  ? '❌'
                                  : artisan?.verificationDocuments?.rcPro?.url 
                                    ? '⏳' 
                                    : '📄'}
                            </span>
                          </div>
                          <div>
                            <h3 className="font-bold text-lg">{t('artisanVerification.rcPro.title')}</h3>
                            <p className="text-sm text-slate-600">
                              {artisan?.verificationDocuments?.rcPro?.verified 
                                ? t('artisanVerification.rcPro.verified')
                                : artisan?.verificationDocuments?.rcPro?.rejected 
                                  ? t('artisanVerification.rcPro.rejected')
                                  : artisan?.verificationDocuments?.rcPro?.url 
                                    ? t('artisanVerification.rcPro.pending')
                                    : t('artisanVerification.rcPro.notUploaded')}
                            </p>
                          </div>
                        </div>
                        {artisan?.verificationDocuments?.rcPro?.verified && (
                          <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-semibold">
                            {t('artisanVerification.badges.verified')}
                          </span>
                        )}
                        {artisan?.verificationDocuments?.rcPro?.rejected && (
                          <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-semibold">
                            {t('artisanVerification.badges.rejected')}
                          </span>
                        )}
                        {artisan?.verificationDocuments?.rcPro?.url && !artisan?.verificationDocuments?.rcPro?.verified && !artisan?.verificationDocuments?.rcPro?.rejected && (
                          <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-semibold">
                            {t('artisanVerification.badges.pending')}
                          </span>
                        )}
                      </div>
                      {artisan?.verificationDocuments?.rcPro?.rejected && (
                        <div className="bg-red-50 border-l-4 border-red-400 p-3 mb-4">
                          <p className="text-sm text-red-700">
                            <strong>{t('artisanVerification.rcPro.rejectionReason')}</strong> {artisan.verificationDocuments.rcPro.rejectionReason || t('artisanVerification.siret.notSpecified')}
                          </p>
                        </div>
                      )}
                      {!artisan?.verificationDocuments?.rcPro?.url && (
                        <button
                          onClick={() => router.push('/artisan/documents')}
                          className="mt-2 w-full bg-brand-700 text-white py-2 rounded-lg hover:bg-brand-800 font-semibold"
                        >
                          {t('artisanVerification.rcPro.uploadButton')}
                        </button>
                      )}
                      {artisan?.verificationDocuments?.rcPro?.rejected && (
                        <button
                          onClick={() => router.push('/artisan/documents')}
                          className="w-full bg-brand-700 text-white py-2 rounded-lg hover:bg-brand-800 font-semibold"
                        >
                          {t('artisanVerification.rcPro.reuploadButton')}
                        </button>
                      )}
                    </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  artisan?.verificationDocuments?.idCard?.verified 
                    ? 'bg-green-100' 
                    : artisan?.verificationDocuments?.idCard?.rejected 
                      ? 'bg-red-100'
                      : artisan?.verificationDocuments?.idCard?.url 
                        ? 'bg-purple-100' 
                        : 'bg-orange-100'
                }`}>
                  <span className="text-2xl">
                    {artisan?.verificationDocuments?.idCard?.verified 
                      ? '✅' 
                      : artisan?.verificationDocuments?.idCard?.rejected 
                        ? '❌'
                        : artisan?.verificationDocuments?.idCard?.url 
                          ? '⏳' 
                          : '🆔'}
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-lg">{t('artisanVerification.idCard.title')}</h3>
                  <p className="text-sm text-slate-600">
                    {artisan?.verificationDocuments?.idCard?.verified 
                      ? t('artisanVerification.idCard.verified')
                      : artisan?.verificationDocuments?.idCard?.rejected 
                        ? t('artisanVerification.idCard.rejected')
                        : artisan?.verificationDocuments?.idCard?.url 
                          ? t('artisanVerification.idCard.pending')
                          : t('artisanVerification.idCard.notUploaded')}
                  </p>
                </div>
              </div>
              
              {artisan?.verificationDocuments?.idCard?.verified && (
                <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-semibold">
                  {t('artisanVerification.badges.verified')}
                </span>
              )}
              {artisan?.verificationDocuments?.idCard?.rejected && (
                <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-semibold">
                  {t('artisanVerification.badges.rejected')}
                </span>
              )}
              {artisan?.verificationDocuments?.idCard?.url && !artisan?.verificationDocuments?.idCard?.verified && !artisan?.verificationDocuments?.idCard?.rejected && (
                <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-semibold">
                  {t('artisanVerification.badges.pending')}
                </span>
              )}
            </div>
            
            {artisan?.verificationDocuments?.idCard?.rejected && (
              <div className="bg-red-50 border-l-4 border-red-400 p-3 mb-4">
                <p className="text-sm text-red-700">
                  <strong>{t('artisanVerification.idCard.rejectionReason')}</strong> {artisan.verificationDocuments.idCard.rejectionReason || t('artisanVerification.siret.notSpecified')}
                </p>
              </div>
            )}
            
            {!artisan?.verificationDocuments?.idCard?.url && (
              <button
                onClick={() => router.push('/artisan/documents')}
                className="mt-2 w-full bg-brand-700 text-white py-2 rounded-lg hover:bg-brand-800 font-semibold"
              >
                {t('artisanVerification.idCard.uploadButton')}
              </button>
            )}
            {artisan?.verificationDocuments?.idCard?.rejected && (
              <button
                onClick={() => router.push('/artisan/documents')}
                className="w-full bg-brand-700 text-white py-2 rounded-lg hover:bg-brand-800 font-semibold"
              >
                {t('artisanVerification.idCard.reuploadButton')}
              </button>
            )}
          </div>
        </div>


        {/* Section décennale (affichage conditionnel selon métiers) */}
        {artisan && (
          <>
            {/* Cas 1 : Métiers renseignés ET nécessitent décennale → Section obligatoire */}
            {artisan.metiers && artisan.metiers.length > 0 && artisanDoitDecennale(artisan.metiers) && (
              <section className="mt-8 p-6 border-2 border-brand-500 rounded-lg bg-white">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-3xl">🛡️</span>
                  <h3 className="font-bold text-lg text-brand-700">
                    {t('artisanVerification.decennale.titleRequired')} <span className="text-amber-500">{t('artisanVerification.decennale.required')}</span>
                  </h3>
                </div>
                <p className="text-slate-500 mb-4">
                  {t('artisanVerification.decennale.description')}
                </p>

                {/* Statut du document */}
                <div className="mb-4">
                  {artisan.verificationDocuments?.decennale?.verified ? (
                    <div className="p-3 bg-green-700 bg-opacity-10 border border-green-600 rounded">
                      <span className="text-green-700 font-semibold">{t('artisanVerification.decennale.validated')}</span>
                    </div>
                  ) : artisan.verificationDocuments?.decennale?.rejected ? (
                    <div className="p-3 bg-red-700 bg-opacity-10 border border-red-600 rounded">
                      <span className="text-red-700 font-semibold">{t('artisanVerification.decennale.rejected')}</span>
                      <p className="text-sm mt-2">
                        <strong>{t('artisanVerification.decennale.rejectionReason')}</strong> {artisan.verificationDocuments.decennale.rejectionReason || t('artisanVerification.siret.notSpecified')}
                      </p>
                    </div>
                  ) : artisan.verificationDocuments?.decennale?.url ? (
                    <div className="p-3 bg-amber-400 bg-opacity-10 border border-amber-400 rounded">
                      <span className="text-amber-500 font-semibold">{t('artisanVerification.decennale.pending')}</span>
                    </div>
                  ) : (
                    <div className="p-3 bg-brand-700 bg-opacity-10 border border-brand-500 rounded">
                      <span className="text-brand-700 font-semibold">{t('artisanVerification.decennale.notUploaded')}</span>
                    </div>
                  )}
                </div>

                {/* TODO: Bouton/zone d'upload, historique, etc. */}
              </section>
            )}

            {/* Cas 2 : Métiers non renseignés → Message informatif */}
            {(!artisan.metiers || artisan.metiers.length === 0) && (
              <section className="mt-8 p-6 border border-slate-200 rounded-lg bg-slate-50">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">ℹ️</span>
                  <h3 className="font-bold text-lg text-navy-800">{t('artisanVerification.decennale.infoTitle')}</h3>
                </div>
                <p className="text-slate-500" dangerouslySetInnerHTML={{ __html: t('artisanVerification.decennale.infoDescription') }} />
              </section>
            )}

            {/* Cas 3 : Métiers renseignés mais ne nécessitent PAS décennale → Rien à afficher */}
          </>
        )}
      </div>
    </div>
  );
}
